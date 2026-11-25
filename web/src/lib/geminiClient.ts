import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  ClinicalTemplate,
  CopilotData,
  SelectionMode,
} from '../types/clinical';
import { filterNonEmptyBlocks } from './renderer';

export interface GeminiClinicalResponse {
  selectedTemplateId: string;
  selectionMode: SelectionMode;
  patientLabel: string;
  blocksContent: Record<string, string>;
  copilot: CopilotData;
}

const CLINICAL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    selectedTemplateId: {
      type: Type.STRING,
      description: 'ID exato do template selecionado entre os templates disponíveis.',
    },
    selectionMode: {
      type: Type.STRING,
      enum: ['manual', 'voice', 'auto'],
      description: 'manual se travado pelo usuário; voice se dito no áudio; auto se inferido pelo contexto clínico.',
    },
    patientLabel: {
      type: Type.STRING,
      description: 'Identificação curta do paciente/leito (ex: "João Elias - Leito 4") ou vazio se não citado.',
    },
    blocks: {
      type: Type.ARRAY,
      description: 'Lista contendo APENAS os blocos do template selecionado que possuem dados clínicos reais falados no áudio. OMITA blocos vazios.',
      items: {
        type: Type.OBJECT,
        properties: {
          blockId: {
            type: Type.STRING,
            description: 'ID exato do bloco dentro do template selecionado.',
          },
          content: {
            type: Type.STRING,
            description: 'Texto clínico técnico e objetivo em português do Brasil, sem markdown, sem saudações e sem colchetes de placeholder.',
          },
        },
        required: ['blockId', 'content'],
      },
    },
  },
  required: ['selectedTemplateId', 'selectionMode', 'patientLabel', 'blocks'],
};

function compactBlockHint(blockId: string, hint: string): string {
  // Evita repetir 4-5x os mesmos hints longos de 300-500 chars no catálogo JSON
  if (blockId === 'exame_fisico' || blockId === 'objetivo') {
    return hint.includes('RESTRITO')
      ? 'EF RESTRITO: somente o descrito no áudio (FO/drenos se citados).'
      : 'EF COMPLETO (6 linhas: Geral, Neuro, ACV, AR, ABD, EXT; fisiológico nos não citados).';
  }
  if (blockId === 'hipoteses' || blockId === 'avaliacao') {
    return 'Lista numerada (1., 2., 3.) com subitens a), b), c) por problema/comorbidade.';
  }
  if (blockId === 'condutas') {
    return 'Manejo por problema (fármaco/dose/via/dia ATB só se falado; alertas/suspensões em CAIXA ALTA).';
  }
  if (blockId === 'pendencias') {
    return 'Lista com hífen (- ...) de exames, pareceres e reavaliações pendentes.';
  }
  if (blockId === 'antecedentes') {
    return 'Comorbidades, medicações habituais, pareceres prévios, HF e hábitos (só o citado).';
  }
  return hint.length > 140 ? `${hint.slice(0, 137)}...` : hint;
}

function getStyleRule(lockedTemplateId: string | null): string {
  switch (lockedTemplateId) {
    case 'cirurgica':
      return 'ESTILO CIRÚRGICA: direto (HDA+evolução juntas) + EF SOMENTE descrito no áudio (sem preencher sistemas não citados).';
    case 'ps':
      return 'ESTILO PS: direto (HDA+evolução juntas) + EF COMPLETO fisiológico padrão nos sistemas não citados.';
    case 'clinica':
      return 'ESTILO CLÍNICA: cronológico completo (HDA e Evolução 12h/24h separados) + EF COMPLETO fisiológico padrão nos não citados.';
    case 'uti':
      return 'ESTILO UTI: direto/cronológico (evolução 24h em HDA) + EF COMPLETO fisiológico padrão nos não citados.';
    case 'aps':
      return 'ESTILO APS: método SOAP completo + EF COMPLETO fisiológico padrão nos não citados.';
    default:
      return 'ESTILO: CIRÚRGICA direto (HDA+evolução juntas)+EF SOMENTE descrito; PS direto+EF COMPLETO; CLÍNICA cronológico completo+EF COMPLETO; UTI direto/cronológico+EF COMPLETO; APS SOAP+EF COMPLETO.';
  }
}

