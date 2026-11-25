package com.pinvoice.wear

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// Visual Stealth OLED ultra-discreto: preto puro + borda fininha da imagem enviada
private val PureOledBlack = Color(0xFF000000)
private val StealthDimText = Color(0xFF64748B)
private val StealthClockText = Color(0xFFCBD5E1)
private val WaveIndigo = Color(0xFF4F67B8)
private val WaveBlue = Color(0xFF2B7BBB)
private val WaveCyan = Color(0xFF0D9488)
private val WaveEmerald = Color(0xFF10B981)
private val SubtleAmber = Color(0xFFD97706)

private enum class WearPhase { RECORDING, SENDING, SENT, QUEUED, IDLE }

/**
 * PinVoice Wear OS v2.0 — Modo Ultra-Discreto + Envio Direto p/ Nuvem:
 * - Fundo OLED preto puro com apenas o relógio discreto no centro e a borda bem fininha
 *   no gradiente Índigo -> Azul -> Ciano -> Esmeralda pulsando suavemente com a voz.
 * - Toque em qualquer ponto da tela ou aperte 2x o botão lateral para finalizar:
 *   envia direto Relógio -> Gemini -> Supabase -> Web (sem app intermediário) e fecha sozinho!
 */
class MainActivity : ComponentActivity() {
    private lateinit var recorder: WearAudioRecorder
    private val cloudClient = DirectCloudClient()

