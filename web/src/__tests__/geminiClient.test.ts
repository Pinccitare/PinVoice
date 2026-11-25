import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates';

const generateContentMock = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: generateContentMock,
      },
    })),
  };
});

import {
  buildClinicalSystemInstruction,
  extractStreamingBlocksPreview,
  isThinkingUnsupportedError,
  parseGeminiClinicalPayload,
  processClinicalAudioWithGemini,
  shouldSendThinkingZero,
} from '../lib/geminiClient';

describe('geminiClient — prompt dinâmico e parser JSON', () => {
  it('inclui os 5 templates padrão (Clínica, Cirúrgica, APS, PS, UTI) na instrução compacta', () => {
    const prompt = buildClinicalSystemInstruction(DEFAULT_TEMPLATES, null);
    expect(prompt).toContain('"id":"clinica"');
    expect(prompt).toContain('"id":"cirurgica"');
    expect(prompt).toContain('"id":"aps"');
    expect(prompt).toContain('"id":"ps"');
    expect(prompt).toContain('"id":"uti"');
    expect(prompt).toContain('OMISSÃO ESTRITA DE BLOCOS VAZIOS');
    expect(prompt).toContain('SEGURANÇA PRESCRITIVA');
    expect(prompt.length).toBeLessThan(10000);
  });

  it('ativa TRAVA MANUAL na instrução e reduz catálogo para apenas o template travado', () => {
    const prompt = buildClinicalSystemInstruction(DEFAULT_TEMPLATES, 'uti');
    expect(prompt).toContain('TRAVA MANUAL');
    expect(prompt).toContain('"id":"uti"');
    expect(prompt).not.toContain('"id":"cirurgica"');
    expect(prompt.length).toBeLessThan(3500);
  });

  it('respeita Prioridade 1 (Trava Manual) ao parsear payload', () => {
    const raw = JSON.stringify({
      selectedTemplateId: 'clinica',
      selectionMode: 'auto',
      patientLabel: 'João - Leito 4',
      blocks: [
        { blockId: 'identificacao', content: 'João, 2º PO de desbridamento.' },
        { blockId: 'exames_complementares', content: 'Não informado' },
      ],
      copilot: {
        pendencies: ['Lançar parecer infecto'],
        alerts: ['D4 Ceftriaxona'],
        medications: ['Ceftriaxona 1g EV 12/12h'],
        exams: ['Hemograma'],
      },
    });

    const parsed = parseGeminiClinicalPayload(raw, DEFAULT_TEMPLATES, 'cirurgica');
    expect(parsed.selectedTemplateId).toBe('cirurgica');
    expect(parsed.selectionMode).toBe('manual');
    expect(parsed.blocksContent).toEqual({
      identificacao: 'João, 2º PO de desbridamento.',
    });
    expect(parsed.copilot.alerts).toEqual(['D4 Ceftriaxona']);
  });

  it('remove cercas de markdown JSON e detecta erros de thinkingBudget não suportado', () => {
    const fenced = '```json\n{"selectedTemplateId":"ps","selectionMode":"voice","patientLabel":"Maria","blocks":[{"blockId":"identificacao","content":"Maria, 40a."}]}\n```';
    const parsed = parseGeminiClinicalPayload(fenced, DEFAULT_TEMPLATES, null);
    expect(parsed.selectedTemplateId).toBe('ps');
    expect(parsed.selectionMode).toBe('voice');
    expect(parsed.blocksContent.identificacao).toBe('Maria, 40a.');

    expect(isThinkingUnsupportedError(new Error('HTTP 400: Unsupported field thinkingConfig'))).toBe(true);
    expect(isThinkingUnsupportedError(new Error('Invalid value at thinking_config.thinking_budget'))).toBe(true);
    expect(isThinkingUnsupportedError(new Error('HTTP 401: API key not valid'))).toBe(false);
  });

  it('omite thinkingConfig em modelos flash-lite e mantém em modelos flash padrão', () => {
    expect(shouldSendThinkingZero('gemini-3.5-flash-lite')).toBe(false);
    expect(shouldSendThinkingZero('gemini-flash-lite-latest')).toBe(false);
    expect(shouldSendThinkingZero('GEMINI-2.5-FLASH-LITE')).toBe(false);
    expect(shouldSendThinkingZero('gemini-3.6-flash')).toBe(true);
    expect(shouldSendThinkingZero('gemini-3.5-flash')).toBe(true);
  });
});