export function buildClinicalSystemInstruction(
  templates: ClinicalTemplate[],
  lockedTemplateId: string | null,
): string {
  // Opção B: quando há trava manual, envia apenas o template travado e a regra de estilo dele
  const relevantTemplates = lockedTemplateId
    ? templates.filter((t) => t.id === lockedTemplateId)
    : templates;
  const activeList = relevantTemplates.length > 0 ? relevantTemplates : templates;

  const templatesCatalog = activeList.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    ...(tpl.voiceTriggers.length > 0 && !lockedTemplateId ? { voice: tpl.voiceTriggers } : {}),
    ...(tpl.clinicalKeywords.length > 0 && !lockedTemplateId ? { kw: tpl.clinicalKeywords } : {}),
    blocks: tpl.blocks
      .filter((b) => b.enabled)
      .map((b) => ({ id: b.id, title: b.title, hint: compactBlockHint(b.id, b.hint) })),
  }));

  const lockInstruction = lockedTemplateId
    ? `TRAVA MANUAL: use OBRIGATORIAMENTE "${lockedTemplateId}" (selectionMode="manual").`
    : `SELEÇÃO: 1) Comando de voz explícito ("cirúrgica", "UTI", "PS/emergência", "APS", "clínica") -> selectionMode="voice" e remova o comando do texto. 2) Inferência clínica (PO/FO/dreno->cirurgica; VM/DVA/RASS->uti; UPA/PS->ps; UBS/SOAP->aps; enfermaria/DIH->clinica) -> selectionMode="auto".`;

  const lines = [
    'Motor clínico PinVoice (PT-BR técnico, sem Markdown, sem saudações, sem placeholders/colchetes).',
    '1. DIARIZAÇÃO: separe Médico vs Paciente/Acompanhante (queixas->HDA/Subjetivo; achados->Exame Físico/Objetivo; planos->Condutas/Plano).',
    `2. ${lockInstruction} ${getStyleRule(lockedTemplateId)}`,
  ];

  if (lockedTemplateId !== 'cirurgica') {
    lines.push(
      '3. EF COMPLETO fisiológico padrão (para sistemas não citados): Geral: BEG, corado, hidratado, acianótico, anictérico, afebril | Neuro: Glasgow 15, pupilas isofotorreagentes, sem déficits focais | ACV: RCR 2T, BNF, sem sopros | AR: MV+ bilateral sem RA | ABD: Plano, flácido, RHA+, indolor | EXT: Aquecidas, bem perfundidas, TEC < 3s, sem edema, panturrilhas livres.',
    );
  }

  lines.push(
    '4. TEXTO ÚNICO INTEGRADO (sem Copilot separado): medicações, doses, dias de ATB (ex: D4 Ceftriaxona), alertas/suspensões (CAIXA ALTA), exames e pareceres vão direto em CONDUTAS/PROGRAMAÇÃO e PENDÊNCIAS (ou P — PLANO na APS).',
    '5. OMISSÃO ESTRITA DE BLOCOS VAZIOS (CRÍTICO): retorne em blocks APENAS blocos com dados reais falados no áudio. Se antecedentes, exames complementares, condutas ou pendências NÃO foram ditos no áudio, NÃO inclua esses blocos no array. É PROIBIDO escrever frases como "Sem antecedentes relatados no áudio", "Sem exames complementares citados", "Não informado" ou "N/A".',
    '6. ESCRITA E SEGURANÇA: nunca repita o título do bloco dentro de content; zero repetição de fatos; SEGURANÇA PRESCRITIVA: NUNCA invente dose, via ou intervalo não falado; quebras \\n obrigatórias por sistema no EF, por item (1., 2., a), b)) em Hipóteses/Avaliação e por linha em Condutas/Pendências; siglas padrão (%, mmHg, bpm, BNF, RCR 2T, MV+, RHA+, TEC < 3s).',
    `TEMPLATES:${JSON.stringify(templatesCatalog)}`,
  );

  return lines.join('\n');
}

interface RawGeminiPayload {
  selectedTemplateId?: string;
  selectionMode?: SelectionMode;
  patientLabel?: string;
  blocks?: Array<{ blockId?: string; content?: string }>;
  copilot?: Partial<CopilotData>;
}

