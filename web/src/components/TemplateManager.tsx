import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { ClinicalTemplate, TemplateBlock } from '../types/clinical';

interface TemplateManagerProps {
  open: boolean;
  templates: ClinicalTemplate[];
  onClose: () => void;
  onSaveTemplate: (tpl: ClinicalTemplate) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || `bloco_${Date.now()}`
  );
}

export function TemplateManager({
  open,
  templates,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
}: TemplateManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? '');
  const [draft, setDraft] = useState<ClinicalTemplate | null>(
    templates[0] ? structuredClone(templates[0]) : null,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && !draft && templates.length > 0) {
      setSelectedId(templates[0].id);
      setDraft(structuredClone(templates[0]));
    }
  }, [open, draft, templates]);

  if (!open) return null;

  const selectTemplate = (tpl: ClinicalTemplate) => {
    setSelectedId(tpl.id);
    setDraft(structuredClone(tpl));
  };

  const createNewTemplate = () => {
    const id = `custom_${Date.now()}`;
    const fresh: ClinicalTemplate = {
      id,
      name: 'Novo Modelo',
      description: 'Template personalizado.',
      voiceTriggers: ['novo modelo'],
      clinicalKeywords: [],
      isDefault: false,
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: 'identificacao',
          title: 'IDENTIFICAÇÃO',
          hint: 'Nome, idade, contexto clínico.',
          enabled: true,
        },
        {
          id: 'queixa',
          title: 'QUEIXA / SUBJETIVO',
          hint: 'Motivo do atendimento e sintomas.',
          enabled: true,
        },
        {
          id: 'exame_fisico',
          title: 'EXAME FÍSICO',
          hint: 'Achados objetivos e sinais vitais.',
          enabled: true,
        },
        {
          id: 'conduta',
          title: 'CONDUTA',
          hint: 'Prescrição, exames e encaminhamentos.',
          enabled: true,
        },
      ],
    };
    setSelectedId(id);
    setDraft(fresh);
  };

  const moveBlock = (from: number, to: number) => {
    if (!draft || to < 0 || to >= draft.blocks.length || from === to) return;
    const next = [...draft.blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraft({ ...draft, blocks: next });
  };

  const updateBlock = (idx: number, patch: Partial<TemplateBlock>) => {
    if (!draft) return;
    const next = draft.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    setDraft({ ...draft, blocks: next });
  };

  const addBlock = () => {
    if (!draft) return;
    const id = `bloco_${Date.now()}`;
    setDraft({
      ...draft,
      blocks: [
        ...draft.blocks,
        {
          id,
          title: 'NOVO BLOCO',
          hint: 'Descreva o que a IA deve extrair para este bloco.',
          enabled: true,
        },
      ],
    });
  };

  const removeBlock = (idx: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      blocks: draft.blocks.filter((_, i) => i !== idx),
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    const normalized: ClinicalTemplate = {
      ...draft,
      name: draft.name.trim() || 'Modelo sem nome',
      blocks: draft.blocks.map((b) => ({
        ...b,
        id: b.id || slugify(b.title),
        title: b.title.trim() || 'BLOCO',
      })),
    };
    await onSaveTemplate(normalized);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md">
      <div className="pv-glass-strong flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--pv-border)' }}
        >
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--pv-text)' }}>
              Gerenciador de Templates e Blocos
            </h2>
            <p className="text-xs" style={{ color: 'var(--pv-text-muted)' }}>
              Edite, adicione ou reordene blocos. Blocos sem dados falados no áudio são omitidos automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-500/15 cursor-pointer"
            style={{ color: 'var(--pv-text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo 2 colunas */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_1fr]">
          {/* Lista de Templates */}
          <div
            className="flex flex-col border-b p-3 md:border-b-0 md:border-r overflow-y-auto"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <button
              type="button"
              onClick={createNewTemplate}
              className="mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] to-[#0D9488] px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Template</span>
            </button>

            <div className="space-y-1">
              {templates.map((tpl) => {
                const isSelected = selectedId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => selectTemplate(tpl)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'border border-[#0D9488]/55 bg-[#0D9488]/15 text-[#0D9488]'
                        : 'hover:bg-[#2B7BBB]/10'
                    }`}
                    style={isSelected ? undefined : { color: 'var(--pv-text)' }}
                  >
                    <span className="truncate">{tpl.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--pv-text-muted)' }}>
                      {tpl.blocks.filter((b) => b.enabled).length} blocos
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor do Template Selecionado */}
          {draft ? (
            <div className="flex flex-col overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--pv-text-muted)' }}
                  >
                    Nome do Template
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="pv-input w-full rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--pv-text-muted)' }}
                  >
                    Comandos de Voz (separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={draft.voiceTriggers.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        voiceTriggers: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="pv-input w-full rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--pv-text-muted)' }}
                  >
                    Blocos do Modelo (arraste ou use ↑↓ para reordenar)
                  </label>
                  <button
                    type="button"
                    onClick={addBlock}
                    className="flex items-center gap-1 rounded-lg border border-[#2B7BBB]/40 bg-[#2B7BBB]/12 px-2.5 py-1 text-xs font-semibold text-[#2B7BBB] transition hover:bg-[#2B7BBB] hover:text-white cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Bloco</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {draft.blocks.map((block, idx) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) moveBlock(dragIndex, idx);
                        setDragIndex(null);
                      }}
                      className="flex items-start gap-2 rounded-xl border p-3"
                      style={{
                        backgroundColor: 'var(--pv-bg-pill)',
                        borderColor: 'var(--pv-border)',
                      }}
                    >
                      <div
                        className="mt-2 cursor-grab"
                        style={{ color: 'var(--pv-text-muted)' }}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={block.title}
                            onChange={(e) =>
                              updateBlock(idx, { title: e.target.value })
                            }
                            placeholder="Título do bloco (ex.: EXAME FÍSICO)"
                            className="pv-input flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase outline-none"
                          />
                          <label
                            className="flex items-center gap-1.5 text-[11px] cursor-pointer"
                            style={{ color: 'var(--pv-text-secondary)' }}
                          >
                            <input
                              type="checkbox"
                              checked={block.enabled}
                              onChange={(e) =>
                                updateBlock(idx, { enabled: e.target.checked })
                              }
                              className="accent-[#0D9488]"
                            />
                            <span>Ativo</span>
                          </label>
                        </div>

                        <input
                          type="text"
                          value={block.hint}
                          onChange={(e) => updateBlock(idx, { hint: e.target.value })}
                          placeholder="Orientação para a IA sobre o que colocar neste bloco..."
                          className="pv-input w-full rounded-lg px-2.5 py-1.5 text-xs outline-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, idx - 1)}
                          disabled={idx === 0}
                          title="Mover para cima"
                          className="rounded p-1 transition hover:bg-[#2B7BBB]/15 disabled:opacity-30 cursor-pointer"
                          style={{ color: 'var(--pv-text-muted)' }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, idx + 1)}
                          disabled={idx === draft.blocks.length - 1}
                          title="Mover para baixo"
                          className="rounded p-1 transition hover:bg-[#2B7BBB]/15 disabled:opacity-30 cursor-pointer"
                          style={{ color: 'var(--pv-text-muted)' }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlock(idx)}
                          title="Remover bloco"
                          className="rounded p-1 transition hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
                          style={{ color: 'var(--pv-text-muted)' }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="flex items-center justify-between border-t pt-4"
                style={{ borderColor: 'var(--pv-border)' }}
              >
                {!draft.isDefault ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeleteTemplate(draft.id);
                      const fallback = templates.find((t) => t.id !== draft.id);
                      if (fallback) selectTemplate(fallback);
                      else setDraft(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/15 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Excluir Template</span>
                  </button>
                ) : (
                  <span className="text-[11px]" style={{ color: 'var(--pv-text-muted)' }}>
                    Template padrão (editável e reordenável)
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 rounded-xl bg-[#10B981] px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>Salvar Template</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center justify-center p-8 text-xs"
              style={{ color: 'var(--pv-text-muted)' }}
            >
              Selecione ou crie um template.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
