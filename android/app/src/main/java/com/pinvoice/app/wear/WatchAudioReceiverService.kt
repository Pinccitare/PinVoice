package com.pinvoice.app.wear

import android.content.Context
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import com.pinvoice.app.data.EvolutionEntity
import com.pinvoice.app.data.PendingAudioEntity
import com.pinvoice.app.data.PinVoiceDatabase
import com.pinvoice.app.network.GeminiApiClient
import com.pinvoice.app.network.SupabaseSyncClient
import com.pinvoice.app.worker.GeminiUploadWorker
import com.pinvoice.shared.WearProtocol
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File
import java.util.UUID

/**
 * Hub Central em 2º plano:
 * Acorda instantaneamente ao receber stream Bluetooth (ChannelClient) do Wear OS,
 * grava temporariamente em cacheDir e processa IMEDIATAMENTE (Gemini -> file.delete -> Supabase)
 * sem esperar fila do WorkManager. Só usa WorkManager se estiver sem internet ou falhar.
 */
class WatchAudioReceiverService : WearableListenerService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (!channel.path.startsWith(WearProtocol.AUDIO_CHANNEL_PATH)) return

        val watchFileName = channel.path.substringAfterLast('/')
            .ifBlank { "${WearProtocol.AUDIO_FILE_PREFIX}${System.currentTimeMillis()}${WearProtocol.AUDIO_FILE_EXT}" }

        val targetFile = File(cacheDir, "${WearProtocol.AUDIO_FILE_PREFIX}watch_${System.currentTimeMillis()}_$watchFileName")

        serviceScope.launch {
            val receivedOk = runCatching {
                val inputStream = Wearable.getChannelClient(applicationContext)
                    .getInputStream(channel)
                    .await()
                inputStream.use { input ->
                    targetFile.outputStream().use { out ->
                        input.copyTo(out, bufferSize = 8192)
                        out.flush()
                    }
                }
                true
            }.getOrDefault(false)

            if (!receivedOk || !targetFile.exists() || targetFile.length() == 0L) {
                targetFile.delete()
                return@launch
            }

            val prefs = applicationContext.getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
            val apiKey = prefs.getString("gemini_api_key", "")?.trim().orEmpty()
            val db = PinVoiceDatabase.getInstance(applicationContext)

            if (apiKey.isNotEmpty()) {
                val processedDirectly = runCatching {
                    val processed = GeminiApiClient().processAudio(
                        apiKey = apiKey,
                        audioFile = targetFile,
                        lockedTemplateId = null,
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
                            sourceDevice = "wear",
                            audioPurgedAtEpochMs = nowMs,
                            createdAtEpochMs = nowMs,
                        ),
                    )

                    // Destruição imediata do áudio no celular após HTTP 200
                    targetFile.delete()

                    // Confirmação redundante de purge no relógio
                    runCatching {
                        Wearable.getMessageClient(applicationContext)
                            .sendMessage(
                                channel.nodeId,
                                WearProtocol.PURGE_AUDIO_MESSAGE_PATH,
                                watchFileName.toByteArray(Charsets.UTF_8),
                            )
                            .await()
                    }

                    // Envio imediato para o Supabase -> aparece na Web em tempo real!
                    SupabaseSyncClient(applicationContext).upsertEvolutionText(
                        id = evolutionId,
                        templateId = processed.template.id,
                        templateName = processed.template.name,
                        selectionMode = processed.selectionMode,
                        patientLabel = processed.patientLabel,
                        blocksContent = processed.blocksContent,
                        renderedText = processed.renderedText,
                        sourceDevice = "wear",
                    )
                    true
                }.getOrDefault(false)

                if (processedDirectly) return@launch
            }

            // Fallback offline: guarda na fila Room + WorkManager para envio automático ao reconectar
            val jobId = UUID.randomUUID().toString()
            db.dao().insertPendingAudio(
                PendingAudioEntity(
                    id = jobId,
                    filePath = targetFile.absolutePath,
                    watchFileName = watchFileName,
                    watchNodeId = channel.nodeId,
                    sourceDevice = "wear",
                    lockedTemplateId = null,
                    createdAtEpochMs = System.currentTimeMillis(),
                ),
            )
            GeminiUploadWorker.enqueue(applicationContext, jobId)
        }
    }
}