export function parseGeminiClinicalPayload(
  rawText: string,
  templates: ClinicalTemplate[],
  lockedTemplateId: string | null,
): GeminiClinicalResponse {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as RawGeminiPayload;

  const fallbackTemplate =
    (lockedTemplateId && templates.find((t) => t.id === lockedTemplateId)) ||
    templates[0];

  const matchedTemplate =
    (lockedTemplateId && templates.find((t) => t.id === lockedTemplateId)) ||
    templates.find((t) => t.id === parsed.selectedTemplateId) ||
    fallbackTemplate;

  const selectionMode: SelectionMode = lockedTemplateId
    ? 'manual'
    : parsed.selectionMode === 'voice' || parsed.selectionMode === 'manual'
      ? parsed.selectionMode
      : 'auto';

  const rawBlocksMap: Record<string, string> = {};
  if (Array.isArray(parsed.blocks)) {
    for (const item of parsed.blocks) {
      if (item?.blockId && typeof item.content === 'string') {
        rawBlocksMap[item.blockId] = item.content;
      }
    }
  }

  const blocksContent = filterNonEmptyBlocks(rawBlocksMap);

  const sanitizeList = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
      : [];

  return {
    selectedTemplateId: matchedTemplate.id,
    selectionMode,
    patientLabel: (parsed.patientLabel || '').trim(),
    blocksContent,
    copilot: {
      pendencies: sanitizeList(parsed.copilot?.pendencies),
      alerts: sanitizeList(parsed.copilot?.alerts),
      medications: sanitizeList(parsed.copilot?.medications),
      exams: sanitizeList(parsed.copilot?.exams),
    },
  };
}

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

function isRetryableModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('NOT_FOUND')
  );
}

export function isThinkingUnsupportedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('thinking') &&
    (msg.includes('400') ||
      msg.includes('invalid') ||
      msg.includes('not support') ||
      msg.includes('unsupported') ||
      msg.includes('budget'))
  );
}

export function shouldSendThinkingZero(model: string): boolean {
  return !model.toLowerCase().includes('flash-lite');
}

function buildModelAttemptOrder(preferred: string): string[] {
  const clean = (preferred || 'gemini-3.5-flash-lite').trim();
  return [clean, ...FALLBACK_MODELS.filter((m) => m !== clean)];
}

function unescapePartialJsonString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    if (i + 1 >= raw.length) break;
    const next = raw[++i];
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '"' || next === '\\' || next === '/') out += next;
    else out += next;
  }
  return out;
}

/**
 * Extrai em tempo real os blocos já iniciados dentro de um JSON parcial vindo do streaming,
 * permitindo exibir o texto clínico ~0.8s–1.2s após parar a gravação.
 */
export function extractStreamingBlocksPreview(
  partialJson: string,
  templates: ClinicalTemplate[],
  lockedTemplateId: string | null,
): string {
  const tplIdMatch = /"selectedTemplateId"\s*:\s*"([^"]+)"/.exec(partialJson);
  const resolvedId = lockedTemplateId || tplIdMatch?.[1];
  const tpl =
    templates.find((t) => t.id === resolvedId) ?? templates[0];

  const blocksIdx = partialJson.indexOf('"blocks"');
  if (blocksIdx === -1) return '';

  const slice = partialJson.slice(blocksIdx);
  const blockRegex = /"blockId"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"/g;
  const sections: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(slice)) !== null) {
    const blockId = match[1];
    let i = match.index + match[0].length;
    let escaped = false;
    while (i < slice.length) {
      const c = slice[i];
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        break;
      }
      i++;
    }

    const rawContent = slice.slice(match.index + match[0].length, i);
    const content = unescapePartialJsonString(rawContent).trim();
    if (!content) continue;

    const title =
      tpl?.blocks.find((b) => b.id === blockId)?.title ?? blockId.toUpperCase();
    sections.push(`${title}\n${content}`);
  }

  return sections.join('\n\n');
}

