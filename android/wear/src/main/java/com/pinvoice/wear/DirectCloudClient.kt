package com.pinvoice.wear

import android.util.Base64
import com.pinvoice.shared.ClinicalRenderer
import com.pinvoice.shared.ClinicalTemplate
import com.pinvoice.shared.DefaultTemplates
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.TimeUnit

@Serializable
private data class WearParsedBlock(val blockId: String, val content: String)

@Serializable
private data class WearGeminiResult(
    val selectedTemplateId: String,
    val selectionMode: String = "auto",
    val patientLabel: String = "",
    val blocks: List<WearParsedBlock> = emptyList(),
)

/**
 * Pipeline direto e autônomo do Smartwatch:
 * Relógio (.m4a 16kbps) -> Gemini API (thinkingBudget=0 + fallback) -> Supabase (modo pessoal) -> Web/Celular.
 */
class DirectCloudClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(18, TimeUnit.SECONDS)
        .writeTimeout(18, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    // Cadeia testada ao vivo (4 pools independentes, 1.4s-3.1s, sem 429 do preview)
    private val fallbackModels = listOf(
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
    )

    private fun compactBlockHint(blockId: String, hint: String): String = when (blockId) {
        "exame_fisico", "objetivo" -> if (hint.contains("RESTRITO", ignoreCase = true)) {
            "EF RESTRITO: somente o descrito no áudio (FO/drenos se citados)."
        } else {
            "EF COMPLETO (6 linhas: Geral, Neuro, ACV, AR, ABD, EXT; fisiológico nos não citados)."
        }
        "hipoteses", "avaliacao" -> "Lista numerada (1., 2., 3.) com subitens a), b), c)."
        "condutas" -> "Manejo por problema (fármaco/dose/via/dia ATB só se falado; alertas em CAIXA ALTA)."
        "pendencias" -> "Lista com hífen (- ...) de exames, pareceres e reavaliações."
        "antecedentes" -> "Comorbidades, medicações habituais, pareceres, HF e hábitos (só o citado)."
        else -> if (hint.length > 140) hint.take(137) + "..." else hint
    }

    private fun compactCatalogJson(templates: List<ClinicalTemplate>): String =
        buildJsonArray {
            for (tpl in templates) {
                add(buildJsonObject {
                    put("id", tpl.id)
                    put("name", tpl.name)
                    if (tpl.voiceTriggers.isNotEmpty()) {
                        put("voice", buildJsonArray { tpl.voiceTriggers.forEach { add(JsonPrimitive(it)) } })
                    }
                    if (tpl.clinicalKeywords.isNotEmpty()) {
                        put("kw", buildJsonArray { tpl.clinicalKeywords.forEach { add(JsonPrimitive(it)) } })
                    }
                    put("blocks", buildJsonArray {
                        tpl.blocks.filter { it.enabled }.forEach { b ->
                            add(buildJsonObject {
                                put("id", b.id)
                                put("title", b.title)
                                put("hint", compactBlockHint(b.id, b.hint))
                            })
                        }
                    })
                })
            }
        }.toString()

    private fun buildPayload(
        systemText: String,
        audioBase64: String,
        includeThinkingZero: Boolean,
    ): String = buildJsonObject {
        put("systemInstruction", buildJsonObject {
            put("parts", buildJsonArray { add(buildJsonObject { put("text", systemText) }) })
        })
        put("contents", buildJsonArray {
            add(buildJsonObject {
                put("role", "user")
                put("parts", buildJsonArray {
                    add(buildJsonObject {
                        put("inlineData", buildJsonObject {
                            put("mimeType", "audio/mp4")
                            put("data", audioBase64)
                        })
                    })
                    add(buildJsonObject {
                        put("text", "Ouça o áudio clínico, aplique diarização, escolha o template e retorne apenas JSON.")
                    })
                })
            })
        })
        put("generationConfig", buildJsonObject {
            put("temperature", 0.15)
            put("responseMimeType", "application/json")
            if (includeThinkingZero) {
                put("thinkingConfig", buildJsonObject { put("thinkingBudget", 0) })
            }
            put("responseSchema", buildJsonObject {
                put("type", "OBJECT")
                put("properties", buildJsonObject {
                    put("selectedTemplateId", buildJsonObject { put("type", "STRING") })
                    put("selectionMode", buildJsonObject {
                        put("type", "STRING")
                        put("enum", buildJsonArray {
                            add(JsonPrimitive("manual"))
                            add(JsonPrimitive("voice"))
                            add(JsonPrimitive("auto"))
                        })
                    })
                    put("patientLabel", buildJsonObject { put("type", "STRING") })
                    put("blocks", buildJsonObject {
                        put("type", "ARRAY")
                        put("items", buildJsonObject {
                            put("type", "OBJECT")
                            put("properties", buildJsonObject {
                                put("blockId", buildJsonObject { put("type", "STRING") })
                                put("content", buildJsonObject { put("type", "STRING") })
                            })
                            put("required", buildJsonArray {
                                add(JsonPrimitive("blockId"))
                                add(JsonPrimitive("content"))
                            })
                        })
                    })
                })
                put("required", buildJsonArray {
                    add(JsonPrimitive("selectedTemplateId"))
                    add(JsonPrimitive("selectionMode"))
                    add(JsonPrimitive("patientLabel"))
                    add(JsonPrimitive("blocks"))
                })
            })
        })
    }.toString()

    internal fun shouldSendThinkingZero(model: String): Boolean =
        !model.contains("flash-lite", ignoreCase = true)

    fun processAndPublish(audioFile: File): Boolean {
        val apiKey = BuildConfig.GEMINI_API_KEY.trim()
        val sbUrl = BuildConfig.SUPABASE_URL.trim().trimEnd('/')
        val sbKey = BuildConfig.SUPABASE_ANON_KEY.trim()
        require(apiKey.isNotBlank()) { "Gemini API Key não configurada no build." }
        require(sbUrl.isNotBlank() && sbKey.isNotBlank()) { "Supabase não configurado no build." }

        val templates = DefaultTemplates.all
        val audioBase64 = Base64.encodeToString(audioFile.readBytes(), Base64.NO_WRAP)
        val systemText = """
            Motor clínico PinVoice (PT-BR técnico, sem Markdown, sem saudações, sem placeholders).
            1. DIARIZAÇÃO: Médico vs Paciente/Acompanhante.
            2. SELEÇÃO: comando de voz explícito (remova o comando) ou inferência clínica. Siga style do template (CIRÚRGICA EF somente descrito; Clínica/PS/UTI/APS EF completo com fisiológico nos sistemas não citados).
            3. TEXTO ÚNICO INTEGRADO: medicações, dias de ATB, alertas/suspensões (CAIXA ALTA) em CONDUTAS/PROGRAMAÇÃO e exames/pareceres em PENDÊNCIAS (ou P — PLANO na APS).
            4. SEGURANÇA PRESCRITIVA: NUNCA invente dose, via ou intervalo não falado.
            5. ZERO REPETIÇÃO: nunca repita título do bloco nem fatos; quebras \n entre sistemas do EF e itens/subitens.
            6. OMITA blocos vazios.
            TEMPLATES:${compactCatalogJson(templates)}
        """.trimIndent()

        var structured: WearGeminiResult? = null
        var lastError: Exception? = null

        for (model in fallbackModels) {
            val thinkingModes = if (shouldSendThinkingZero(model)) listOf(true, false) else listOf(false)
            for (useThinkingZero in thinkingModes) {
                val payload = buildPayload(systemText, audioBase64, useThinkingZero)
                val req = Request.Builder()
                    .url("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey")
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()
                var retryWithoutThinking = false
                var nonRetryableError: IllegalStateException? = null
                try {
                    http.newCall(req).execute().use { res ->
                        val body = res.body?.string().orEmpty()
                        if (!res.isSuccessful) {
                            if (useThinkingZero && res.code == 400 &&
                                (body.contains("thinking", ignoreCase = true) || body.contains("budget", ignoreCase = true))
                            ) {
                                retryWithoutThinking = true
                                return@use
                            }
                            if (res.code in setOf(404, 429, 503)) {
                                lastError = IllegalStateException("HTTP ${res.code}")
                                return@use
                            }
                            nonRetryableError = IllegalStateException("Gemini HTTP ${res.code}: $body")
                            return@use
                        }
                        val root = json.parseToJsonElement(body).jsonObject
                        val parts = root["candidates"]?.jsonArray
                            ?.firstOrNull()?.jsonObject
                            ?.get("content")?.jsonObject
                            ?.get("parts")?.jsonArray
                        val rawText = parts
                            ?.lastOrNull { part ->
                                val obj = part.jsonObject
                                obj["thought"]?.jsonPrimitive?.content != "true" && obj["text"] != null
                            }
                            ?.jsonObject
                            ?.get("text")?.jsonPrimitive?.content
                            ?: parts?.firstOrNull()?.jsonObject?.get("text")?.jsonPrimitive?.content
                            ?: throw IllegalStateException("Resposta vazia")
                        val cleanText = rawText
                            .trim()
                            .removePrefix("```json")
                            .removePrefix("```")
                            .removeSuffix("```")
                            .trim()
                        structured = json.decodeFromString<WearGeminiResult>(cleanText)
                    }
                    nonRetryableError?.let { throw it }
                    if (structured != null) break
                    if (!retryWithoutThinking) break
                } catch (e: Exception) {
                    if (e === nonRetryableError) throw e
                    lastError = e
                    break
                }
            }
            if (structured != null) break
        }

        val parsed = structured ?: throw (lastError ?: IllegalStateException("Gemini indisponível"))
        val chosenTemplate = templates.firstOrNull { it.id == parsed.selectedTemplateId } ?: templates.first()
        val blockMap = parsed.blocks
            .filter { !ClinicalRenderer.isBlockEmpty(it.content) }
            .associate { it.blockId to it.content.trim() }
        val rendered = ClinicalRenderer.renderEvolutionBlocks(chosenTemplate, blockMap)

        val now = Instant.now()
        val safeMode = when (parsed.selectionMode.lowercase()) {
            "manual" -> "manual"
            "voice" -> "voice"
            else -> "auto"
        }

        val sbPayload = buildJsonObject {
            put("id", UUID.randomUUID().toString())
            put("user_id", "00000000-0000-0000-0000-000000000001")
            put("template_id", chosenTemplate.id)
            put("template_name", chosenTemplate.name)
            put("selection_mode", safeMode)
            put("patient_label", parsed.patientLabel)
            put("blocks_content", buildJsonObject {
                for ((k, v) in blockMap) put(k, v)
            })
            put("rendered_text", rendered)
            put("source_device", "wear")
            put("audio_purged_at", now.toString())
            put("expires_at", now.plus(3650, ChronoUnit.DAYS).toString())
            put("created_at", now.toString())
            put("updated_at", now.toString())
        }.toString()

        val sbReq = Request.Builder()
            .url("$sbUrl/rest/v1/evolutions")
            .addHeader("apikey", sbKey)
            .addHeader("Authorization", "Bearer $sbKey")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "resolution=merge-duplicates")
            .post(sbPayload.toRequestBody("application/json".toMediaType()))
            .build()

        http.newCall(sbReq).execute().use { res ->
            if (!res.isSuccessful) {
                throw IllegalStateException("Supabase HTTP ${res.code}")
            }
        }

        // Sucesso completo -> apaga o áudio local para nunca duplicar
        audioFile.delete()
        return true
    }
}
