package com.pinvoice.app.data

import android.content.Context
import com.pinvoice.shared.WearProtocol
import java.io.File

/**
 * Gatilho 2 — Varredura de Segurança na Abertura (onResume) ou Nova Gravação:
 * Varre context.cacheDir e destrói qualquer arquivo de áudio residual que não
 * pertença a um job ativo na fila offline do Room DB nem à gravação em andamento.
 */
object AudioPurger {
    suspend fun purgeResidualAudios(context: Context, excludePath: String? = null): Int {
        val db = PinVoiceDatabase.getInstance(context)
        val activePaths = db.dao().getAllPendingAudios().map { it.filePath }.toMutableSet()
        if (!excludePath.isNullOrBlank()) {
            activePaths.add(excludePath)
        }

        var deleted = 0
        context.cacheDir.listFiles()?.forEach { file: File ->
            if (
                file.name.startsWith(WearProtocol.AUDIO_FILE_PREFIX) &&
                file.absolutePath !in activePaths
            ) {
                if (file.delete()) deleted++
            }
        }
        return deleted
    }
}
