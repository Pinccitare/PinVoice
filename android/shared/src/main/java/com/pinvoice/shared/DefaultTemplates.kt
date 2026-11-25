package com.pinvoice.shared

/**
 * Espelho exato v3 dos 5 templates padrão (Clínica, Cirúrgica, PS, UTI, APS)
 * definidos no Web App, em bloco único integrado (sem painel Copilot separado).
 */
object DefaultTemplates {
    private const val EXAME_COMPLETO =
        "EXAME FÍSICO COMPLETO nas 6 linhas (Geral, Neuro, ACV, AR, ABD, EXT). Inclua os achados citados e preencha de modo fisiológico sem alterações os conjuntos não citados."
    private const val EXAME_RESTRITO =
        "EXAME FÍSICO RESTRITO: incluir EXCLUSIVAMENTE o que foi descrito no áudio (incluindo FO/drenos se citados). NÃO preencher sistemas fisiológicos não mencionados."
    private const val ANTECEDENTES_HINT =
        "Comorbidades prévias, Medicações de uso habitual registradas, orientações de especialistas, História familiar e Hábitos de vida (apenas o citado)."
    private const val HIPOTESES_HINT =
        "Lista numerada: 1. Problema Principal — status com subitens a), b), c); 2. Problema secundário; 3. Comorbidades de base."
    private const val CONDUTAS_HINT =
        "Manejo por problema/comorbidade (fármaco, dose, via, dia de ATB, suspensões em CAIXA ALTA) e Manejo Álgico / Sintomáticos."
    private const val PENDENCIAS_HINT =
        "Lista com hífen (- ...) de exames, pareceres, checagens e reavaliações pendentes."

