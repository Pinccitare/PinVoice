import type { ClinicalTemplate } from '../types/clinical';

const EMPTY_PLACEHOLDER_PATTERNS = [
  /^n[aã]o\s+(informado|mencionado|relatado|referido|descrito|avaliado|aplic[aá]vel)\.?$/i,
  /^sem\s+(dados|informa[cç][oõ]es|relato)\.?$/i,
  /^n\/?a\.?$/i,
  /^-+$/,
];

/**
 * Retorna true se o conteúdo de um bloco deve ser considerado vazio
 * e portanto OMITIDO do texto final da evolução.
 */
export function isBlockContentEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return EMPTY_PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed));
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove repetição acidental do título do bloco no início do corpo
 * (ex.: "S — SUBJETIVO: Paciente..." dentro do bloco "S — SUBJETIVO").
 */
export function stripLeadingBlockTitle(title: string, body: string): string {
  let out = body.trim();
  const cleanTitle = title.trim();
  if (!cleanTitle || !out) return out;

  // Permite variações de travessão (—, –, -) e pontuação final (: ou quebra de linha)
  const flexibleTitle = escapeRegExp(cleanTitle).replace(/\\s+|—|–|-/g, '[\\s—–-]+');
  const titlePrefixRe = new RegExp(`^${flexibleTitle}\\s*[:\\-—–]?\\s*`, 'i');
  out = out.replace(titlePrefixRe, '').trim();

  // Remove também prefixo redundante "Exame Físico:" quando já estamos no bloco de Exame Físico/Objetivo
  if (/^(exame\s+f[ií]sico|o\s*[—–-]\s*objetivo)$/i.test(cleanTitle)) {
    out = out.replace(/^exame\s+f[ií]sico\s*[:\-—–]?\s*/i, '').trim();
  }

  return out;
}

/**
 * Garante quebras de linha limpas em blocos estruturados (Exame Físico, Hipóteses, Pendências)
 * caso o modelo retorne itens agrupados na mesma linha.
 */
export function normalizeBlockFormatting(blockId: string, body: string): string {
  let out = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  if (blockId === 'exame_fisico' || blockId === 'objetivo') {
    out = out.replace(
      /([^\n])\s+(Geral|Neuro|SSVV|ACV|AR|ABD|EXT|Pele|Ferida Operat[oó]ria|FO|Drenos)\s*:/gi,
      '$1\n$2:',
    );
  }

  if (blockId === 'hipoteses' || blockId === 'avaliacao') {
    // Quebra antes de subitens a), b), c), d) caso estejam inline
    out = out.replace(/\s*[—–-]?\s+([a-f]\))\s+/g, '\n$1 ');
    // Quebra antes de problemas numerados 2., 3., 4. caso estejam inline
    out = out.replace(/([^\n])\s+([2-9]\.)\s+/g, '$1\n$2 ');
  }

  if (blockId === 'pendencias') {
    out = out.replace(/([^\n])\s+-\s+/g, '$1\n- ');
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Remove blocos vazios do mapa de conteúdo, mantendo apenas os blocos com dados clínicos reais.
 */
export function filterNonEmptyBlocks(
  blocksContent: Record<string, string>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [blockId, content] of Object.entries(blocksContent)) {
    if (!isBlockContentEmpty(content)) {
      clean[blockId] = content.trim();
    }
  }
  return clean;
}

/**
 * Renderiza a evolução respeitando rigorosamente a ordem dos blocos do template,
 * OMITINDO automaticamente qualquer bloco desabilitado ou sem conteúdo preenchido,
 * removendo títulos duplicados e garantindo quebras de linha limpas.
 */
export function renderEvolutionBlocks(
  template: ClinicalTemplate,
  blocksContent: Record<string, string>,
): string {
  const sections: string[] = [];

  for (const block of template.blocks) {
    if (!block.enabled) continue;
    const raw = blocksContent[block.id];
    if (isBlockContentEmpty(raw)) continue;

    const title = block.title.trim();
    const withoutTitle = stripLeadingBlockTitle(title, raw);
    if (isBlockContentEmpty(withoutTitle)) continue;

    const formattedBody = normalizeBlockFormatting(block.id, withoutTitle);
    sections.push(`${title}\n${formattedBody}`);
  }

  return sections.join('\n\n');
}

export interface HospubSanitizeOptions {
  /** Remove acentos e caracteres fora da faixa ASCII imprimível para terminais legados */
  asciiOnly?: boolean;
}

/**
 * Sanitiza texto clínico para colar em 1 clique no hb-hospub sem quebrar encoding
 * nem carregar formatação Markdown ou emojis.
 */
export function sanitizeForHospub(
  text: string,
  options: HospubSanitizeOptions = {},
): string {
  let out = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[•▪▫●◦]\s*/gm, '- ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '');

  if (options.asciiOnly) {
    out = out
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E\n\t]/g, '');
  }

  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
