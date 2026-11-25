package com.pinvoice.wear

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import com.pinvoice.shared.WearProtocol
import java.io.File

/**
 * Gravador efêmero do Wear OS:
 * .m4a (AAC-LC, 16 kHz, Mono, 24 kbps ~ 180 KB/min) armazenado apenas em context.cacheDir.
 */
class WearAudioRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var currentFile: File? = null

    fun purgeResidualAudios() {
        context.cacheDir.listFiles()?.forEach { file ->
            if (file.name.startsWith(WearProtocol.AUDIO_FILE_PREFIX)) {
                file.delete()
            }
        }
    }

    fun startRecording(): File {
        stopSilently()
        val file = File(
            context.cacheDir,
            "${WearProtocol.AUDIO_FILE_PREFIX}${System.currentTimeMillis()}${WearProtocol.AUDIO_FILE_EXT}",
        )
        val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        mr.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(16_000)
            setAudioChannels(1)
            setAudioEncodingBitRate(16_000)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }

        recorder = mr
        currentFile = file
        return file
    }

    /** Retorna nível de voz normalizado (0.0 .. 1.0) para animar a borda de onda sonora. */
    fun getVoiceAmplitude(): Float {
        val raw = runCatching { recorder?.maxAmplitude ?: 0 }.getOrDefault(0)
        return (raw / 12000f).coerceIn(0.08f, 1f)
    }

    fun stopRecording(): File? {
        val file = currentFile
        try {
            recorder?.stop()
        } catch (_: RuntimeException) {
            file?.delete()
            return null
        } finally {
            recorder?.release()
            recorder = null
            currentFile = null
        }
        return file
    }

    fun stopSilently() {
        try {
            recorder?.stop()
        } catch (_: Exception) {
        } finally {
            recorder?.release()
            recorder = null
            currentFile?.delete()
            currentFile = null
        }
    }
}