async function generateClinicalJsonWithFallback(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  temperature: number;
  contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'];
  onRawChunk?: (accumulatedJson: string) => void;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey.trim() });
  const candidates = buildModelAttemptOrder(params.model);

  let lastError: unknown = null;
  for (const candidateModel of candidates) {
    const thinkingModes = shouldSendThinkingZero(candidateModel) ? [true, false] : [false];
    for (const useThinkingZero of thinkingModes) {
      try {
        const requestConfig = {
          systemInstruction: params.systemInstruction,
          temperature: params.temperature,
          responseMimeType: 'application/json',
          responseSchema: CLINICAL_RESPONSE_SCHEMA,
          ...(useThinkingZero ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        };

        if (params.onRawChunk && typeof ai.models.generateContentStream === 'function') {
          const stream = await ai.models.generateContentStream({
            model: candidateModel,
            contents: params.contents,
            config: requestConfig,
          });
          let accumulated = '';
          for await (const chunk of stream) {
            if (chunk.text) {
              accumulated += chunk.text;
              params.onRawChunk(accumulated);
            }
          }
          if (!accumulated.trim()) {
            throw new Error('A API do Gemini retornou uma resposta vazia.');
          }
          return accumulated;
        }

        const response = await ai.models.generateContent({
          model: candidateModel,
          contents: params.contents,
          config: requestConfig,
        });

        if (!response.text) {
          throw new Error('A API do Gemini retornou uma resposta vazia.');
        }
        return response.text;
      } catch (err) {
        lastError = err;
        if (useThinkingZero && isThinkingUnsupportedError(err)) {
          continue;
        }
        if (!isRetryableModelError(err)) {
          throw err;
        }
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Todos os modelos Gemini estão temporariamente indisponíveis.');
}

export async function processClinicalAudioWithGemini(params: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
  templates: ClinicalTemplate[];
  lockedTemplateId: string | null;
  onPartialText?: (previewText: string) => void;
}): Promise<GeminiClinicalResponse> {
  const { apiKey, model, audioBase64, mimeType, templates, lockedTemplateId, onPartialText } = params;
  if (!apiKey.trim()) {
    throw new Error('Configure sua Gemini API Key nas Configurações antes de gravar.');
  }

  const systemInstruction = buildClinicalSystemInstruction(templates, lockedTemplateId);
  const rawText = await generateClinicalJsonWithFallback({
    apiKey,
    model,
    systemInstruction,
    temperature: 0.15,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: 'Ouça o áudio clínico, aplique diarização, escolha o template e retorne apenas JSON.' },
        ],
      },
    ],
    onRawChunk: onPartialText
      ? (acc) => {
          const preview = extractStreamingBlocksPreview(acc, templates, lockedTemplateId);
          if (preview) onPartialText(preview);
        }
      : undefined,
  });

  return parseGeminiClinicalPayload(rawText, templates, lockedTemplateId);
}

/**
 * Re-formatação instantânea (<1s) ao clicar em [Trocar] template,
 * usando apenas o texto já extraído (sem precisar do áudio original).
 */
export async function reformatEvolutionToTemplate(params: {
  apiKey: string;
  model: string;
  currentText: string;
  targetTemplate: ClinicalTemplate;
}): Promise<GeminiClinicalResponse> {
  const { apiKey, model, currentText, targetTemplate } = params;
  if (!apiKey.trim()) {
    throw new Error('Configure sua Gemini API Key nas Configurações para reformatar.');
  }

  const systemInstruction = buildClinicalSystemInstruction([targetTemplate], targetTemplate.id);
  const rawText = await generateClinicalJsonWithFallback({
    apiKey,
    model,
    systemInstruction,
    temperature: 0.1,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Reestruture o texto clínico abaixo para os blocos do template "${targetTemplate.name}", preservando 100% dos fatos clínicos sem inventar nada e OMITINDO blocos sem informação:\n\n${currentText}`,
          },
        ],
      },
    ],
  });

  return parseGeminiClinicalPayload(rawText, [targetTemplate], targetTemplate.id);
}

/**
 * Complemento por voz: integra um áudio extra rápido (exames, condutas, novos achados)
 * diretamente numa evolução já pronta sem perder o conteúdo existente.
 */
export async function complementEvolutionWithAudio(params: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
  existingText: string;
  template: ClinicalTemplate;
}): Promise<GeminiClinicalResponse> {
  const { apiKey, model, audioBase64, mimeType, existingText, template } = params;
  if (!apiKey.trim()) {
    throw new Error('Configure sua Gemini API Key nas Configurações para complementar por voz.');
  }

  const systemInstruction = buildClinicalSystemInstruction([template], template.id);
  const rawText = await generateClinicalJsonWithFallback({
    apiKey,
    model,
    systemInstruction,
    temperature: 0.12,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `EVOLUÇÃO ATUAL (preserve 100% dos fatos existentes que não forem corrigidos pelo novo áudio):\n${existingText}\n\nTAREFA: Ouça o áudio complementar e integre os novos achados, exames, condutas ou correções nos blocos corretos do template "${template.name}", mantendo texto único coeso, sem duplicar informações e sem inventar doses/posologias. Retorne o JSON completo atualizado.`,
          },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      },
    ],
  });

  return parseGeminiClinicalPayload(rawText, [template], template.id);
}