    val all: List<ClinicalTemplate> = listOf(
        ClinicalTemplate(
            id = "clinica",
            name = "Clínica",
            description = "Evolução completa de enfermaria com foco cronológico e exame físico completo.",
            styleInstruction = "MODELO CLÍNICA: Completo, detalhado, foco cronológico rigoroso. Mantém HDA e Evolução 12h/24h separados. Exame físico COMPLETO (fisiológico nos não citados).",
            voiceTriggers = listOf("evolução clínica", "modelo clínica", "clínica médica", "enfermaria"),
            clinicalKeywords = listOf("DIH", "enfermaria", "estabilidade hemodinâmica", "afebril", "antibioticoterapia"),
            isDefault = true,
            blocks = listOf(
                TemplateBlock("cabecalho", "EVOLUÇÃO MÉDICA HOSPITALAR", "Identificação completa + linha DIH se citada."),
                TemplateBlock("hipoteses", "HIPÓTESES DIAGNÓSTICAS", HIPOTESES_HINT),
                TemplateBlock("hda", "HISTÓRIA DA DOENÇA ATUAL", "Parágrafo único fluido em ORDEM CRONOLÓGICA."),
                TemplateBlock("exame_fisico", "EXAME FÍSICO", EXAME_COMPLETO),
                TemplateBlock("antecedentes", "ANTECEDENTES", ANTECEDENTES_HINT),
                TemplateBlock("exames_complementares", "EXAMES COMPLEMENTARES", "Descrição objetiva e cronológica dos exames relevantes."),
                TemplateBlock("evolucao_24h", "EVOLUÇÃO DAS ÚLTIMAS 12H / 24H", "Leito, acompanhante, consciência, O2, hemodinâmica, febre, sono, dieta, diurese, evacuações, queixas."),
                TemplateBlock("condutas", "CONDUTAS/PROGRAMAÇÃO", CONDUTAS_HINT),
                TemplateBlock("pendencias", "PENDÊNCIAS", PENDENCIAS_HINT),
            ),
        ),
        ClinicalTemplate(
            id = "cirurgica",
            name = "Cirúrgica",
            description = "Linguajar direto, doença atual + evolução juntas e exame físico somente do descrito.",
            styleInstruction = "MODELO CIRÚRGICA: Linguajar bem direto. Doença Atual + Evolução juntas em HISTÓRIA DA DOENÇA ATUAL. Exame físico SOMENTE do descrito no áudio.",
            voiceTriggers = listOf("evolução cirúrgica", "modelo cirúrgico", "cirurgia", "pós-operatório"),
            clinicalKeywords = listOf("PO", "pós-operatório", "ferida operatória", "FO", "dreno", "desbridamento", "flatos"),
            isDefault = true,
            blocks = listOf(
                TemplateBlock("cabecalho", "EVOLUÇÃO MÉDICA HOSPITALAR", "Identificação direta + PO/procedimento + DIH se citado."),
                TemplateBlock("hipoteses", "HIPÓTESES DIAGNÓSTICAS", HIPOTESES_HINT),
                TemplateBlock("hda", "HISTÓRIA DA DOENÇA ATUAL", "Bloco unificado e DIRETO com doença atual/procedimento + evolução 12h/24h."),
                TemplateBlock("exame_fisico", "EXAME FÍSICO", EXAME_RESTRITO),
                TemplateBlock("antecedentes", "ANTECEDENTES", ANTECEDENTES_HINT),
                TemplateBlock("exames_complementares", "EXAMES COMPLEMENTARES", "Resultados objetivos relevantes citados."),
                TemplateBlock("condutas", "CONDUTAS/PROGRAMAÇÃO", CONDUTAS_HINT),
                TemplateBlock("pendencias", "PENDÊNCIAS", PENDENCIAS_HINT),
            ),
        ),
        ClinicalTemplate(
            id = "ps",
            name = "PS",
            description = "Linguajar direto igual Cirúrgica, doença atual + evolução juntas e exame físico completo.",
            styleInstruction = "MODELO PS: Mesma estrutura direta de Cirúrgica (Doença Atual + Evolução juntas), PORÉM com EXAME FÍSICO COMPLETO (fisiológico nos não citados).",
            voiceTriggers = listOf("ficha de emergência", "pronto socorro", "evolução ps", "upa"),
            clinicalKeywords = listOf("UPA", "pronto-socorro", "PS", "sala vermelha", "sinais de alarme", "observação"),
            isDefault = true,
            blocks = listOf(
                TemplateBlock("cabecalho", "EVOLUÇÃO MÉDICA HOSPITALAR", "Identificação direta + data da consulta se citada."),
                TemplateBlock("hipoteses", "HIPÓTESES DIAGNÓSTICAS", HIPOTESES_HINT),
                TemplateBlock("hda", "HISTÓRIA DA DOENÇA ATUAL", "Bloco unificado e DIRETO com queixa, cronologia, sinais de alarme e evolução."),
                TemplateBlock("exame_fisico", "EXAME FÍSICO", EXAME_COMPLETO),
                TemplateBlock("antecedentes", "ANTECEDENTES", ANTECEDENTES_HINT),
                TemplateBlock("exames_complementares", "EXAMES COMPLEMENTARES", "ECG, labs, gasometria, troponina ou imagem no PS."),
                TemplateBlock("condutas", "CONDUTAS/PROGRAMAÇÃO", CONDUTAS_HINT),
                TemplateBlock("pendencias", "PENDÊNCIAS", PENDENCIAS_HINT),
            ),
        ),
        ClinicalTemplate(
            id = "uti",
            name = "UTI",
            description = "Igual Clínica (completo e cronológico), porém mais direto e evolução 24h unificada.",
            styleInstruction = "MODELO UTI: Igual à Clínica (completo e cronológico), porém com linguajar mais direto. Evolução 24h inserida dentro de HISTÓRIA DA DOENÇA ATUAL. Exame físico COMPLETO.",
            voiceTriggers = listOf("evolução uti", "terapia intensiva", "modelo uti", "cti"),
            clinicalKeywords = listOf("UTI", "ventilação mecânica", "TOT", "DVA", "noradrenalina", "RASS", "balanço hídrico"),
            isDefault = true,
            blocks = listOf(
                TemplateBlock("cabecalho", "EVOLUÇÃO MÉDICA HOSPITALAR", "Identificação completa + DIH/DIH-UTI se citado."),
                TemplateBlock("hipoteses", "HIPÓTESES DIAGNÓSTICAS", HIPOTESES_HINT),
                TemplateBlock("hda", "HISTÓRIA DA DOENÇA ATUAL", "Resumo cronológico mais direto integrando admissão + evolução 12h/24h (dispositivos, VM, DVA, RASS, BH)."),
                TemplateBlock("exame_fisico", "EXAME FÍSICO", EXAME_COMPLETO),
                TemplateBlock("antecedentes", "ANTECEDENTES", ANTECEDENTES_HINT),
                TemplateBlock("exames_complementares", "EXAMES COMPLEMENTARES", "Gasometria, lactato, labs, culturas e imagem."),
                TemplateBlock("condutas", "CONDUTAS/PROGRAMAÇÃO", CONDUTAS_HINT),
                TemplateBlock("pendencias", "PENDÊNCIAS", PENDENCIAS_HINT),
            ),
        ),
        ClinicalTemplate(
            id = "aps",
            name = "APS",
            description = "Modelo completo transformado para o método SOAP.",
            styleInstruction = "MODELO APS (SOAP): Identificação, S — SUBJETIVO (HDA + Antecedentes), O — OBJETIVO (Exame Físico COMPLETO + Exames trazidos), A — AVALIAÇÃO (Hipóteses numeradas), P — PLANO (Condutas + Pendências).",
            voiceTriggers = listOf("evolução aps", "atenção primária", "ambulatório", "soap"),
            clinicalKeywords = listOf("UBS", "APS", "ambulatório", "renovação de receita", "retorno", "hipertensão", "diabetes"),
            isDefault = true,
            blocks = listOf(
                TemplateBlock("cabecalho", "EVOLUÇÃO MÉDICA — APS", "Identificação + data da consulta se citada."),
                TemplateBlock("subjetivo", "S — SUBJETIVO", "HDA/motivo da consulta + Antecedentes (comorbidades, medicações habituais, história familiar, hábitos)."),
                TemplateBlock("objetivo", "O — OBJETIVO", "$EXAME_COMPLETO Inclua SSVV/antropometria e exames trazidos se citados."),
                TemplateBlock("avaliacao", "A — AVALIAÇÃO", HIPOTESES_HINT),
                TemplateBlock("plano", "P — PLANO", "$CONDUTAS_HINT Orientações, retorno e PENDÊNCIAS (- ...)."),
            ),
        ),
    )
}
