package com.pinvoice.app

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.pinvoice.app.data.AudioPurger
import com.pinvoice.app.data.EvolutionEntity
import com.pinvoice.app.data.PendingAudioEntity
import com.pinvoice.app.data.PinVoiceDatabase
import com.pinvoice.app.network.GeminiApiClient
import com.pinvoice.app.network.SupabaseSyncClient
import com.pinvoice.app.ui.AnimatedAuroraBackground
import com.pinvoice.app.ui.PinVoicePalette
import com.pinvoice.app.ui.WaveColors
import com.pinvoice.app.ui.pinVoicePalette
import com.pinvoice.app.worker.GeminiUploadWorker
import com.pinvoice.shared.ClinicalRenderer
import com.pinvoice.shared.DefaultTemplates
import com.pinvoice.shared.WearProtocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class MainActivity : ComponentActivity() {
    private var recorder: MediaRecorder? = null
    private var activeFile: File? = null
    private var isRecording by mutableStateOf(false)
    private var isProcessing by mutableStateOf(false)
    private var complementTargetId by mutableStateOf<String?>(null)
    private var liveStatus by mutableStateOf("")
    private var liveStatusIsError by mutableStateOf(false)
    private var isCloudSynced by mutableStateOf(false)
    private var isSyncingCloud by mutableStateOf(false)
    private var lockedTemplateId by mutableStateOf<String?>(null)
    private var editingEvolutionId by mutableStateOf<String?>(null)

    private var pendingRecordAction: (() -> Unit)? = null

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            pendingRecordAction?.invoke()
        }
        pendingRecordAction = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val db = PinVoiceDatabase.getInstance(this)
        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)

        setContent {
            val evolutions by db.dao().observeEvolutions().collectAsState(initial = emptyList())
            val pending by db.dao().observePendingAudios().collectAsState(initial = emptyList())

            var isDarkTheme by remember { mutableStateOf(prefs.getBoolean("is_dark_theme", true)) }
            var apiKey by remember { mutableStateOf(prefs.getString("gemini_api_key", "") ?: "") }
            var geminiModel by remember {
                mutableStateOf(prefs.getString("gemini_model", "gemini-3.5-flash-lite") ?: "gemini-3.5-flash-lite")
            }
            var hospubAscii by remember { mutableStateOf(prefs.getBoolean("hospub_ascii", false)) }
            var sbUrl by remember {
                mutableStateOf(prefs.getString("sb_url", SupabaseSyncClient.DEFAULT_SUPABASE_URL) ?: SupabaseSyncClient.DEFAULT_SUPABASE_URL)
            }
            var sbAnon by remember {
                mutableStateOf(prefs.getString("sb_anon_key", SupabaseSyncClient.DEFAULT_SUPABASE_ANON_KEY) ?: SupabaseSyncClient.DEFAULT_SUPABASE_ANON_KEY)
            }
            var showConfig by remember { mutableStateOf(apiKey.isBlank()) }
            var copiedId by remember { mutableStateOf<String?>(null) }

            val palette = remember(isDarkTheme) { pinVoicePalette(isDarkTheme) }

            // Sync bidirecional automático (puxa evoluções do PC e do Relógio)
            LaunchedEffect(Unit) {
                pullFromCloud(showToast = false)
                while (true) {
                    delay(15_000)
                    if (!isRecording && !isProcessing && editingEvolutionId == null) {
                        pullFromCloud(showToast = false)
                    }
                }
            }

            val editingEvolution = remember(evolutions, editingEvolutionId) {
                evolutions.firstOrNull { it.id == editingEvolutionId }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                AnimatedAuroraBackground(palette = palette)

                if (editingEvolution != null) {
                    EvolutionEditorScreen(
                        palette = palette,
                        evolution = editingEvolution,
                        hospubAscii = hospubAscii,
                        isCopied = copiedId == editingEvolution.id,
                        isComplementRecording = isRecording && complementTargetId == editingEvolution.id,
                        isComplementProcessing = isProcessing && complementTargetId == editingEvolution.id,
                        isBusy = isRecording || isProcessing,
                        liveStatus = liveStatus,
                        liveStatusIsError = liveStatusIsError,
                        onBack = { editingEvolutionId = null },
                        onSave = { newLabel, newText ->
                            saveEditedEvolution(editingEvolution, newLabel, newText)
                        },
                        onStartComplement = {
                            requestMicAndRun { startPocketRecording(targetEvolutionId = editingEvolution.id) }
                        },
                        onStopComplement = { stopAndProcessDirectly() },
                        onCancelComplement = { cancelRecording() },
                        onCopyHospub = { textToCopy ->
                            copyTextForHospub(editingEvolution.id, textToCopy, hospubAscii) { copiedId = it }
                        },
                        onDelete = {
                            deleteEvolutionEverywhere(editingEvolution.id)
                            editingEvolutionId = null
                        },
                    )
                } else {
                    PinVoicePhoneScreen(
                        palette = palette,
                        onToggleTheme = {
                            isDarkTheme = !isDarkTheme
                            prefs.edit().putBoolean("is_dark_theme", isDarkTheme).apply()
                        },
                        showConfig = showConfig,
                        onToggleConfig = { showConfig = !showConfig },
                        apiKey = apiKey,
                        onApiKeyChange = {
                            apiKey = it
                            prefs.edit().putString("gemini_api_key", it.trim()).apply()
                        },
                        geminiModel = geminiModel,
                        onGeminiModelChange = {
                            geminiModel = it
                            prefs.edit().putString("gemini_model", it).apply()
                        },
                        hospubAscii = hospubAscii,
                        onHospubAsciiChange = {
                            hospubAscii = it
                            prefs.edit().putBoolean("hospub_ascii", it).apply()
                        },
                        sbUrl = sbUrl,
                        onSbUrlChange = {
                            sbUrl = it
                            prefs.edit().putString("sb_url", it.trim()).apply()
                        },
                        sbAnon = sbAnon,
                        onSbAnonChange = {
                            sbAnon = it
                            prefs.edit().putString("sb_anon_key", it.trim()).apply()
                        },
                        isCloudSynced = isCloudSynced,
                        isSyncingCloud = isSyncingCloud,
                        onSyncNow = { pullFromCloud(showToast = true) },
                        liveStatus = liveStatus,
                        liveStatusIsError = liveStatusIsError,
                        lockedTemplateId = lockedTemplateId,
                        onLockTemplate = { lockedTemplateId = it },
                        isRecording = isRecording && complementTargetId == null,
                        isProcessing = isProcessing && complementTargetId == null,
                        pendingCount = pending.size,
                        evolutions = evolutions,
                        copiedId = copiedId,
                        onStartOrStopRecord = {
                            if (isRecording) {
                                stopAndProcessDirectly()
                            } else {
                                requestMicAndRun { startPocketRecording(targetEvolutionId = null) }
                            }
                        },
                        onCancelRecord = { cancelRecording() },
                        onRetryPending = { retryPendingQueue(pending) },
                        onOpenEditor = { ev -> editingEvolutionId = ev.id },
                        onCopyHospub = { ev ->
                            copyTextForHospub(ev.id, ev.renderedText, hospubAscii) { copiedId = it }
                        },
                        onDeleteEvolution = { id -> deleteEvolutionEverywhere(id) },
                        onClearShift = { clearShiftEverywhere() },
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            AudioPurger.purgeResidualAudios(this@MainActivity, excludePath = activeFile?.absolutePath)
            if (!isRecording && !isProcessing && editingEvolutionId == null) {
                pullFromCloud(showToast = false)
            }
        }
    }

    private fun getDirtyEvolutionIds(): Set<String> {
        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        return prefs.getStringSet("dirty_evolution_ids", emptySet())?.toSet() ?: emptySet()
    }

    private fun markEvolutionDirty(id: String) {
        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        val next = getDirtyEvolutionIds().toMutableSet().apply { add(id) }
        prefs.edit().putStringSet("dirty_evolution_ids", next).apply()
    }

    private fun clearEvolutionDirty(id: String) {
        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        val next = getDirtyEvolutionIds().toMutableSet().apply { remove(id) }
        prefs.edit().putStringSet("dirty_evolution_ids", next).apply()
    }

    private fun requestMicAndRun(action: () -> Unit) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            action()
        } else {
            pendingRecordAction = action
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun copyTextForHospub(
        id: String,
        rawText: String,
        asciiOnly: Boolean,
        setCopiedId: (String?) -> Unit,
    ) {
        val clean = ClinicalRenderer.sanitizeForHospub(rawText, asciiOnly = asciiOnly)
        val cb = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cb.setPrimaryClip(ClipData.newPlainText("PinVoice", clean))
        setCopiedId(id)
        liveStatus = "Copiado no formato seguro para o hb-hospub."
        liveStatusIsError = false
        lifecycleScope.launch {
            delay(1800)
            setCopiedId(null)
        }
    }

    private fun pullFromCloud(showToast: Boolean) {
        if (isSyncingCloud) return
        isSyncingCloud = true
        lifecycleScope.launch {
            val db = PinVoiceDatabase.getInstance(this@MainActivity)
            val sb = SupabaseSyncClient(this@MainActivity)

            // 1. Reenvia primeiro edições/criações locais pendentes para nunca perdê-las
            val dirtyIds = getDirtyEvolutionIds()
            val stillDirty = mutableSetOf<String>()
            for (dirtyId in dirtyIds) {
                val local = db.dao().getEvolutionById(dirtyId)
                if (local == null) {
                    clearEvolutionDirty(dirtyId)
                    continue
                }
                val pushed = withContext(Dispatchers.IO) {
                    runCatching {
                        sb.updateEvolutionFieldsOrUpsert(local, local.patientLabel, local.renderedText)
                    }.getOrDefault(false)
                }
                if (pushed) {
                    clearEvolutionDirty(dirtyId)
                } else {
                    stillDirty.add(dirtyId)
                }
            }

            // 2. Puxa evoluções da nuvem ignorando qualquer ID ainda pendente de push local
            val result = withContext(Dispatchers.IO) {
                runCatching { sb.fetchEvolutions(100) }
            }
            result.onSuccess { cloudList ->
                isCloudSynced = true
                val safeToInsert = cloudList.filter { it.id !in stillDirty }
                if (safeToInsert.isNotEmpty()) {
                    db.dao().insertEvolutions(safeToInsert)
                }
                if (showToast) {
                    liveStatus = "Sincronizado (${cloudList.size} evoluções na nuvem)."
                    liveStatusIsError = false
                }
            }.onFailure { err ->
                isCloudSynced = false
                if (showToast) {
                    liveStatus = "Sync offline: ${(err.message ?: "sem conexão").take(70)}"
                    liveStatusIsError = true
                }
            }
            isSyncingCloud = false
        }
    }

    private fun saveEditedEvolution(
        original: EvolutionEntity,
        newLabel: String,
        newText: String,
    ) {
        lifecycleScope.launch {
            val cleanLabel = newLabel.trim()
            markEvolutionDirty(original.id)
            PinVoiceDatabase.getInstance(this@MainActivity).dao()
                .updateEvolutionText(original.id, cleanLabel, newText)
            liveStatus = "Edição salva • sincronizando em background..."
            liveStatusIsError = false

            // Sync assíncrono em background (PATCH preserva blocks_content do PC)
            launch(Dispatchers.IO) {
                val ok = runCatching {
                    SupabaseSyncClient(this@MainActivity).updateEvolutionFieldsOrUpsert(
                        entity = original,
                        patientLabel = cleanLabel,
                        renderedText = newText,
                    )
                }.getOrDefault(false)
                if (ok) clearEvolutionDirty(original.id)
                withContext(Dispatchers.Main) {
                    isCloudSynced = ok
                    liveStatus = if (ok) "Salvo e sincronizado com PC!" else "Salvo localmente."
                    liveStatusIsError = false
                }
            }
        }
    }

    private fun deleteEvolutionEverywhere(id: String) {
        lifecycleScope.launch {
            clearEvolutionDirty(id)
            PinVoiceDatabase.getInstance(this@MainActivity).dao().deleteEvolution(id)
            launch(Dispatchers.IO) {
                runCatching { SupabaseSyncClient(this@MainActivity).deleteEvolution(id) }
            }
        }
    }

    private fun clearShiftEverywhere() {
        lifecycleScope.launch {
            PinVoiceDatabase.getInstance(this@MainActivity).dao().clearAllEvolutions()
            liveStatus = "Plantão limpo."
            liveStatusIsError = false
            launch(Dispatchers.IO) {
                runCatching { SupabaseSyncClient(this@MainActivity).clearAllEvolutions() }
            }
        }
    }

    private fun startPocketRecording(targetEvolutionId: String?) {
        if (isRecording || isProcessing) return
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                AudioPurger.purgeResidualAudios(this@MainActivity)
            }
            val file = File(
                cacheDir,
                "${WearProtocol.AUDIO_FILE_PREFIX}phone_${System.currentTimeMillis()}${WearProtocol.AUDIO_FILE_EXT}",
            )
            val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this@MainActivity)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            runCatching {
                mr.apply {
                    setAudioSource(MediaRecorder.AudioSource.MIC)
                    setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    setAudioSamplingRate(16_000)
                    setAudioChannels(1)
                    setAudioEncodingBitRate(16_000) // 16 kbps: upload ~33% mais rápido
                    setOutputFile(file.absolutePath)
                    prepare()
                    start()
                }
                recorder = mr
                activeFile = file
                complementTargetId = targetEvolutionId
                isRecording = true
                liveStatus = ""
                liveStatusIsError = false
            }.onFailure { err ->
                runCatching { mr.release() }
                complementTargetId = null
                liveStatus = "Erro microfone: ${err.message}"
                liveStatusIsError = true
            }
        }
    }

    private fun cancelRecording() {
        val file = activeFile
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        activeFile = null
        isRecording = false
        complementTargetId = null
        file?.delete()
        liveStatus = "Gravação cancelada e áudio destruído."
        liveStatusIsError = false
    }

    /**
     * Pipeline ultra-rápido:
     * 16 kbps -> Gemini (thinkingBudget=0 + prompt compacto) -> Salva local + mostra na tela imediatamente ->
     * file.delete() -> Supabase sync assíncrono em background!
     */
    private fun stopAndProcessDirectly() {
        val file = activeFile
        val targetId = complementTargetId
        runCatching { recorder?.stop() }
        recorder?.release()
        recorder = null
        activeFile = null
        isRecording = false

        if (file == null || !file.exists() || file.length() == 0L) {
            complementTargetId = null
            liveStatus = "Gravação vazia ou muito curta."
            liveStatusIsError = true
            return
        }

        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        val apiKey = prefs.getString("gemini_api_key", "")?.trim().orEmpty()
        val preferredModel = prefs.getString("gemini_model", "gemini-3.5-flash-lite") ?: "gemini-3.5-flash-lite"
        val chosenLock = lockedTemplateId

        if (apiKey.isEmpty()) {
            complementTargetId = null
            liveStatus = "Configure sua Gemini API Key em Config."
            liveStatusIsError = true
            if (targetId == null) enqueueForOfflineRetry(file, chosenLock) else file.delete()
            return
        }

        isProcessing = true
        liveStatus = if (targetId != null) "Integrando complemento por voz..." else "Processando no Gemini..."
        liveStatusIsError = false

        lifecycleScope.launch {
            try {
                val db = PinVoiceDatabase.getInstance(this@MainActivity)

                if (targetId != null) {
                    val existing = db.dao().getEvolutionById(targetId)
                        ?: throw IllegalStateException("Evolução não encontrada.")
                    val tpl = DefaultTemplates.all.firstOrNull { it.id == existing.templateId }
                        ?: DefaultTemplates.all.first()

                    val processed = withContext(Dispatchers.IO) {
                        GeminiApiClient().complementAudio(
                            apiKey = apiKey,
                            audioFile = file,
                            existingText = existing.renderedText,
                            template = tpl,
                            model = preferredModel,
                        )
                    }
                    file.delete()

                    val updatedLabel = processed.patientLabel.ifBlank { existing.patientLabel }
                    markEvolutionDirty(existing.id)
                    db.dao().updateEvolutionText(existing.id, updatedLabel, processed.renderedText)

                    // Mostra imediatamente na tela antes do sync com Supabase
                    liveStatus = "Complemento integrado • áudio destruído."
                    liveStatusIsError = false
                    isProcessing = false
                    complementTargetId = null

                    // Sync assíncrono em background
                    launch(Dispatchers.IO) {
                        val synced = runCatching {
                            SupabaseSyncClient(this@MainActivity).upsertEvolutionText(
                                id = existing.id,
                                templateId = existing.templateId,
                                templateName = existing.templateName,
                                selectionMode = existing.selectionMode,
                                patientLabel = updatedLabel,
                                blocksContent = processed.blocksContent,
                                renderedText = processed.renderedText,
                                sourceDevice = existing.sourceDevice,
                                createdAtEpochMs = existing.createdAtEpochMs,
                            )
                        }.getOrDefault(false)
                        if (synced) clearEvolutionDirty(existing.id)
                        withContext(Dispatchers.Main) {
                            isCloudSynced = synced
                        }
                    }
                    return@launch
                }

                val processed = withContext(Dispatchers.IO) {
                    GeminiApiClient().processAudio(
                        apiKey = apiKey,
                        audioFile = file,
                        model = preferredModel,
                        lockedTemplateId = chosenLock,
                    )
                }

                // Destruição imediata do áudio após HTTP 200
                file.delete()

                val nowMs = System.currentTimeMillis()
                val evolutionId = UUID.randomUUID().toString()
                val entity = EvolutionEntity(
                    id = evolutionId,
                    templateId = processed.template.id,
                    templateName = processed.template.name,
                    selectionMode = processed.selectionMode,
                    patientLabel = processed.patientLabel,
                    renderedText = processed.renderedText,
                    copilotJson = "{}",
                    sourceDevice = "android",
                    audioPurgedAtEpochMs = nowMs,
                    createdAtEpochMs = nowMs,
                )
                markEvolutionDirty(evolutionId)
                db.dao().insertEvolution(entity)

                // Exibe o texto pronto imediatamente sem esperar o Supabase!
                liveStatus = "Evolução pronta • áudio destruído."
                liveStatusIsError = false
                isProcessing = false
                complementTargetId = null

                // Sync assíncrono em background
                launch(Dispatchers.IO) {
                    val synced = runCatching {
                        SupabaseSyncClient(this@MainActivity).upsertEvolutionText(
                            id = evolutionId,
                            templateId = processed.template.id,
                            templateName = processed.template.name,
                            selectionMode = processed.selectionMode,
                            patientLabel = processed.patientLabel,
                            blocksContent = processed.blocksContent,
                            renderedText = processed.renderedText,
                            sourceDevice = "android",
                            createdAtEpochMs = nowMs,
                        )
                    }.getOrDefault(false)
                    if (synced) clearEvolutionDirty(evolutionId)
                    withContext(Dispatchers.Main) {
                        isCloudSynced = synced
                        if (synced) {
                            liveStatus = "Evolução pronta • sincronizada com PC!"
                        }
                    }
                }
            } catch (err: Exception) {
                if (targetId == null) {
                    enqueueForOfflineRetry(file, chosenLock)
                    liveStatus = "Salvo na fila offline (${(err.message ?: "sem rede").take(70)})"
                } else {
                    file.delete()
                    liveStatus = "Erro complemento: ${(err.message ?: "falha").take(70)}"
                }
                liveStatusIsError = true
                isProcessing = false
                complementTargetId = null
            }
        }
    }

    private fun retryPendingQueue(pending: List<PendingAudioEntity>) {
        if (isProcessing) return
        val prefs = getSharedPreferences("pinvoice_prefs", Context.MODE_PRIVATE)
        val key = prefs.getString("gemini_api_key", "")?.trim().orEmpty()
        val preferredModel = prefs.getString("gemini_model", "gemini-3.5-flash-lite") ?: "gemini-3.5-flash-lite"
        if (key.isEmpty()) {
            liveStatus = "Configure sua Gemini API Key em Config."
            liveStatusIsError = true
            return
        }
        isProcessing = true
        liveStatus = "Processando ${pending.size} áudio(s) da fila..."
        liveStatusIsError = false
        lifecycleScope.launch {
            val db = PinVoiceDatabase.getInstance(this@MainActivity)
            var okCount = 0
            var lastErr = ""
            for (job in pending) {
                val f = File(job.filePath)
                if (!f.exists() || f.length() == 0L) {
                    db.dao().deletePendingAudio(job.id)
                    continue
                }
                runCatching {
                    val processed = withContext(Dispatchers.IO) {
                        GeminiApiClient().processAudio(
                            apiKey = key,
                            audioFile = f,
                            model = preferredModel,
                            lockedTemplateId = job.lockedTemplateId,
                        )
                    }
                    f.delete()
                    db.dao().deletePendingAudio(job.id)
                    val nowMs = System.currentTimeMillis()
                    val evId = UUID.randomUUID().toString()
                    db.dao().insertEvolution(
                        EvolutionEntity(
                            id = evId,
                            templateId = processed.template.id,
                            templateName = processed.template.name,
                            selectionMode = processed.selectionMode,
                            patientLabel = processed.patientLabel,
                            renderedText = processed.renderedText,
                            copilotJson = "{}",
                            sourceDevice = job.sourceDevice,
                            audioPurgedAtEpochMs = nowMs,
                            createdAtEpochMs = nowMs,
                        ),
                    )
                    launch(Dispatchers.IO) {
                        runCatching {
                            SupabaseSyncClient(this@MainActivity).upsertEvolutionText(
                                id = evId,
                                templateId = processed.template.id,
                                templateName = processed.template.name,
                                selectionMode = processed.selectionMode,
                                patientLabel = processed.patientLabel,
                                blocksContent = processed.blocksContent,
                                renderedText = processed.renderedText,
                                sourceDevice = job.sourceDevice,
                                createdAtEpochMs = nowMs,
                            )
                        }
                    }
                    okCount++
                }.onFailure { err ->
                    lastErr = err.message ?: "erro"
                }
            }
            liveStatus = if (okCount > 0) {
                "$okCount evolução(ões) processada(s)!"
            } else {
                "Erro fila: ${lastErr.take(80)}"
            }
            liveStatusIsError = okCount == 0
            isProcessing = false
        }
    }

    private fun enqueueForOfflineRetry(file: File, lockedId: String?) {
        lifecycleScope.launch {
            val jobId = UUID.randomUUID().toString()
            PinVoiceDatabase.getInstance(this@MainActivity).dao().insertPendingAudio(
                PendingAudioEntity(
                    id = jobId,
                    filePath = file.absolutePath,
                    watchFileName = null,
                    watchNodeId = null,
                    sourceDevice = "android",
                    lockedTemplateId = lockedId,
                    createdAtEpochMs = System.currentTimeMillis(),
                ),
            )
            GeminiUploadWorker.enqueue(this@MainActivity, jobId)
        }
    }
}

