import type { ClinicalTemplate } from '../types/clinical';

export const DEFAULT_TEMPLATES_VERSION = 3;
const NOW = '2026-11-24T19:10:00.000Z';

const EXAME_FISICO_COMPLETO_HINT =
  'EXAME FÍSICO COMPLETO estruturado nas 6 linhas (Geral, Neuro, ACV, AR, ABD, EXT). Inclua os achados citados no áudio e, para os conjuntos NÃO citados, preencha de modo fisiológico sem alterações (ex.: Geral: BEG, corado, hidratado, acianótico, anictérico, afebril; Neuro: Glasgow 15, pupilas isofotorreagentes, sem déficits focais; ACV: RCR em 2T, BNF, sem sopros; AR: MV+ bilateralmente sem RA; ABD: Plano, flácido, RHA+, indolor; EXT: Aquecidas, bem perfundidas, TEC < 3s, sem edema, panturrilhas livres, pulsos periféricos presentes e simétricos).';

const EXAME_FISICO_SOMENTE_DESCRITO_HINT =
  'EXAME FÍSICO RESTRITO: incluir EXCLUSIVAMENTE os sistemas e achados realmente descritos no áudio (incluindo ferida operatória/drenos se citados). NÃO preencher sistemas fisiológicos não mencionados.';

const ANTECEDENTES_HINT =
  'Bloco único agrupando apenas o que foi citado: comorbidades prévias (uma por linha), Medicações de uso habitual registradas (fármacos e posologias), orientações de especialistas/pareceres prévios, História familiar e Hábitos de vida (atividade física, tabagismo, etilismo).';

const HIPOTESES_HINT =
  'Lista numerada: 1. Problema Principal — status (ativo/em investigação/resolvido) com subitens a) dados objetivos/evolução laboratorial datada, b) manifestações clínicas associadas, c) hipóteses etiológicas; 2. Problema secundário; 3. Comorbidades de base especificando controle/risco.';

const CONDUTAS_HINT =
  'Manejo por problema/comorbidade (fármaco, dose, via, posologia, dia de ATB; destacar em CAIXA ALTA se SUSPENSO PARA INVESTIGAÇÃO ou alerta crítico) e Manejo Álgico / Sintomáticos.';

const PENDENCIAS_HINT =
  'Lista com hífen (- ...) de solicitações de exames com data programada, pareceres, checagens de segurança e reavaliações pendentes.';

