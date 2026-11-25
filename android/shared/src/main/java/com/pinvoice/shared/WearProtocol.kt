package com.pinvoice.shared

/**
 * Constantes de protocolo Bluetooth (Wearable Data Layer)
 * entre Smartwatch Wear OS (:wear) e Smartphone Android (:app).
 */
object WearProtocol {
    /** Canal Bluetooth ChannelClient para transferência rápida (<1s) de áudio .m4a */
    const val AUDIO_CHANNEL_PATH = "/pinvoice/audio_channel"

    /** Comando MessageClient disparado pelo celular após HTTP 200 do Gemini para apagar o áudio no relógio */
    const val PURGE_AUDIO_MESSAGE_PATH = "/pinvoice/purge_audio"

    /** Prefixo padrão de arquivos efêmeros no cacheDir */
    const val AUDIO_FILE_PREFIX = "pinvoice_rec_"
    const val AUDIO_FILE_EXT = ".m4a"
}
