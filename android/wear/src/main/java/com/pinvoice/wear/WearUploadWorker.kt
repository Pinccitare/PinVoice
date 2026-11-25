package com.pinvoice.wear

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
import java.io.File

/**
 * Fallback offline do relógio: se o médico gravar sem sinal no setor,
 * assim que o relógio reconectar (Wi-Fi ou internet do celular), envia direto
 * para Gemini -> Supabase e apaga o .m4a local.
 */
class WearUploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val filePath = inputData.getString(KEY_FILE_PATH) ?: return Result.failure()
        val file = File(filePath)
        if (!file.exists() || file.length() == 0L) return Result.success()

        return try {
            DirectCloudClient().processAndPublish(file)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val KEY_FILE_PATH = "file_path"

        fun enqueue(context: Context, file: File) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<WearUploadWorker>()
                .setConstraints(constraints)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setInputData(workDataOf(KEY_FILE_PATH to file.absolutePath))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "wear_upload_${file.name}",
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }
}
