package com.pinvoice.app.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.android.gms.wearable.Wearable
import com.pinvoice.app.data.EvolutionEntity
import com.pinvoice.app.data.PinVoiceDatabase
import com.pinvoice.app.network.GeminiApiClient
import com.pinvoice.app.network.SupabaseSyncClient
import com.pinvoice.shared.WearProtocol
import kotlinx.coroutines.tasks.await
import java.io.File
import java.util.UUID

/**
 * Worker resiliente (WorkManager):
 * Só dispara quando há rede (Wi-Fi/4G), envia o áudio ao Gemini BYOK e,
 * no milissegundo do HTTP 200:
 *   1. Salva o texto estruturado no Room DB
 *   2. Executa file.delete() localmente no celular
 *   3. Dispara MessageClient (/pinvoice/purge_audio) via Bluetooth para o relógio destruir a cópia dele
 */
class GeminiUploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val jobId = inputData.getString(KEY_JOB_ID) ?: return Result.failure()
        val db = PinVoiceDatabase.getInstance(applicationContext)
        val pending = db.dao().getPendingAudio(jobId) ?: return Result.success()

        val prefs = applicationContext.getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        fun setStatus(msg: String) {
            prefs.edit().putString("last_worker_status", msg).apply()
        }

        val apiKey = prefs.getString("gemini_api_key", "")?.trim().orEmpty()
        if (apiKey.isEmpty()) {
            setStatus("Erro: Gemini API Key vazia em Config")
            return Result.retry()
        }

        val audioFile = File(pending.filePath)
        if (!audioFile.exists()) {
            db.dao().deletePendingAudio(jobId)
            setStatus("Áudio expirado removido da fila")
            return Result.success()
        }

        return try {
            setStatus("Processando áudio no Gemini...")
            val preferredModel = prefs.getString("gemini_model", "gemini-3.5-flash-lite")
                ?: "gemini-3.5-flash-lite"
            val client = GeminiApiClient()
            val processed = client.processAudio(
                apiKey = apiKey,
                audioFile = audioFile,
                model = preferredModel,
                lockedTemplateId = pending.lockedTemplateId,
            )

            val nowMs = System.currentTimeMillis()
            val evolutionId = UUID.randomUUID().toString()
            db.dao().insertEvolution(
                EvolutionEntity(
                    id = evolutionId,
                    templateId = processed.template.id,
                    templateName = processed.template.name,
                    selectionMode = processed.selectionMode,
                    patientLabel = processed.patientLabel,
                    renderedText = processed.renderedText,
                    copilotJson = "{}",
                    sourceDevice = pending.sourceDevice,
                    audioPurgedAtEpochMs = nowMs,
                    createdAtEpochMs = nowMs,
                ),
            )

            // Gatilho 1 — Destruição Imediata Pós-Processamento (HTTP 200)
            audioFile.delete()
            db.dao().deletePendingAudio(jobId)

            // Dispara comando Bluetooth para o relógio destruir sua cópia efêmera
            if (!pending.watchNodeId.isNullOrBlank() && !pending.watchFileName.isNullOrBlank()) {
                runCatching {
                    Wearable.getMessageClient(applicationContext)
                        .sendMessage(
                            pending.watchNodeId,
                            WearProtocol.PURGE_AUDIO_MESSAGE_PATH,
                            pending.watchFileName.toByteArray(Charsets.UTF_8),
                        )
                        .await()
                }
            }

            // Sincroniza APENAS o texto processado com o Supabase (aparece em tempo real no PC)
            val synced = runCatching {
                SupabaseSyncClient(applicationContext).upsertEvolutionText(
                    id = evolutionId,
                    templateId = processed.template.id,
                    templateName = processed.template.name,
                    selectionMode = processed.selectionMode,
                    patientLabel = processed.patientLabel,
                    blocksContent = processed.blocksContent,
                    renderedText = processed.renderedText,
                    sourceDevice = pending.sourceDevice,
                    createdAtEpochMs = nowMs,
                )
            }.getOrDefault(false)

            setStatus(if (synced) "Evolução pronta e sincronizada!" else "Evolução pronta (toque Sync ↻)")
            Result.success()
        } catch (e: Exception) {
            setStatus("Erro Gemini: ${(e.message ?: e.javaClass.simpleName).take(140)}")
            Result.retry()
        }
    }

    companion object {
        const val KEY_JOB_ID = "job_id"

        fun enqueue(context: Context, jobId: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<GeminiUploadWorker>()
                .setConstraints(constraints)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setInputData(workDataOf(KEY_JOB_ID to jobId))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "pinvoice_upload_$jobId",
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
