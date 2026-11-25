package com.pinvoice.app.network

import android.util.Base64
import com.pinvoice.shared.ClinicalRenderer
import com.pinvoice.shared.ClinicalTemplate
import com.pinvoice.shared.DefaultTemplates
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
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
import java.util.concurrent.TimeUnit

@Serializable
data class ParsedBlock(val blockId: String, val content: String)

@Serializable
data class GeminiStructuredResult(
    val selectedTemplateId: String,
    val selectionMode: String = "auto",
    val patientLabel: String = "",
    val blocks: List<ParsedBlock> = emptyList(),
)

data class ProcessedClinicalResult(
    val template: ClinicalTemplate,
    val selectionMode: String,
    val patientLabel: String,
    val blocksContent: Map<String, String>,
    val renderedText: String,
)

/**
 * Chamada direta BYOK para a API REST multimodal do Gemini com thinkingBudget=0,
 * prompt ultra-compacto, fallback automático contra 503/429/404 e suporte a complemento por voz.
 */
class GeminiApiClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(18, TimeUnit.SECONDS)
        .writeTimeout(18, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    // Cadeia testada ao vivo (4 pools independentes, 1.4s-3.1s)
    private val fallbackModels = listOf(
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
    )

    fun processAudio(
        apiKey: String,
        audioFile: File,
        mimeType: String = "audio/mp4",
        model: String = "gemini-3.5-flash-lite",
        templates: List<ClinicalTemplate> = DefaultTemplates.all,
        lockedTemplateId: String? = null,
    ): ProcessedClinicalResult {
        require(apiKey.isNotBlank()) { "Gemini API Key não configurada." }

        val audioBase64 = Base64.encodeToString(audioFile.readBytes(), Base64.NO_WRAP)
        val systemText = buildSystemInstruction(templates, lockedTemplateId)
        val userParts = buildJsonArray {
            add(buildJsonObject {
                put("inlineData", buildJsonObject {
                    put("mimeType", mimeType)
                    put("data", audioBase64)
                })
            })
            add(buildJsonObject {
                put("text", "Ouça o áudio clínico, aplique diarização, escolha o template e retorne apenas JSON.")
            })
        }

        return executeStructuredCall(
            apiKey = apiKey,
            model = model,
            systemText = systemText,
            userParts = userParts,
            temperature = 0.15,
            templates = templates,
            lockedTemplateId = lockedTemplateId,
        )
    }

    /**
     * Complemento por voz: integra novos achados, exames ou condutas falados em um áudio extra
     * diretamente numa evolução já pronta sem perder o conteúdo existente.
     */
    fun complementAudio(
        apiKey: String,
        audioFile: File,
        existingText: String,
        template: ClinicalTemplate,
        mimeType: String = "audio/mp4",
        model: String = "gemini-3.5-flash-lite",
    ): ProcessedClinicalResult {
        require(apiKey.isNotBlank()) { "Gemini API Key não configurada." }

        val audioBase64 = Base64.encodeToString(audioFile.readBytes(), Base64.NO_WRAP)
        val systemText = buildSystemInstruction(listOf(template), template.id)
        val userParts = buildJsonArray {
            add(buildJsonObject {
                put(
                    "text",
                    "EVOLUÇÃO ATUAL (preserve 100% dos fatos existentes que não forem corrigidos pelo novo áudio):\n$existingText\n\nTAREFA: Ouça o áudio complementar e integre os novos achados, exames, condutas ou correções nos blocos corretos do template \"${template.name}\", mantendo texto único coeso, sem duplicar informações e sem inventar doses/posologias. Retorne o JSON completo atualizado.",
                )
            })
            add(buildJsonObject {
                put("inlineData", buildJsonObject {
                    put("mimeType", mimeType)
                    put("data", audioBase64)
                })
            })
        }

        return executeStructuredCall(
            apiKey = apiKey,
            model = model,
            systemText = systemText,
            userParts = userParts,
            temperature = 0.12,
            templates = listOf(template),
            lockedTemplateId = template.id,
        )
    }

    private class NonRetryableGeminiException(message: String) : IllegalStateException(message)

    private fun extractCandidateJson(bodyStr: String): String {
        val root = json.parseToJsonElement(bodyStr).jsonObject
        val parts = root["candidates"]?.jsonArray
            ?.firstOrNull()?.jsonObject
            ?.get("content")?.jsonObject
            ?.get("parts")?.jsonArray
        val raw = parts
            ?.lastOrNull { part ->
                val obj = part.jsonObject
                val isThought = obj["thought"]?.jsonPrimitive?.content == "true"
                !isThought && obj["text"] != null
            }
            ?.jsonObject
            ?.get("text")?.jsonPrimitive?.content
            ?: parts?.firstOrNull()?.jsonObject?.get("text")?.jsonPrimitive?.content
            ?: throw IllegalStateException("Resposta vazia do Gemini.")

        return raw
            .trim()
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
    }

    internal fun shouldSendThinkingZero(model: String): Boolean =
        !model.contains("flash-lite", ignoreCase = true)

    private fun executeStructuredCall(
        apiKey: String,
        model: String,
        systemText: String,
        userParts: JsonArray,
        temperature: Double,
        templates: List<ClinicalTemplate>,
        lockedTemplateId: String?,
    ): ProcessedClinicalResult {
        val preferred = model.trim().ifEmpty { fallbackModels.first() }
        val candidates = listOf(preferred) + fallbackModels.filter { it != preferred }
        var lastException: Exception? = null

        for (candidateModel in candidates) {
            val thinkingModes = if (shouldSendThinkingZero(candidateModel)) listOf(true, false) else listOf(false)
            for (useThinkingZero in thinkingModes) {
                val payload = buildRequestPayload(
                    systemText = systemText,
                    userParts = userParts,
                    temperature = temperature,
                    includeThinkingZero = useThinkingZero,
                )
                val url = "https://generativelanguage.googleapis.com/v1beta/models/$candidateModel:generateContent?key=${apiKey.trim()}"
                val request = Request.Builder()
                    .url(url)
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()

                var retryWithoutThinking = false
                try {
                    http.newCall(request).execute().use { response ->
                        val bodyStr = response.body?.string().orEmpty()
                        if (!response.isSuccessful) {
                            if (useThinkingZero && response.code == 400 &&
                                (bodyStr.contains("thinking", ignoreCase = true) || bodyStr.contains("budget", ignoreCase = true))
                            ) {
                                retryWithoutThinking = true
                                return@use
                            }
                            val retryable = response.code in setOf(404, 429, 503)
                            val msg = "Gemini HTTP ${response.code} ($candidateModel): $bodyStr"
                            if (retryable) {
                                lastException = IllegalStateException(msg)
                                return@use
                            }
                            throw NonRetryableGeminiException(msg)
                        }

                        val candidateText = extractCandidateJson(bodyStr)
                        val structured = json.decodeFromString<GeminiStructuredResult>(candidateText)
                        val chosenTemplate = templates.firstOrNull { it.id == (lockedTemplateId ?: structured.selectedTemplateId) }
                            ?: templates.first()

                        val blockMap = structured.blocks
                            .filter { !ClinicalRenderer.isBlockEmpty(it.content) }
                            .associate { it.blockId to it.content.trim() }
                        val rendered = ClinicalRenderer.renderEvolutionBlocks(chosenTemplate, blockMap)

                        return ProcessedClinicalResult(
                            template = chosenTemplate,
                            selectionMode = if (lockedTemplateId != null) "manual" else structured.selectionMode,
                            patientLabel = structured.patientLabel,
                            blocksContent = blockMap,
                            renderedText = rendered,
                        )
                    }
                    if (!retryWithoutThinking) break
                } catch (e: NonRetryableGeminiException) {
                    throw e
                } catch (e: Exception) {
                    lastException = e
                    break
                }
            }
        }

        throw lastException ?: IllegalStateException("Todos os modelos Gemini estão indisponíveis.")
    }

    private fun buildRequestPayload(
        systemText: String,
        userParts: JsonArray,
        temperature: Double,
        includeThinkingZero: Boolean,
    ): String = buildJsonObject {
        put("systemInstruction", buildJsonObject {
            put("parts", buildJsonArray {
                add(buildJsonObject { put("text", systemText) })
            })
        })
        put("contents", buildJsonArray {
            add(buildJsonObject {
                put("role", "user")
                put("parts", userParts)
            })
        })
        put("generationConfig", buildJsonObject {
            put("temperature", temperature)
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

    private fun compactBlockHint(blockId: String, hint: String): String = when (blockId) {
        "exame_fisico", "objetivo" -> if (hint.contains("RESTRITO", ignoreCase = true)) {
            "EF RESTRITO: somente o descrito no áudio (FO/drenos se citados)."
        } else {
            "EF COMPLETO (6 linhas: Geral, Neuro, ACV, AR, ABD, EXT; fisiológico nos não citados)."
        }
        "hipoteses", "avaliacao" -> "Lista numerada (1., 2., 3.) com subitens a), b), c) por problema."
        "condutas" -> "Manejo por problema (fármaco/dose/via/dia ATB só se falado; alertas em CAIXA ALTA)."
        "pendencias" -> "Lista com hífen (- ...) de exames, pareceres e reavaliações."
        "antecedentes" -> "Comorbidades, medicações habituais, pareceres, HF e hábitos (só o citado)."
        else -> if (hint.length > 140) hint.take(137) + "..." else hint
    }

    private fun compactCatalogJson(
        templates: List<ClinicalTemplate>,
        lockedTemplateId: String?,
    ): String {
        val relevant = if (lockedTemplateId != null) {
            templates.filter { it.id == lockedTemplateId }.ifEmpty { templates }
        } else {
            templates
        }
        return buildJsonArray {
            for (tpl in relevant) {
                add(buildJsonObject {
                    put("id", tpl.id)
                    put("name", tpl.name)
                    if (lockedTemplateId == null && tpl.voiceTriggers.isNotEmpty()) {
                        put("voice", buildJsonArray { tpl.voiceTriggers.forEach { add(JsonPrimitive(it)) } })
                    }
                    if (lockedTemplateId == null && tpl.clinicalKeywords.isNotEmpty()) {
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
    }

    private fun getStyleRule(lockedTemplateId: String?): String = when (lockedTemplateId) {
        "cirurgica" -> "ESTILO CIRÚRGICA: direto (HDA+evolução juntas) + EF SOMENTE descrito."
        "ps" -> "ESTILO PS: direto (HDA+evolução juntas) + EF COMPLETO fisiológico nos não citados."
        "clinica" -> "ESTILO CLÍNICA: cronológico completo + EF COMPLETO fisiológico nos não citados."
        "uti" -> "ESTILO UTI: direto/cronológico + EF COMPLETO fisiológico nos não citados."
        "aps" -> "ESTILO APS: método SOAP + EF COMPLETO fisiológico nos não citados."
        else -> "ESTILO: CIRÚRGICA direto+EF SOMENTE descrito; PS/CLÍNICA/UTI/APS EF COMPLETO."
    }

    private fun buildSystemInstruction(
        templates: List<ClinicalTemplate>,
        lockedTemplateId: String?,
    ): String {
        val lockRule = if (lockedTemplateId != null) {
            "TRAVA MANUAL: use OBRIGATORIAMENTE \"$lockedTemplateId\" (selectionMode=manual)."
        } else {
            "SELEÇÃO: comando de voz explícito (remova o comando) ou inferência clínica automática."
        }
        val efLine = if (lockedTemplateId == "cirurgica") "" else {
            "\n            EF COMPLETO fisiológico padrão (não citados): Geral: BEG, corado, hidratado, acianótico, anictérico, afebril | Neuro: Glasgow 15, pupilas isofotorreagentes, sem déficits focais | ACV: RCR 2T, BNF, sem sopros | AR: MV+ bilateral sem RA | ABD: Plano, flácido, RHA+, indolor | EXT: Aquecidas, bem perfundidas, TEC < 3s, sem edema, panturrilhas livres."
        }
        return """
            Motor clínico PinVoice (PT-BR técnico, sem Markdown, sem saudações, sem placeholders).
            1. DIARIZAÇÃO: Médico vs Paciente/Acompanhante.
            2. $lockRule ${getStyleRule(lockedTemplateId)}$efLine
            3. TEXTO ÚNICO INTEGRADO: medicações, dias de ATB, alertas/suspensões (CAIXA ALTA) em CONDUTAS/PROGRAMAÇÃO e exames/pareceres em PENDÊNCIAS (ou P — PLANO na APS).
            4. SEGURANÇA PRESCRITIVA: NUNCA invente dose, via ou intervalo não falado.
            5. ZERO REPETIÇÃO: nunca repita título do bloco nem fatos; quebras \n entre sistemas do EF e itens/subitens.
            6. OMITA blocos vazios.
            TEMPLATES:${compactCatalogJson(templates, lockedTemplateId)}
        """.trimIndent()
    }
}