describe('geminiClient — comportamento de chamadas e fallback de thinkingConfig', () => {
  const okPayload = JSON.stringify({
    selectedTemplateId: 'clinica',
    selectionMode: 'auto',
    patientLabel: 'Paciente Teste',
    blocks: [{ blockId: 'identificacao', content: 'Paciente em bom estado geral.' }],
  });

  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('NÃO envia thinkingConfig em gemini-3.5-flash-lite e gemini-flash-lite-latest (1 tentativa)', async () => {
    for (const model of ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest']) {
      generateContentMock.mockReset();
      generateContentMock.mockResolvedValueOnce({ text: okPayload });

      const res = await processClinicalAudioWithGemini({
        apiKey: 'test-key',
        model,
        audioBase64: 'AAAA',
        mimeType: 'audio/webm',
        templates: DEFAULT_TEMPLATES,
        lockedTemplateId: null,
      });

      expect(res.selectedTemplateId).toBe('clinica');
      expect(generateContentMock).toHaveBeenCalledTimes(1);
      const callArg = generateContentMock.mock.calls[0][0] as {
        model: string;
        config: Record<string, unknown>;
      };
      expect(callArg.model).toBe(model);
      expect(callArg.config).not.toHaveProperty('thinkingConfig');
    }
  });

  it('envia thinkingBudget=0 em gemini-3.6-flash e faz retry defensivo sem thinkingConfig se retornar 400', async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error('HTTP 400 INVALID_ARGUMENT: thinking_budget not supported'))
      .mockResolvedValueOnce({ text: okPayload });

    const res = await processClinicalAudioWithGemini({
      apiKey: 'test-key',
      model: 'gemini-3.6-flash',
      audioBase64: 'AAAA',
      mimeType: 'audio/webm',
      templates: DEFAULT_TEMPLATES,
      lockedTemplateId: null,
    });

    expect(res.selectedTemplateId).toBe('clinica');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[0][0].config).toMatchObject({
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(generateContentMock.mock.calls[1][0].config).not.toHaveProperty('thinkingConfig');
  });

  it('faz fallback 503 de flash-lite (sem thinkingConfig) para 3.6-flash (com thinkingBudget=0)', async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockResolvedValueOnce({ text: okPayload });

    await processClinicalAudioWithGemini({
      apiKey: 'test-key',
      model: 'gemini-3.5-flash-lite',
      audioBase64: 'AAAA',
      mimeType: 'audio/webm',
      templates: DEFAULT_TEMPLATES,
      lockedTemplateId: null,
    });

    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(generateContentMock.mock.calls[0][0].model).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock.mock.calls[0][0].config).not.toHaveProperty('thinkingConfig');
    expect(generateContentMock.mock.calls[1][0].model).toBe('gemini-flash-lite-latest');
    expect(generateContentMock.mock.calls[1][0].config).not.toHaveProperty('thinkingConfig');
    expect(generateContentMock.mock.calls[2][0].model).toBe('gemini-3.6-flash');
    expect(generateContentMock.mock.calls[2][0].config).toMatchObject({
      thinkingConfig: { thinkingBudget: 0 },
    });
  });

  it('não faz retry em erro 400 não relacionado a thinking em flash-lite', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('HTTP 400 INVALID_ARGUMENT: bad audio'));

    await expect(
      processClinicalAudioWithGemini({
        apiKey: 'test-key',
        model: 'gemini-3.5-flash-lite',
        audioBase64: 'AAAA',
        mimeType: 'audio/webm',
        templates: DEFAULT_TEMPLATES,
        lockedTemplateId: null,
      }),
    ).rejects.toThrow('bad audio');
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('envia apenas o template travado e a regra de estilo dele quando há trava manual (Opção B)', () => {
    const prompt = buildClinicalSystemInstruction(DEFAULT_TEMPLATES, 'cirurgica');
    expect(prompt).toContain('"id":"cirurgica"');
    expect(prompt).not.toContain('"id":"clinica"');
    expect(prompt).not.toContain('"id":"aps"');
    expect(prompt).not.toContain('EF COMPLETO fisiológico padrão');
  });

  it('extrai preview incremental em tempo real durante streaming JSON (Opção A)', () => {
    const partial =
      '{"selectedTemplateId":"ps","selectionMode":"auto","patientLabel":"Ana","blocks":[{"blockId":"cabecalho","content":"Ana, 30a."},{"blockId":"hda","content":"Dor abdominal há 2h\\nSem febre';
    const preview = extractStreamingBlocksPreview(partial, DEFAULT_TEMPLATES, null);
    expect(preview).toContain('EVOLUÇÃO MÉDICA HOSPITALAR\nAna, 30a.');
    expect(preview).toContain('HISTÓRIA DA DOENÇA ATUAL\nDor abdominal há 2h\nSem febre');
  });
});
