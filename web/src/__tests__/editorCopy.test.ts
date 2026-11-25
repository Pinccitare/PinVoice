import { describe, expect, it } from 'vitest';
import { resolveLatestTextForCopy } from '../components/EvolutionEditor';

describe('resolveLatestTextForCopy — cópia Ctrl+Shift+C durante debounce', () => {
  it('retorna o snapshot local mais recente quando evolutionId corresponde (dentro dos 350ms)', () => {
    const result = resolveLatestTextForCopy(
      { id: 'ev-1', renderedText: 'Texto antigo salvo no IndexedDB' },
      { evolutionId: 'ev-1', text: 'Texto editado há 50ms' },
    );
    expect(result).toBe('Texto editado há 50ms');
  });

  it('preserva snapshot vazio quando o usuário apagou todo o texto da evolução ativa', () => {
    const result = resolveLatestTextForCopy(
      { id: 'ev-1', renderedText: 'Texto antigo' },
      { evolutionId: 'ev-1', text: '' },
    );
    expect(result).toBe('');
  });

  it('ignora snapshot obsoleto de outra evolução após troca na barra lateral', () => {
    const result = resolveLatestTextForCopy(
      { id: 'ev-2', renderedText: 'Texto da evolução 2' },
      { evolutionId: 'ev-1', text: 'Texto editado da evolução 1' },
    );
    expect(result).toBe('Texto da evolução 2');
  });

  it('usa renderedText quando snapshot ainda é null', () => {
    const result = resolveLatestTextForCopy(
      { id: 'ev-1', renderedText: 'Texto persistido' },
      null,
    );
    expect(result).toBe('Texto persistido');
  });
});