@Composable
private fun PinVoicePhoneScreen(
    palette: PinVoicePalette,
    onToggleTheme: () -> Unit,
    showConfig: Boolean,
    onToggleConfig: () -> Unit,
    apiKey: String,
    onApiKeyChange: (String) -> Unit,
    geminiModel: String,
    onGeminiModelChange: (String) -> Unit,
    hospubAscii: Boolean,
    onHospubAsciiChange: (Boolean) -> Unit,
    sbUrl: String,
    onSbUrlChange: (String) -> Unit,
    sbAnon: String,
    onSbAnonChange: (String) -> Unit,
    isCloudSynced: Boolean,
    isSyncingCloud: Boolean,
    onSyncNow: () -> Unit,
    liveStatus: String,
    liveStatusIsError: Boolean,
    lockedTemplateId: String?,
    onLockTemplate: (String?) -> Unit,
    isRecording: Boolean,
    isProcessing: Boolean,
    pendingCount: Int,
    evolutions: List<EvolutionEntity>,
    copiedId: String?,
    onStartOrStopRecord: () -> Unit,
    onCancelRecord: () -> Unit,
    onRetryPending: () -> Unit,
    onOpenEditor: (EvolutionEntity) -> Unit,
    onCopyHospub: (EvolutionEntity) -> Unit,
    onDeleteEvolution: (String) -> Unit,
    onClearShift: () -> Unit,
) {
    var recSeconds by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }

    LaunchedEffect(isRecording) {
        if (isRecording) {
            recSeconds = 0
            while (true) {
                delay(1000)
                recSeconds++
            }
        }
    }

    val filteredEvolutions = remember(evolutions, searchQuery) {
        if (searchQuery.isBlank()) evolutions
        else {
            val q = searchQuery.trim().lowercase()
            evolutions.filter {
                it.patientLabel.lowercase().contains(q) ||
                    it.templateName.lowercase().contains(q) ||
                    it.renderedText.lowercase().contains(q)
            }
        }
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = palette.textPrimary,
        unfocusedTextColor = palette.textPrimary,
        focusedBorderColor = WaveColors.Cyan,
        unfocusedBorderColor = palette.border,
        focusedLabelColor = WaveColors.Cyan,
        unfocusedLabelColor = palette.textMuted,
        focusedContainerColor = palette.inputBg,
        unfocusedContainerColor = palette.inputBg,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        // Header Glassmorphism Clínico Premium
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(palette.glassStrong)
                .border(1.dp, palette.border, RoundedCornerShape(18.dp)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.5.dp)
                    .background(WaveColors.BrandGradient),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(WaveColors.PrimaryButtonGradient),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("PV", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "PinVoice",
                                color = palette.textPrimary,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Pro",
                                color = WaveColors.Cyan,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(WaveColors.Cyan.copy(alpha = 0.14f))
                                    .padding(horizontal = 6.dp, vertical = 1.dp),
                            )
                        }
                        Text(
                            text = if (isCloudSynced) "Nuvem Ativa • PC & Relógio" else "Local • Toque Sync ↻",
                            color = if (isCloudSynced) WaveColors.Emerald else palette.textMuted,
                            fontSize = 11.sp,
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Botão Sync Bidirecional
                    GlassActionPill(
                        label = if (isSyncingCloud) "..." else "Sync ↻",
                        palette = palette,
                        accent = if (isCloudSynced) WaveColors.Emerald else null,
                        onClick = onSyncNow,
                    )
                    // Alternador Claro / Escuro
                    GlassActionPill(
                        label = if (palette.isDark) "Claro" else "Escuro",
                        palette = palette,
                        accent = if (palette.isDark) WaveColors.Amber else WaveColors.Indigo,
                        onClick = onToggleTheme,
                    )
                    // Config
                    GlassActionPill(
                        label = if (showConfig) "Fechar" else "Config",
                        palette = palette,
                        accent = if (apiKey.isBlank()) WaveColors.Amber else null,
                        onClick = onToggleConfig,
                    )
                }
            }
        }

        // Painel de Configurações (BYOK + Modelo + Hospub ASCII + Supabase Modo Pessoal)
        if (showConfig) {
            Spacer(Modifier.height(10.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(palette.glassStrong)
                    .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                    .padding(14.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "CONFIGURAÇÕES DO MOTOR CLÍNICO",
                    color = WaveColors.Cyan,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = onApiKeyChange,
                    label = { Text("Gemini API Key (BYOK)") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = fieldColors,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                // Seletor rápido de modelo
                val models = listOf(
                    "gemini-3.5-flash-lite",
                    "gemini-flash-lite-latest",
                    "gemini-3.6-flash",
                    "gemini-3.5-flash",
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    models.forEach { m ->
                        TemplateChip(
                            label = m,
                            selected = geminiModel == m,
                            palette = palette,
                            onClick = { onGeminiModelChange(m) },
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Modo ASCII estrito (hb-hospub)", color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text("Remove acentos ao copiar p/ prontuário", color = palette.textMuted, fontSize = 11.sp)
                    }
                    Switch(
                        checked = hospubAscii,
                        onCheckedChange = onHospubAsciiChange,
                        colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = WaveColors.Cyan),
                    )
                }

                Text(
                    "NUVEM SUPABASE (MODO PESSOAL — SEM LOGIN)",
                    color = WaveColors.Blue,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                OutlinedTextField(
                    value = sbUrl,
                    onValueChange = onSbUrlChange,
                    label = { Text("Supabase URL") },
                    singleLine = true,
                    colors = fieldColors,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = sbAnon,
                    onValueChange = onSbAnonChange,
                    label = { Text("Supabase Publishable Key") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = fieldColors,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (evolutions.isNotEmpty()) {
                    OutlinedButton(
                        onClick = onClearShift,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("Limpar Histórico do Plantão", color = WaveColors.Crimson, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // RecordDock Glassmorphism (espelho do Web App)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(palette.glassSurface)
                .border(1.dp, palette.borderAccent, RoundedCornerShape(18.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                TemplateChip(
                    label = "Auto (Voz/IA)",
                    selected = lockedTemplateId == null,
                    palette = palette,
                    onClick = { if (!isRecording && !isProcessing) onLockTemplate(null) },
                )
                DefaultTemplates.all.forEach { tpl ->
                    TemplateChip(
                        label = tpl.name,
                        selected = lockedTemplateId == tpl.id,
                        palette = palette,
                        onClick = {
                            if (!isRecording && !isProcessing) {
                                onLockTemplate(if (lockedTemplateId == tpl.id) null else tpl.id)
                            }
                        },
                    )
                }
            }

            if (isProcessing) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(WaveColors.Cyan.copy(alpha = 0.16f))
                        .border(1.dp, WaveColors.Cyan.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = WaveColors.Cyan,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Gerando evolução...", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(
                                if (isRecording) {
                                    androidx.compose.ui.graphics.SolidColor(WaveColors.Crimson)
                                } else {
                                    WaveColors.PrimaryButtonGradient
                                },
                            )
                            .clickable(onClick = onStartOrStopRecord),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (isRecording) {
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .background(Color.White),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "CONCLUIR & GERAR (${"%02d:%02d".format(recSeconds / 60, recSeconds % 60)})",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                            } else {
                                Text(
                                    text = "NOVA GRAVAÇÃO",
                                    color = Color.White,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 0.5.sp,
                                )
                            }
                        }
                    }

                    if (isRecording) {
                        OutlinedButton(
                            onClick = onCancelRecord,
                            modifier = Modifier.height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text("Cancelar", color = palette.textMuted, fontSize = 12.sp)
                        }
                    }
                }
            }

            if (liveStatus.isNotBlank()) {
                Text(
                    text = liveStatus,
                    color = if (liveStatusIsError) WaveColors.Amber else WaveColors.Emerald,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        // Barra Fila Offline
        if (pendingCount > 0) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(WaveColors.Amber.copy(alpha = 0.14f))
                    .border(1.dp, WaveColors.Amber.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Fila Offline: $pendingCount áudio(s)",
                    color = WaveColors.Amber,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
                Button(
                    onClick = onRetryPending,
                    colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Amber),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text("Processar", color = Color(0xFF050914), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Busca rápida quando há mais de 3 evoluções
        if (evolutions.size > 3) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Buscar paciente, setor ou texto...", color = palette.textMuted, fontSize = 12.sp) },
                singleLine = true,
                colors = fieldColors,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(10.dp))

        // Cabeçalho Plantão
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "PLANTÃO (${filteredEvolutions.size})",
                color = palette.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
            )
            Text(
                text = "Toque para editar ou complementar",
                color = palette.textMuted,
                fontSize = 10.sp,
            )
        }

        Spacer(Modifier.height(6.dp))

        // Lista de Evoluções do Plantão
        if (filteredEvolutions.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(18.dp))
                    .background(palette.glassSurface)
                    .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (evolutions.isEmpty()) {
                        "Toque em NOVA GRAVAÇÃO e fale normalmente.\nEvoluções gravadas no PC e no Relógio também aparecem aqui automaticamente."
                    } else {
                        "Nenhuma evolução encontrada para a busca."
                    },
                    color = palette.textMuted,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 20.dp),
            ) {
                items(filteredEvolutions, key = { it.id }) { ev ->
                    EvolutionCard(
                        evolution = ev,
                        palette = palette,
                        isCopied = copiedId == ev.id,
                        onOpenEditor = { onOpenEditor(ev) },
                        onCopyHospub = { onCopyHospub(ev) },
                        onDelete = { onDeleteEvolution(ev.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EvolutionCard(
    evolution: EvolutionEntity,
    palette: PinVoicePalette,
    isCopied: Boolean,
    onOpenEditor: () -> Unit,
    onCopyHospub: () -> Unit,
    onDelete: () -> Unit,
) {
    val timeStr = remember(evolution.createdAtEpochMs) {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(evolution.createdAtEpochMs))
    }
    val deviceLabel = when (evolution.sourceDevice.lowercase()) {
        "wear" -> "Relógio"
        "web" -> "PC"
        else -> "Celular"
    }
    val deviceColor = when (evolution.sourceDevice.lowercase()) {
        "wear" -> WaveColors.Cyan
        "web" -> WaveColors.Indigo
        else -> WaveColors.Blue
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(palette.glassSurface)
            .border(1.dp, palette.border, RoundedCornerShape(18.dp))
            .clickable(onClick = onOpenEditor)
            .padding(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = evolution.patientLabel.ifBlank { "Paciente sem identificação" },
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = timeStr,
                color = palette.textMuted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            )
        }

        Spacer(Modifier.height(6.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = evolution.templateName,
                color = WaveColors.Cyan,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(WaveColors.Cyan.copy(alpha = 0.14f))
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
            Text(
                text = deviceLabel,
                color = deviceColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(deviceColor.copy(alpha = 0.14f))
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            )
            Text(
                text = "Áudio destruído",
                color = WaveColors.Emerald,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
            )
        }

        Spacer(Modifier.height(10.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(palette.inputBg)
                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                .padding(12.dp),
        ) {
            Text(
                text = evolution.renderedText,
                color = palette.textPrimary,
                fontSize = 13.sp,
                lineHeight = 19.sp,
                maxLines = 6,
                overflow = TextOverflow.Ellipsis,
                fontFamily = FontFamily.SansSerif,
            )
        }

        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(
                onClick = onOpenEditor,
                colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Cyan),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text("Editar / +Voz", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onCopyHospub,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isCopied) WaveColors.Emerald else WaveColors.Blue,
                ),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = if (isCopied) "Copiado!" else "Copiar p/ Hospub",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            OutlinedButton(
                onClick = onDelete,
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
            ) {
                Text("Excluir", color = palette.textMuted, fontSize = 11.sp)
            }
        }
    }
}

/**
 * Editor completo de texto livre no celular (paridade com o EvolutionEditor da Web):
 * Permite editar identificação e texto completo, complementar por voz, salvar na nuvem e copiar p/ Hospub.
 */
@Composable
private fun EvolutionEditorScreen(
    palette: PinVoicePalette,
    evolution: EvolutionEntity,
    hospubAscii: Boolean,
    isCopied: Boolean,
    isComplementRecording: Boolean,
    isComplementProcessing: Boolean,
    isBusy: Boolean,
    liveStatus: String,
    liveStatusIsError: Boolean,
    onBack: () -> Unit,
    onSave: (String, String) -> Unit,
    onStartComplement: () -> Unit,
    onStopComplement: () -> Unit,
    onCancelComplement: () -> Unit,
    onCopyHospub: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var patientLabel by remember(evolution.id, evolution.patientLabel) {
        mutableStateOf(evolution.patientLabel)
    }
    var editedText by remember(evolution.id, evolution.renderedText) {
        mutableStateOf(evolution.renderedText)
    }
    var recSeconds by remember { mutableIntStateOf(0) }
    var showUnsavedDialog by remember { mutableStateOf(false) }

    LaunchedEffect(isComplementRecording) {
        if (isComplementRecording) {
            recSeconds = 0
            while (true) {
                delay(1000)
                recSeconds++
            }
        }
    }

    val hasUnsavedChanges = patientLabel != evolution.patientLabel || editedText != evolution.renderedText
    val requestExit = {
        if (!isBusy) {
            if (hasUnsavedChanges) showUnsavedDialog = true else onBack()
        }
    }

    BackHandler(onBack = requestExit)

    if (showUnsavedDialog) {
        AlertDialog(
            onDismissRequest = { showUnsavedDialog = false },
            containerColor = palette.glassStrong,
            titleContentColor = palette.textPrimary,
            textContentColor = palette.textSecondary,
            title = { Text("Alterações não salvas", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = { Text("Deseja salvar suas edições nesta evolução antes de voltar?", fontSize = 13.sp) },
            confirmButton = {
                Button(
                    onClick = {
                        showUnsavedDialog = false
                        onSave(patientLabel, editedText)
                        onBack()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Emerald),
                ) {
                    Text("Salvar e sair", color = Color(0xFF050914), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showUnsavedDialog = false
                        onBack()
                    },
                ) {
                    Text("Descartar", color = WaveColors.Crimson)
                }
            },
        )
    }

    val wordCount = remember(editedText) {
        if (editedText.isBlank()) 0 else editedText.trim().split(Regex("\\s+")).size
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = palette.textPrimary,
        unfocusedTextColor = palette.textPrimary,
        focusedBorderColor = WaveColors.Cyan,
        unfocusedBorderColor = palette.border,
        focusedLabelColor = WaveColors.Cyan,
        unfocusedLabelColor = palette.textMuted,
        focusedContainerColor = palette.inputBg,
        unfocusedContainerColor = palette.inputBg,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        // Barra superior do Editor
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(palette.glassStrong)
                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                .padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlassActionPill(
                label = "← Voltar",
                palette = palette,
                onClick = requestExit,
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = evolution.templateName,
                    color = palette.textPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (hasUnsavedChanges) "Alterações não salvas" else "Salvo • ${evolution.sourceDevice}",
                    color = if (hasUnsavedChanges) WaveColors.Amber else WaveColors.Emerald,
                    fontSize = 10.sp,
                )
            }
            Button(
                onClick = { onSave(patientLabel, editedText) },
                enabled = hasUnsavedChanges && !isBusy,
                colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Emerald),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text("Salvar", color = Color(0xFF050914), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }
        }

        Spacer(Modifier.height(10.dp))

        // Barra Complementar por Voz
        if (isComplementProcessing) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(WaveColors.Cyan.copy(alpha = 0.16f))
                    .border(1.dp, WaveColors.Cyan.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = WaveColors.Cyan, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text("Integrando complemento por voz...", color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        } else if (isComplementRecording) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onStopComplement,
                    colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Crimson),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        "INTEGRAR COMPLEMENTO (${"%02d:%02d".format(recSeconds / 60, recSeconds % 60)})",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
                OutlinedButton(
                    onClick = onCancelComplement,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Cancelar", color = palette.textMuted, fontSize = 11.sp)
                }
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        if (hasUnsavedChanges) onSave(patientLabel, editedText)
                        onStartComplement()
                    },
                    enabled = !isBusy,
                    colors = ButtonDefaults.buttonColors(containerColor = WaveColors.Cyan),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text("+ Complementar por voz", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = { onCopyHospub(editedText) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isCopied) WaveColors.Emerald else WaveColors.Blue,
                    ),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(
                        text = if (isCopied) "Copiado!" else if (hospubAscii) "Copiar (ASCII)" else "Copiar Hospub",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        if (liveStatus.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = liveStatus,
                color = if (liveStatusIsError) WaveColors.Amber else WaveColors.Emerald,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(10.dp))

        // Campo Identificação do Paciente
        OutlinedTextField(
            value = patientLabel,
            onValueChange = { patientLabel = it },
            label = { Text("Paciente / Leito") },
            singleLine = true,
            colors = fieldColors,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(10.dp))

        // Editor de texto livre completo
        OutlinedTextField(
            value = editedText,
            onValueChange = { editedText = it },
            label = { Text("Texto da Evolução (edição livre)") },
            colors = fieldColors,
            shape = RoundedCornerShape(16.dp),
            textStyle = androidx.compose.ui.text.TextStyle(
                fontSize = 14.sp,
                lineHeight = 22.sp,
                fontFamily = FontFamily.SansSerif,
                color = palette.textPrimary,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )

        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "$wordCount palavras • ${editedText.length} caracteres",
                color = palette.textMuted,
                fontSize = 11.sp,
            )
            OutlinedButton(
                onClick = onDelete,
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text("Excluir evolução", color = WaveColors.Crimson, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun GlassActionPill(
    label: String,
    palette: PinVoicePalette,
    accent: Color? = null,
    onClick: () -> Unit,
) {
    val textColor = accent ?: palette.textPrimary
    val borderColor = accent?.copy(alpha = 0.45f) ?: palette.border
    val bgColor = accent?.copy(alpha = 0.12f) ?: palette.pillBg

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun TemplateChip(
    label: String,
    selected: Boolean,
    palette: PinVoicePalette,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (selected) WaveColors.PrimaryButtonGradient
                else androidx.compose.ui.graphics.SolidColor(palette.pillBg),
            )
            .border(
                1.dp,
                if (selected) Color.Transparent else palette.border,
                RoundedCornerShape(10.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            color = if (selected) Color.White else palette.textSecondary,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
        )
    }
}
