package com.pinvoice.shared

import kotlinx.serialization.Serializable
import java.text.Normalizer

@Serializable
data class TemplateBlock(
    val id: String,
    val title: String,
    val hint: String,
    val enabled: Boolean = true,
)

@Serializable
data class ClinicalTemplate(
    val id: String,
    val name: String,
    val description: String = "",
    val styleInstruction: String = "",
    val voiceTriggers: List<String> = emptyList(),
    val clinicalKeywords: List<String> = emptyList(),
    val blocks: List<TemplateBlock>,
    val isDefault: Boolean = false,
)

@Serializable
data class CopilotData(
    val pendencies: List<String> = emptyList(),
    val alerts: List<String> = emptyList(),
    val medications: List<String> = emptyList(),
    val exams: List<String> = emptyList(),
)

@Serializable
data class EvolutionPayload(
    val id: String,
    val templateId: String,
    val templateName: String,
    val selectionMode: String,
    val patientLabel: String,
    val blocksContent: Map<String, String>,
    val renderedText: String,
    val copilot: CopilotData,
    val sourceDevice: String,
    val audioPurgedAt: String?,
    val createdAt: String,
)

object ClinicalRenderer {
    private val emptyPatterns = listOf(
        Regex("^n[aã]o\\s+(informad[oa]s?|mencionad[oa]s?|relatad[oa]s?|referid[oa]s?|descrit[oa]s?|avaliad[oa]s?|citad[oa]s?|identificad[oa]s?|aplic[aá]vel)\\.?$", RegexOption.IGNORE_CASE),
        Regex("^(sem|nenhum[a]?|n[aã]o\\s+h[aá]|n[aã]o\\s+foram)\\s+.{0,60}(relatad[oa]s?|mencionad[oa]s?|citad[oa]s?|descrit[oa]s?|informad[oa]s?|identificad[oa]s?|no\\s+[aá]udio)\\.?$", RegexOption.IGNORE_CASE),
        Regex("^sem\\s+(dados|informa[cç][oõ]es|relato|queixas|antecedentes|exames(\\s+complementares)?|pend[eê]ncias|condutas)\\.?$", RegexOption.IGNORE_CASE),
        Regex("^n/?a\\.?$", RegexOption.IGNORE_CASE),
        Regex("^-+$"),
    )

    fun isBlockEmpty(value: String?): Boolean {
        val trimmed = value?.trim() ?: return true
        if (trimmed.isEmpty()) return true
        return emptyPatterns.any { it.matches(trimmed) }
    }

    /**
     * Renderiza os blocos na ordem do template, OMITINDO rigorosamente blocos vazios.
     */
    fun renderEvolutionBlocks(
        template: ClinicalTemplate,
        blocksContent: Map<String, String>,
    ): String {
        return template.blocks
            .filter { it.enabled }
            .mapNotNull { block ->
                val raw = blocksContent[block.id]?.trim()
                if (isBlockEmpty(raw)) return@mapNotNull null
                val title = block.title.trim()
                val titlePattern = Regex("^${Regex.escape(title)}\\s*[:\\-—–]?\\s*", RegexOption.IGNORE_CASE)
                var cleanBody = raw!!.replaceFirst(titlePattern, "").trim()
                if (block.id == "exame_fisico" || block.id == "objetivo") {
                    cleanBody = cleanBody
                        .replaceFirst(Regex("^exame\\s+f[ií]sico\\s*[:\\-—–]?\\s*", RegexOption.IGNORE_CASE), "")
                        .replace(Regex("([^\\n])\\s+(Geral|Neuro|SSVV|ACV|AR|ABD|EXT|Pele|Ferida Operat[oó]ria|FO|Drenos)\\s*:", RegexOption.IGNORE_CASE), "$1\n$2:")
                }
                if (block.id == "hipoteses" || block.id == "avaliacao") {
                    cleanBody = cleanBody
                        .replace(Regex("\\s*[—–-]?\\s+([a-f]\\))\\s+"), "\n$1 ")
                        .replace(Regex("([^\\n])\\s+([2-9]\\.)\\s+"), "$1\n$2 ")
                }
                if (block.id == "pendencias") {
                    cleanBody = cleanBody.replace(Regex("([^\\n])\\s+-\\s+"), "$1\n- ")
                }
                if (isBlockEmpty(cleanBody)) null else "$title\n${cleanBody.trim()}"
            }
            .joinToString("\n\n")
    }

    fun sanitizeForHospub(text: String, asciiOnly: Boolean = false): String {
        var out = text
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .replace(Regex("^#{1,6}\\s+", RegexOption.MULTILINE), "")
            .replace(Regex("\\*\\*(.*?)\\*\\*"), "$1")
            .replace(Regex("__(.*?)__"), "$1")
            .replace(Regex("`([^`]+)`"), "$1")
            .replace("—", "-")
            .replace("–", "-")

        if (asciiOnly) {
            out = Normalizer.normalize(out, Normalizer.Form.NFD)
                .replace(Regex("[\\u0300-\\u036f]"), "")
                .replace(Regex("[^\\x20-\\x7E\\n\\t]"), "")
        }

        return out.replace(Regex("\\n{3,}"), "\n\n").trim()
    }
}
