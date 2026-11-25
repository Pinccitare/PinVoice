package com.pinvoice.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

object WaveColors {
    val Indigo = Color(0xFF4F67B8)
    val Blue = Color(0xFF2B7BBB)
    val Cyan = Color(0xFF0D9488)
    val Emerald = Color(0xFF10B981)
    val Crimson = Color(0xFFEF4444)
    val Amber = Color(0xFFF59E0B)

    val BrandGradient = Brush.horizontalGradient(
        colors = listOf(Indigo, Blue, Cyan, Emerald),
    )

    val PrimaryButtonGradient = Brush.horizontalGradient(
        colors = listOf(Indigo, Blue, Cyan),
    )
}

data class PinVoicePalette(
    val isDark: Boolean,
    val bgBase: Color,
    val glassSurface: Color,
    val glassStrong: Color,
    val inputBg: Color,
    val pillBg: Color,
    val border: Color,
    val borderAccent: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
)

fun pinVoicePalette(isDark: Boolean): PinVoicePalette = if (isDark) {
    PinVoicePalette(
        isDark = true,
        bgBase = Color(0xFF050914),
        glassSurface = Color(0xBA0E172B),
        glassStrong = Color(0xDE0B1325),
        inputBg = Color(0xCC060B17),
        pillBg = Color(0xB3121E36),
        border = Color(0x2694A3B8),
        borderAccent = Color(0x520D9488),
        textPrimary = Color(0xFFF8FAFC),
        textSecondary = Color(0xFFCBD5E1),
        textMuted = Color(0xFF94A3B8),
    )
} else {
    PinVoicePalette(
        isDark = false,
        bgBase = Color(0xFFEEF4FA),
        glassSurface = Color(0xCCFFFFFF),
        glassStrong = Color(0xEBFFFFFF),
        inputBg = Color(0xEBF8FAFC),
        pillBg = Color(0xDCF1F5F9),
        border = Color(0x1F0F172A),
        borderAccent = Color(0x590D9488),
        textPrimary = Color(0xFF0F172A),
        textSecondary = Color(0xFF334155),
        textMuted = Color(0xFF64748B),
    )
}

/**
 * Fundo contínuo animado "Glassmorphism Clínico Premium":
 * Orbes aurora sutis + ondas fluidas na paleta do relógio (#4F67B8 -> #2B7BBB -> #0D9488 -> #10B981).
 */
@Composable
fun AnimatedAuroraBackground(
    palette: PinVoicePalette,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "aurora")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 22000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "auroraPhase",
    )

    val orbAlpha = if (palette.isDark) 0.24f else 0.16f
    val waveAlpha = if (palette.isDark) 0.13f else 0.10f

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(palette.bgBase),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            // Orbe 1: Índigo -> Azul (topo esquerdo)
            val c1 = Offset(
                x = w * (0.16f + 0.10f * sin(phase)),
                y = h * (0.10f + 0.05f * cos(phase)),
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        WaveColors.Indigo.copy(alpha = orbAlpha),
                        WaveColors.Blue.copy(alpha = orbAlpha * 0.45f),
                        Color.Transparent,
                    ),
                    center = c1,
                    radius = w * 0.72f,
                ),
                radius = w * 0.72f,
                center = c1,
            )

            // Orbe 2: Ciano -> Azul (meio direito)
            val c2 = Offset(
                x = w * (0.86f + 0.08f * cos(phase * 0.8f)),
                y = h * (0.38f + 0.07f * sin(phase * 0.8f)),
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        WaveColors.Cyan.copy(alpha = orbAlpha),
                        WaveColors.Blue.copy(alpha = orbAlpha * 0.35f),
                        Color.Transparent,
                    ),
                    center = c2,
                    radius = w * 0.76f,
                ),
                radius = w * 0.76f,
                center = c2,
            )

            // Orbe 3: Esmeralda (base)
            val c3 = Offset(
                x = w * (0.45f + 0.12f * sin(phase * 0.6f + 1.2f)),
                y = h * (0.88f + 0.05f * cos(phase * 0.6f)),
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        WaveColors.Emerald.copy(alpha = orbAlpha * 0.9f),
                        WaveColors.Cyan.copy(alpha = orbAlpha * 0.3f),
                        Color.Transparent,
                    ),
                    center = c3,
                    radius = w * 0.78f,
                ),
                radius = w * 0.78f,
                center = c3,
            )

            // Onda fluida sutil no rodapé
            val waveTop = h * 0.82f
            val path = Path().apply {
                moveTo(0f, h)
                lineTo(0f, waveTop)
                val steps = 28
                for (i in 0..steps) {
                    val x = (w / steps) * i
                    val norm = i.toFloat() / steps
                    val y = waveTop + sin(norm * 2f * PI.toFloat() + phase) * 26f +
                        cos(norm * 3f * PI.toFloat() - phase * 0.7f) * 12f
                    lineTo(x, y)
                }
                lineTo(w, h)
                close()
            }
            drawPath(
                path = path,
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        WaveColors.Indigo.copy(alpha = waveAlpha),
                        WaveColors.Blue.copy(alpha = waveAlpha),
                        WaveColors.Cyan.copy(alpha = waveAlpha),
                        WaveColors.Emerald.copy(alpha = waveAlpha),
                    ),
                ),
            )
        }
    }
}
