package com.pinvoice.app.network

import android.content.Context
import com.pinvoice.app.data.EvolutionEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

/**
 * Cliente leve (OkHttp) para sincronização bidirecional exclusiva de TEXTO com o Supabase
 * em Modo Pessoal Direto (sem login/senha).
 * Permite puxar evoluções gravadas no PC e no Relógio, e enviar edições/gravações do celular.
 */
class SupabaseSyncClient(private val context: Context) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }
    private val prefs = context.getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)

    companion object {
        const val DEFAULT_SUPABASE_URL = "https://sqiyhfwdkafbjjsrhghs.supabase.co"
        const val DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_ovqYL0J_ZlT033x2zZaz6g_m5fRSdh5"
        const val PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000001"
    }

    fun normalizeUrl(raw: String): String =
        raw.trim().replace(Regex("/rest/v1/?$", RegexOption.IGNORE_CASE), "").trimEnd('/')

    private fun resolveConfig(): Triple<String, String, String> {
        val baseUrl = normalizeUrl(prefs.getString("sb_url", "").orEmpty().ifBlank { DEFAULT_SUPABASE_URL })
        val anonKey = prefs.getString("sb_anon_key", "").orEmpty().trim().ifBlank { DEFAULT_SUPABASE_ANON_KEY }
        val userId = prefs.getString("sb_user_id", "").orEmpty().ifBlank { PERSONAL_USER_ID }
        return Triple(baseUrl, anonKey, userId)
    }

    fun isConfigured(): Boolean {
        val (url, key, _) = resolveConfig()
        return url.isNotBlank() && key.isNotBlank()
    }

    fun getLastSyncStatus(): String = prefs.getString("sb_last_sync_status", "").orEmpty()

    /**
     * Puxa evoluções da nuvem (gravadas no PC, Relógio ou outro dispositivo).
     */
    fun fetchEvolutions(limit: Int = 100): List<EvolutionEntity> {
        val (baseUrl, anonKey, _) = resolveConfig()
        if (baseUrl.isBlank() || anonKey.isBlank()) return emptyList()

        val req = Request.Builder()
            .url("$baseUrl/rest/v1/evolutions?select=*&order=created_at.desc&limit=$limit")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .get()
            .build()

        http.newCall(req).execute().use { res ->
            val body = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                prefs.edit().putString("sb_last_sync_status", "Erro pull HTTP ${res.code}").apply()
                throw IllegalStateException("Supabase HTTP ${res.code}: ${body.take(120)}")
            }

            val arr = json.parseToJsonElement(body).jsonArray
            val list = arr.mapNotNull { el ->
                runCatching {
                    val obj = el.jsonObject
                    val id = obj["id"]?.jsonPrimitive?.content ?: return@mapNotNull null
                    val createdIso = obj["created_at"]?.jsonPrimitive?.content
                    val purgedIso = obj["audio_purged_at"]?.jsonPrimitive?.content
                    val createdMs = createdIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                        ?: System.currentTimeMillis()
                    val purgedMs = purgedIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                        ?: createdMs

                    EvolutionEntity(
                        id = id,
                        templateId = obj["template_id"]?.jsonPrimitive?.content ?: "clinica",
                        templateName = obj["template_name"]?.jsonPrimitive?.content ?: "Clínica",
                        selectionMode = obj["selection_mode"]?.jsonPrimitive?.content ?: "auto",
                        patientLabel = obj["patient_label"]?.jsonPrimitive?.content ?: "",
                        renderedText = obj["rendered_text"]?.jsonPrimitive?.content ?: "",
                        copilotJson = "{}",
                        sourceDevice = obj["source_device"]?.jsonPrimitive?.content ?: "web",
                        audioPurgedAtEpochMs = purgedMs,
                        createdAtEpochMs = createdMs,
                    )
                }.getOrNull()
            }
            prefs.edit().putString("sb_last_sync_status", "Nuvem ativa (${list.size})").apply()
            return list
        }
    }

    /**
     * Envia ou atualiza o texto processado/editado para a tabela `evolutions` no Supabase.
     */
    fun upsertEvolutionText(
        id: String,
        templateId: String,
        templateName: String,
        selectionMode: String,
        patientLabel: String,
        blocksContent: Map<String, String> = emptyMap(),
        renderedText: String,
        sourceDevice: String,
        createdAtEpochMs: Long? = null,
        ttlHours: Long = 24L * 3650L,
    ): Boolean {
        val (baseUrl, anonKey, userId) = resolveConfig()
        if (baseUrl.isBlank() || anonKey.isBlank()) {
            prefs.edit().putString("sb_last_sync_status", "Supabase não configurado").apply()
            return false
        }

        val safeMode = when (selectionMode.lowercase()) {
            "manual" -> "manual"
            "voice" -> "voice"
            else -> "auto"
        }
        val safeDevice = when (sourceDevice.lowercase()) {
            "wear" -> "wear"
            "web" -> "web"
            else -> "android"
        }

        val now = Instant.now()
        val createdAt = createdAtEpochMs?.let { Instant.ofEpochMilli(it) } ?: now
        val expiresAt = now.plus(ttlHours, ChronoUnit.HOURS)

        val blocksJson = buildJsonObject {
            for ((k, v) in blocksContent) put(k, v)
        }

        val payload = buildJsonObject {
            put("id", id)
            put("user_id", userId)
            put("template_id", templateId)
            put("template_name", templateName)
            put("selection_mode", safeMode)
            put("patient_label", patientLabel)
            put("blocks_content", blocksJson)
            put("rendered_text", renderedText)
            put("source_device", safeDevice)
            put("audio_purged_at", now.toString())
            put("expires_at", expiresAt.toString())
            put("created_at", createdAt.toString())
            put("updated_at", now.toString())
        }.toString()

        val req = Request.Builder()
            .url("$baseUrl/rest/v1/evolutions")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "resolution=merge-duplicates")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        return http.newCall(req).execute().use { res ->
            val ok = res.isSuccessful
            val statusMsg = if (ok) "Sincronizado" else "Erro sync HTTP ${res.code}"
            prefs.edit().putString("sb_last_sync_status", statusMsg).apply()
            ok
        }
    }

    /**
     * Atualiza apenas `patient_label`, `rendered_text` e `updated_at` via PATCH,
     * preservando `blocks_content` original (ex.: evoluções gravadas no PC).
     * Se o registro ainda não existir na nuvem, faz fallback para upsert completo.
     */
    fun updateEvolutionFieldsOrUpsert(
        entity: EvolutionEntity,
        patientLabel: String,
        renderedText: String,
    ): Boolean {
        val (baseUrl, anonKey, _) = resolveConfig()
        if (baseUrl.isBlank() || anonKey.isBlank()) {
            prefs.edit().putString("sb_last_sync_status", "Supabase não configurado").apply()
            return false
        }

        val now = Instant.now()
        val patchPayload = buildJsonObject {
            put("patient_label", patientLabel)
            put("rendered_text", renderedText)
            put("updated_at", now.toString())
        }.toString()

        val patchReq = Request.Builder()
            .url("$baseUrl/rest/v1/evolutions?id=eq.${entity.id}")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=representation")
            .patch(patchPayload.toRequestBody("application/json".toMediaType()))
            .build()

        val updatedExisting = http.newCall(patchReq).execute().use { res ->
            val body = res.body?.string().orEmpty().trim()
            if (res.isSuccessful && body.startsWith("[") && body != "[]") {
                prefs.edit().putString("sb_last_sync_status", "Sincronizado").apply()
                true
            } else {
                false
            }
        }
        if (updatedExisting) return true

        return upsertEvolutionText(
            id = entity.id,
            templateId = entity.templateId,
            templateName = entity.templateName,
            selectionMode = entity.selectionMode,
            patientLabel = patientLabel,
            renderedText = renderedText,
            sourceDevice = entity.sourceDevice,
            createdAtEpochMs = entity.createdAtEpochMs,
        )
    }

    fun deleteEvolution(id: String): Boolean {
        val (baseUrl, anonKey, _) = resolveConfig()
        if (baseUrl.isBlank() || anonKey.isBlank()) return false
        val req = Request.Builder()
            .url("$baseUrl/rest/v1/evolutions?id=eq.$id")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .delete()
            .build()
        return runCatching { http.newCall(req).execute().use { it.isSuccessful } }.getOrDefault(false)
    }

    fun clearAllEvolutions(): Boolean {
        val (baseUrl, anonKey, _) = resolveConfig()
        if (baseUrl.isBlank() || anonKey.isBlank()) return false
        val req = Request.Builder()
            .url("$baseUrl/rest/v1/evolutions?id=neq.00000000-0000-0000-0000-000000000000")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .delete()
            .build()
        return runCatching { http.newCall(req).execute().use { it.isSuccessful } }.getOrDefault(false)
    }
}
