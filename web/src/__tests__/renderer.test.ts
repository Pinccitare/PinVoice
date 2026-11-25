import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates';
import {
  filterNonEmptyBlocks,
  isBlockContentEmpty,
  renderEvolutionBlocks,
  sanitizeForHospub,
} from '../lib/renderer';

describe('renderer — omissão de blocos vazios e ordem customizada', () => {
  it('identifica corretamente strings vazias e placeholders como vazios', () => {
    expect(isBlockContentEmpty('')).toBe(true);
    expect(isBlockContentEmpty('   \n  ')).toBe(true);
    expect(isBlockContentEmpty('Não informado.')).toBe(true);
    expect(isBlockContentEmpty('Sem dados')).toBe(true);
    expect(isBlockContentEmpty('N/A')).toBe(true);
    expect(isBlockContentEmpty('Paciente afebril, eupneico.')).toBe(false);
  });

  it('omite blocos não preenchidos e respeita a ordem reordenada dos blocos', () => {
    const base = structuredClone(DEFAULT_TEMPLATES[0]); // Clínica
    // Reordena colocando CONDUTAS/PROGRAMAÇÃO antes de EVOLUÇÃO MÉDICA HOSPITALAR
    const conduta = base.blocks.find((b) => b.id === 'condutas')!;
    const cabecalho = base.blocks.find((b) => b.id === 'cabecalho')!;
    const exameFisico = base.blocks.find((b) => b.id === 'exame_fisico')!;
    const exames = base.blocks.find((b) => b.id === 'exames_complementares')!;
    base.blocks = [conduta, cabecalho, exameFisico, exames];

    const rendered = renderEvolutionBlocks(base, {
      cabecalho: 'João Elias, 54 anos, sexo masculino.\nDIH: 20/11/2026',
      exame_fisico: 'Geral: BEG, corado, hidratado.\nAR: MV+ sem RA.',
      exames_complementares: 'Não informado',
      condutas: 'Manejo Infeccioso: Manter Ceftriaxona D4.',
    });

    expect(rendered).not.toContain('EXAMES COMPLEMENTARES');
    expect(rendered).not.toContain('Não informado');
    expect(rendered.indexOf('CONDUTAS/PROGRAMAÇÃO')).toBeLessThan(
      rendered.indexOf('EVOLUÇÃO MÉDICA HOSPITALAR'),
    );
    expect(rendered.indexOf('EVOLUÇÃO MÉDICA HOSPITALAR')).toBeLessThan(
      rendered.indexOf('EXAME FÍSICO'),
    );
  });

  it('filtra blocos vazios do mapa de conteúdo', () => {
    const filtered = filterNonEmptyBlocks({
      identificacao: 'Maria, 32a',
      subjetivo: '   ',
      exames_complementares: 'Sem relato.',
    });
    expect(filtered).toEqual({ identificacao: 'Maria, 32a' });
  });
  it('remove título duplicado no início do bloco e normaliza quebras de linha no exame físico e hipóteses', () => {
    const aps = DEFAULT_TEMPLATES.find((t) => t.id === 'aps')!;
    const rendered = renderEvolutionBlocks(aps, {
      cabecalho: 'EVOLUÇÃO MÉDICA — APS: Silvana, 38 anos.',
      subjetivo: 'S — SUBJETIVO: Relata manchas vermelhas há 2 dias.',
      objetivo:
        'O — OBJETIVO: Exame Físico Geral: BEG, corada. Neuro: Glasgow 15. ACV: RCR 2T. AR: MV+ sem RA.',
      avaliacao:
        'A — AVALIAÇÃO: 1. Exantema agudo — a) início há 2 dias b) sem febre c) hipótese viral?',
    });

    expect(rendered).not.toContain('S — SUBJETIVO:');
    expect(rendered).not.toContain('O — OBJETIVO:');
    expect(rendered).not.toContain('EVOLUÇÃO MÉDICA — APS:');
    expect(rendered).toContain('Geral: BEG, corada.\nNeuro: Glasgow 15.\nACV: RCR 2T.\nAR: MV+ sem RA.');
    expect(rendered).toContain('1. Exantema agudo\na) início há 2 dias\nb) sem febre\nc) hipótese viral?');
  });
});

describe('sanitizeForHospub', () => {
  it('remove markdown, emojis e normaliza bullets/travessões', () => {
    const dirty = '## **EXAME FÍSICO** 🩺\n• PA 120x80 — FC 76 bpm\r\n`D4 Ceftriaxona`';
    const clean = sanitizeForHospub(dirty, { asciiOnly: false });
    expect(clean).toBe('EXAME FÍSICO\n- PA 120x80 - FC 76 bpm\nD4 Ceftriaxona');
  });

  it('remove diacríticos e caracteres não-ASCII quando asciiOnly = true', () => {
    const text = 'IDENTIFICAÇÃO:\nEvolução clínica — atenção à função hepática.';
    const ascii = sanitizeForHospub(text, { asciiOnly: true });
    expect(ascii).toBe('IDENTIFICACAO:\nEvolucao clinica - atencao a funcao hepatica.');
  });
});