    private var phase by mutableStateOf(WearPhase.IDLE)
    private var voiceLevel by mutableFloatStateOf(0.12f)
    private var statusHint by mutableStateOf("")

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) startCapture() else statusHint = "Microfone negado"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Mantém CPU/rede ativos enquanto grava e envia (evita Wear OS congelar o upload)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        recorder = WearAudioRecorder(this)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            startCapture()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }

        setContent {
            StealthWearScreen(
                phase = phase,
                voiceLevel = voiceLevel,
                statusHint = statusHint,
                onSampleAmplitude = {
                    voiceLevel = if (phase == WearPhase.RECORDING) recorder.getVoiceAmplitude() else 0f
                },
                onTapScreen = {
                    when (phase) {
                        WearPhase.RECORDING -> stopAndSendDirect()
                        WearPhase.IDLE, WearPhase.SENT, WearPhase.QUEUED -> startCapture()
                        WearPhase.SENDING -> Unit
                    }
                },
            )
        }
    }

    // Duplo clique no botão físico enquanto grava -> finaliza e envia automaticamente!
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (phase == WearPhase.RECORDING) {
            stopAndSendDirect()
        } else if (phase != WearPhase.SENDING) {
            startCapture()
        }
    }

    private fun startCapture() {
        runCatching {
            recorder.startRecording()
            phase = WearPhase.RECORDING
            statusHint = ""
        }.onFailure {
            phase = WearPhase.IDLE
            statusHint = "Erro mic"
        }
    }

    private fun stopAndSendDirect() {
        val file = recorder.stopRecording()
        voiceLevel = 0f
        if (file == null || !file.exists() || file.length() == 0L) {
            phase = WearPhase.IDLE
            statusHint = "Vazio"
            return
        }

        phase = WearPhase.SENDING
        statusHint = "Enviando..."
        lifecycleScope.launch {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PinVoice::WearUpload")
            wl.acquire(35_000L)
            val result = try {
                withContext(Dispatchers.IO) {
                    runCatching { cloudClient.processAndPublish(file) }
                }
            } finally {
                if (wl.isHeld) wl.release()
            }

            result.onSuccess {
                phase = WearPhase.SENT
                statusHint = "✓"
                delay(900)
                finish()
            }.onFailure { err ->
                // Mostra motivo curto (ex.: Timeout / Sem rede) e enfileira retry automático
                WearUploadWorker.enqueue(this@MainActivity, file)
                phase = WearPhase.QUEUED
                val shortErr = when {
                    err.message?.contains("Unable to resolve", true) == true -> "Sem rede"
                    err.message?.contains("timeout", true) == true -> "Timeout"
                    else -> (err.message ?: "Na fila").take(18)
                }
                statusHint = shortErr
                delay(2400)
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (phase == WearPhase.RECORDING) recorder.stopSilently()
    }
}

@Composable
private fun StealthWearScreen(
    phase: WearPhase,
    voiceLevel: Float,
    statusHint: String,
    onSampleAmplitude: () -> Unit,
    onTapScreen: () -> Unit,
) {
    var seconds by remember { mutableIntStateOf(0) }
    var animPhase by remember { mutableFloatStateOf(0f) }
    var clockText by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        val fmt = SimpleDateFormat("HH:mm", Locale.getDefault())
        while (true) {
            clockText = fmt.format(Date())
            delay(5000)
        }
    }

    LaunchedEffect(phase) {
        if (phase == WearPhase.RECORDING) {
            seconds = 0
            while (true) {
                delay(1000)
                seconds++
            }
        }
    }

    LaunchedEffect(phase) {
        if (phase == WearPhase.RECORDING || phase == WearPhase.SENDING) {
            while (true) {
                onSampleAmplitude()
                animPhase = (animPhase + 0.22f) % (2f * PI.toFloat())
                delay(70)
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PureOledBlack)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onTapScreen,
            ),
        contentAlignment = Alignment.Center,
    ) {
        // Borda ultra-fininha no gradiente da imagem (Índigo -> Azul -> Ciano -> Esmeralda)
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2f, size.height / 2f)
            val outerRadius = (size.minDimension / 2f) - 1.5.dp.toPx()

            when (phase) {
                WearPhase.RECORDING -> {
                    val waveBrush = Brush.sweepGradient(
                        colors = listOf(WaveIndigo, WaveBlue, WaveCyan, WaveEmerald, WaveCyan, WaveIndigo),
                        center = center,
                    )
                    // Aro ultra-fino (1.6dp)
                    drawCircle(
                        brush = waveBrush,
                        radius = outerRadius,
                        center = center,
                        style = Stroke(width = 1.6.dp.toPx()),
                    )
                    // Micro-barras sutis (máx 4.5dp) reagindo discretamente à voz
                    val barCount = 52
                    val minLen = 1.2.dp.toPx()
                    val maxLen = 4.6.dp.toPx()
                    val strokeW = 1.3.dp.toPx()
                    for (i in 0 until barCount) {
                        val angle = (i.toFloat() / barCount) * 2f * PI.toFloat()
                        val mod = 0.5f + 0.5f * sin(angle * 4f + animPhase)
                        val len = minLen + (maxLen - minLen) * mod * (0.3f + 0.7f * voiceLevel)
                        val startR = outerRadius - len
                        drawLine(
                            brush = waveBrush,
                            start = Offset(center.x + startR * cos(angle), center.y + startR * sin(angle)),
                            end = Offset(center.x + outerRadius * cos(angle), center.y + outerRadius * sin(angle)),
                            strokeWidth = strokeW,
                            cap = StrokeCap.Round,
                        )
                    }
                }
                WearPhase.SENDING -> {
                    drawCircle(
                        color = WaveCyan.copy(alpha = 0.65f),
                        radius = outerRadius,
                        center = center,
                        style = Stroke(width = 1.8.dp.toPx()),
                    )
                }
                WearPhase.SENT -> {
                    drawCircle(
                        color = WaveEmerald,
                        radius = outerRadius,
                        center = center,
                        style = Stroke(width = 2.dp.toPx()),
                    )
                }
                WearPhase.QUEUED -> {
                    drawCircle(
                        color = SubtleAmber,
                        radius = outerRadius,
                        center = center,
                        style = Stroke(width = 1.8.dp.toPx()),
                    )
                }
                WearPhase.IDLE -> Unit
            }
        }

        // Centro ultra-discreto: parece apenas o relógio em modo repouso
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = clockText,
                color = StealthClockText.copy(alpha = 0.78f),
                fontSize = 30.sp,
                fontWeight = FontWeight.Light,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = when (phase) {
                    WearPhase.RECORDING -> "%02d:%02d".format(seconds / 60, seconds % 60)
                    WearPhase.SENDING -> statusHint
                    WearPhase.SENT -> "✓"
                    WearPhase.QUEUED -> statusHint
                    WearPhase.IDLE -> statusHint.ifBlank { "Toque" }
                },
                color = when (phase) {
                    WearPhase.RECORDING -> WaveCyan.copy(alpha = 0.85f)
                    WearPhase.SENT -> WaveEmerald
                    WearPhase.QUEUED -> SubtleAmber
                    else -> StealthDimText
                },
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
        }
    }
}