export const DEFAULT_TEMPLATES: ClinicalTemplate[] = [
  {
    id: 'clinica',
    name: 'Clínica',
    description: 'Evolução completa de enfermaria com foco cronológico detalhado e exame físico completo.',
    styleInstruction:
      'MODELO CLÍNICA: Completo, detalhado e com FOCO CRONOLÓGICO rigoroso dos eventos, exames datados e resposta terapêutica. Mantém HISTÓRIA DA DOENÇA ATUAL e EVOLUÇÃO DAS ÚLTIMAS 12H / 24H separados. EXAME FÍSICO COMPLETO: sistemas não citados devem ser preenchidos de modo fisiológico sem alterações. Incorpore medicações/alertas em CONDUTAS/PROGRAMAÇÃO e checagens em PENDÊNCIAS.',
    voiceTriggers: [
      'evolução clínica',
      'modelo clínica',
      'clínica médica',
      'enfermaria',
    ],
    clinicalKeywords: [
      'DIH',
      'enfermaria',
      'estabilidade hemodinâmica',
      'afebril',
      'antibioticoterapia',
      'internação',
      'alta hospitalar',
    ],
    isDefault: true,
    updatedAt: NOW,
    blocks: [
      {
        id: 'cabecalho',
        title: 'EVOLUÇÃO MÉDICA HOSPITALAR',
        hint: 'Identificação completa (Nome, idade, sexo, cor/raça, estado civil, profissão, escolaridade, naturalidade, residência, acompanhante — apenas o citado) seguida da linha "DIH: [data de internação/consulta]" se citada.',
        enabled: true,
      },
      {
        id: 'hipoteses',
        title: 'HIPÓTESES DIAGNÓSTICAS',
        hint: HIPOTESES_HINT,
        enabled: true,
      },
      {
        id: 'hda',
        title: 'HISTÓRIA DA DOENÇA ATUAL',
        hint: 'Parágrafo único fluido em ORDEM CRONOLÓGICA sintetizando idade, antecedentes relevantes, data/serviço de admissão inicial, sintomas motivadores, linha do tempo pré-hospitalar, achados iniciais, condutas na urgência/UTI e resposta evolutiva até o momento.',
        enabled: true,
      },
      {
        id: 'exame_fisico',
        title: 'EXAME FÍSICO',
        hint: EXAME_FISICO_COMPLETO_HINT,
        enabled: true,
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES',
        hint: ANTECEDENTES_HINT,
        enabled: true,
      },
      {
        id: 'exames_complementares',
        title: 'EXAMES COMPLEMENTARES',
        hint: 'Descrição objetiva e cronológica dos exames relevantes e sua evolução.',
        enabled: true,
      },
      {
        id: 'evolucao_24h',
        title: 'EVOLUÇÃO DAS ÚLTIMAS 12H / 24H',
        hint: 'Paciente em leito de enfermaria, acompanhante, consciência/orientação, ar ambiente/O2, hemodinâmica, curva térmica 24h, sono, dieta, diurese, evacuações e queixas no período.',
        enabled: true,
      },
      {
        id: 'condutas',
        title: 'CONDUTAS/PROGRAMAÇÃO',
        hint: CONDUTAS_HINT,
        enabled: true,
      },
      {
        id: 'pendencias',
        title: 'PENDÊNCIAS',
        hint: PENDENCIAS_HINT,
        enabled: true,
      },
    ],
  },
  {
    id: 'cirurgica',
    name: 'Cirúrgica',
    description: 'Linguajar direto, doença atual + evolução juntas e exame físico somente do descrito.',
    styleInstruction:
      'MODELO CIRÚRGICA: Linguajar BEM DIRETO e objetivo. Junte Doença Atual e Evolução de 12h/24h em um único bloco (HISTÓRIA DA DOENÇA ATUAL). REGRA DO EXAME FÍSICO: descreva SOMENTE o que foi efetivamente falado no áudio — NÃO adicione sistemas fisiológicos não mencionados. Incorpore medicações/alertas em CONDUTAS/PROGRAMAÇÃO e pendências em PENDÊNCIAS.',
    voiceTriggers: [
      'evolução cirúrgica',
      'modelo cirúrgico',
      'cirurgia',
      'pós-operatório',
    ],
    clinicalKeywords: [
      'PO',
      'pós-operatório',
      'ferida operatória',
      'FO',
      'dreno',
      'desbridamento',
      'laparotomia',
      'curativo',
      'flatos',
      'deiscência',
    ],
    isDefault: true,
    updatedAt: NOW,
    blocks: [
      {
        id: 'cabecalho',
        title: 'EVOLUÇÃO MÉDICA HOSPITALAR',
        hint: 'Identificação direta (Nome, idade, sexo, acompanhante se citado, PO/procedimento) + linha "DIH: [data]" se citada.',
        enabled: true,
      },
      {
        id: 'hipoteses',
        title: 'HIPÓTESES DIAGNÓSTICAS',
        hint: HIPOTESES_HINT,
        enabled: true,
      },
      {
        id: 'hda',
        title: 'HISTÓRIA DA DOENÇA ATUAL',
        hint: 'Bloco unificado e DIRETO contendo doença atual/procedimento + evolução das últimas 12h/24h (dor, dieta, flatos/evacuações, diurese, deambulação, febre).',
        enabled: true,
      },
      {
        id: 'exame_fisico',
        title: 'EXAME FÍSICO',
        hint: EXAME_FISICO_SOMENTE_DESCRITO_HINT,
        enabled: true,
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES',
        hint: ANTECEDENTES_HINT,
        enabled: true,
      },
      {
        id: 'exames_complementares',
        title: 'EXAMES COMPLEMENTARES',
        hint: 'Resultados objetivos relevantes citados no áudio.',
        enabled: true,
      },
      {
        id: 'condutas',
        title: 'CONDUTAS/PROGRAMAÇÃO',
        hint: CONDUTAS_HINT,
        enabled: true,
      },
      {
        id: 'pendencias',
        title: 'PENDÊNCIAS',
        hint: PENDENCIAS_HINT,
        enabled: true,
      },
    ],
  },
  {
    id: 'ps',
    name: 'PS',
    description: 'Linguajar direto igual Cirúrgica, doença atual + evolução juntas e exame físico completo.',
    styleInstruction:
      'MODELO PS (PRONTO-SOCORRO / UPA): Mesma estrutura direta de Cirúrgica (linguajar bem direto, juntando Doença Atual + Evolução em HISTÓRIA DA DOENÇA ATUAL), PORÉM com EXAME FÍSICO COMPLETO — preencha de modo fisiológico sem alterações os conjuntos (Geral, Neuro, ACV, AR, ABD, EXT) que não forem citados no áudio.',
    voiceTriggers: [
      'ficha de emergência',
      'pronto socorro',
      'pronto-socorro',
      'evolução ps',
      'upa',
    ],
    clinicalKeywords: [
      'UPA',
      'pronto-socorro',
      'PS',
      'sala vermelha',
      'sala amarela',
      'observação',
      'sinais de alarme',
      'medicação EV',
      'reavaliação',
      'protocolo',
    ],
    isDefault: true,
    updatedAt: NOW,
    blocks: [
      {
        id: 'cabecalho',
        title: 'EVOLUÇÃO MÉDICA HOSPITALAR',
        hint: 'Identificação direta (Nome, idade, sexo, acompanhante se citado) + linha "DIH: [data da consulta/admissão]" se citada.',
        enabled: true,
      },
      {
        id: 'hipoteses',
        title: 'HIPÓTESES DIAGNÓSTICAS',
        hint: HIPOTESES_HINT,
        enabled: true,
      },
      {
        id: 'hda',
        title: 'HISTÓRIA DA DOENÇA ATUAL',
        hint: 'Bloco unificado e DIRETO contendo queixa principal, início, sintomas associados, sinais de alarme e evolução/reavaliação nas últimas horas.',
        enabled: true,
      },
      {
        id: 'exame_fisico',
        title: 'EXAME FÍSICO',
        hint: EXAME_FISICO_COMPLETO_HINT,
        enabled: true,
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES',
        hint: ANTECEDENTES_HINT,
        enabled: true,
      },
      {
        id: 'exames_complementares',
        title: 'EXAMES COMPLEMENTARES',
        hint: 'ECG, labs, gasometria, troponina ou imagem realizados no PS.',
        enabled: true,
      },
      {
        id: 'condutas',
        title: 'CONDUTAS/PROGRAMAÇÃO',
        hint: CONDUTAS_HINT,
        enabled: true,
      },
      {
        id: 'pendencias',
        title: 'PENDÊNCIAS',
        hint: PENDENCIAS_HINT,
        enabled: true,
      },
    ],
  },
  {
    id: 'uti',
    name: 'UTI',
    description: 'Igual Clínica (completo e cronológico), porém com linguajar mais direto e evolução 24h unificada.',
    styleInstruction:
      'MODELO UTI: Igual ao modelo Clínica (completo e com ordenação cronológica), porém com LINGUAJAR MAIS DIRETO e objetivo. A evolução das últimas 12h/24h (dispositivos, VM, DVA, RASS, BH, diurese, dieta, intercorrências) deve ser inserida dentro de HISTÓRIA DA DOENÇA ATUAL. EXAME FÍSICO COMPLETO (preencher de modo fisiológico sem alterações os conjuntos não citados).',
    voiceTriggers: [
      'evolução uti',
      'terapia intensiva',
      'modelo uti',
      'cti',
    ],
    clinicalKeywords: [
      'UTI',
      'ventilação mecânica',
      'TOT',
      'DVA',
      'noradrenalina',
      'RASS',
      'balanço hídrico',
      'cateter venoso central',
      'PAI',
      'sedação',
      'desmame',
    ],
    isDefault: true,
    updatedAt: NOW,
    blocks: [
      {
        id: 'cabecalho',
        title: 'EVOLUÇÃO MÉDICA HOSPITALAR',
        hint: 'Identificação completa (Nome, idade, sexo, acompanhante se citado) + linha "DIH: [data de internação / DIH-UTI]" se citada.',
        enabled: true,
      },
      {
        id: 'hipoteses',
        title: 'HIPÓTESES DIAGNÓSTICAS',
        hint: HIPOTESES_HINT,
        enabled: true,
      },
      {
        id: 'hda',
        title: 'HISTÓRIA DA DOENÇA ATUAL',
        hint: 'Resumo cronológico mais direto integrando história da admissão + evolução das últimas 12h/24h na UTI (dispositivos, VM, DVA, sedação/RASS, balanço hídrico, diurese, dieta, curva térmica).',
        enabled: true,
      },
      {
        id: 'exame_fisico',
        title: 'EXAME FÍSICO',
        hint: EXAME_FISICO_COMPLETO_HINT,
        enabled: true,
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES',
        hint: ANTECEDENTES_HINT,
        enabled: true,
      },
      {
        id: 'exames_complementares',
        title: 'EXAMES COMPLEMENTARES',
        hint: 'Descrição objetiva e cronológica de gasometria, lactato, laboratoriais, culturas e imagem.',
        enabled: true,
      },
      {
        id: 'condutas',
        title: 'CONDUTAS/PROGRAMAÇÃO',
        hint: CONDUTAS_HINT,
        enabled: true,
      },
      {
        id: 'pendencias',
        title: 'PENDÊNCIAS',
        hint: PENDENCIAS_HINT,
        enabled: true,
      },
    ],
  },
  {
    id: 'aps',
    name: 'APS',
    description: 'Modelo completo transformado para o método SOAP.',
    styleInstruction:
      'MODELO APS (MÉTODO SOAP): Transforme todos os elementos do modelo clínico completo no método SOAP: Cabeçalho (Identificação + data da consulta), S — SUBJETIVO (HDA/evolução + Antecedentes patológicos, medicações habituais, história familiar e hábitos de vida), O — OBJETIVO (Exame Físico COMPLETO com fisiológico nos sistemas não citados + Exames Complementares trazidos), A — AVALIAÇÃO (Hipóteses Diagnósticas numeradas com status/subitens) e P — PLANO (Condutas/Programação por problema + Pendências com hífen).',
    voiceTriggers: [
      'evolução aps',
      'atenção primária',
      'ambulatório',
      'posto de saúde',
      'soap',
    ],
    clinicalKeywords: [
      'UBS',
      'APS',
      'ambulatório',
      'renovação de receita',
      'puericultura',
      'pré-natal',
      'hipertensão',
      'diabetes',
      'retorno',
      'adesão',
    ],
    isDefault: true,
    updatedAt: NOW,
    blocks: [
      {
        id: 'cabecalho',
        title: 'EVOLUÇÃO MÉDICA — APS',
        hint: 'Identificação (Nome, idade, sexo, profissão, acompanhante se citado) + data da consulta se citada.',
        enabled: true,
      },
      {
        id: 'subjetivo',
        title: 'S — SUBJETIVO',
        hint: 'HDA / motivo da consulta e evolução recente + Antecedentes (comorbidades prévias, medicações de uso habitual com posologias, história familiar e hábitos de vida).',
        enabled: true,
      },
      {
        id: 'objetivo',
        title: 'O — OBJETIVO',
        hint: `${EXAME_FISICO_COMPLETO_HINT} Inclua também SSVV/antropometria e resultados de Exames Complementares trazidos se citados.`,
        enabled: true,
      },
      {
        id: 'avaliacao',
        title: 'A — AVALIAÇÃO',
        hint: HIPOTESES_HINT,
        enabled: true,
      },
      {
        id: 'plano',
        title: 'P — PLANO',
        hint: `${CONDUTAS_HINT} Inclua orientações, retorno e, ao final, as PENDÊNCIAS em lista com hífen (- ...).`,
        enabled: true,
      },
    ],
  },
];

export function cloneDefaultTemplates(): ClinicalTemplate[] {
  return DEFAULT_TEMPLATES.map((tpl) => ({
    ...tpl,
    voiceTriggers: [...tpl.voiceTriggers],
    clinicalKeywords: [...tpl.clinicalKeywords],
    blocks: tpl.blocks.map((b) => ({ ...b })),
  }));
}
