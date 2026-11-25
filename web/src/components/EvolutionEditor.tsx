import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  FileText,
  Layers,
  Loader2,
  Mic,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import type { ClinicalTemplate, Evolution } from '../types/clinical';
import {
  isBlockContentEmpty,
  renderEvolutionBlocks,
  sanitizeForHospub,
} from '../lib/renderer';

export interface LatestEditorTextSnapshot {
  evolutionId: string;
  text: string;
}

export function resolveLatestTextForCopy(
  evolution: Pick<Evolution, 'id' | 'renderedText'>,
  snapshot: LatestEditorTextSnapshot | null,
): string {
  if (snapshot && snapshot.evolutionId === evolution.id) {
    return snapshot.text;
  }
  return evolution.renderedText;
}

type PendingSave =
  | { evolutionId: string; kind: 'raw'; text: string }
  | { evolutionId: string; kind: 'blocks'; updates: Record<string, string> };

interface EvolutionEditorProps {
  evolution: Evolution | null;
  templates: ClinicalTemplate[];
  hospubAsciiMode: boolean;
  isReformatting: boolean;
  isRecordingBusy: boolean;
  isComplementRecording: boolean;
  isComplementProcessing: boolean;
  recordingSeconds: number;
  copyPulseTimestamp: number;
  latestTextRef?: MutableRefObject<LatestEditorTextSnapshot | null>;
  onStartComplement: (evolutionId: string) => void;
  onStopComplement: () => void;
  onCancelComplement: () => void;
  onUpdateBlock: (evolutionId: string, blockId: string, content: string) => void | Promise<void>;
  onUpdateRawText: (evolutionId: string, text: string) => void | Promise<void>;
  onSwitchTemplate: (evolutionId: string, targetTemplateId: string) => void;
  onCopied: () => void;
}

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function EvolutionEditor({
  evolution,
  templates,
  hospubAsciiMode,
  isReformatting,
  isRecordingBusy,
  isComplementRecording,
  isComplementProcessing,
  recordingSeconds,
  copyPulseTimestamp,
  latestTextRef,
  onStartComplement,
  onStopComplement,
  onCancelComplement,
  onUpdateBlock,
  onUpdateRawText,
  onSwitchTemplate,
  onCopied,
}: EvolutionEditorProps) {
  const [viewMode, setViewMode] = useState<'text' | 'blocks'>('text');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [copied, setCopied] = useState(false);

  // Estado local síncrono para evitar que o cursor pule durante edições no meio do texto
  const [localText, setLocalText] = useState(evolution?.renderedText ?? '');
  const [localBlocks, setLocalBlocks] = useState<Record<string, string>>(
    evolution?.blocksContent ?? {},
  );
  const saveTimerRef = useRef<number | null>(null);
  const typingResetTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const editGenerationRef = useRef(0);
  const isUserTypingRef = useRef(false);
  const lastEvolutionIdRef = useRef<string | null>(evolution?.id ?? null);

  const onUpdateBlockRef = useRef(onUpdateBlock);
  const onUpdateRawTextRef = useRef(onUpdateRawText);
  onUpdateBlockRef.current = onUpdateBlock;
  onUpdateRawTextRef.current = onUpdateRawText;

  const activeTemplate = evolution
    ? templates.find((t) => t.id === evolution.templateId) ?? templates[0]
    : undefined;

  const flushPendingSave = (resetTypingAfter: boolean) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    const generationAtFlush = editGenerationRef.current;

    saveChainRef.current = saveChainRef.current
      .then(async () => {
        if (pending.kind === 'raw') {
          await Promise.resolve(onUpdateRawTextRef.current(pending.evolutionId, pending.text));
        } else {
          for (const [bId, content] of Object.entries(pending.updates)) {
            await Promise.resolve(onUpdateBlockRef.current(pending.evolutionId, bId, content));
          }
        }
      })
      .finally(() => {
        if (resetTypingAfter && editGenerationRef.current === generationAtFlush) {
          if (typingResetTimerRef.current !== null) {
            window.clearTimeout(typingResetTimerRef.current);
          }
          typingResetTimerRef.current = window.setTimeout(() => {
            if (editGenerationRef.current === generationAtFlush) {
              isUserTypingRef.current = false;
            }
            typingResetTimerRef.current = null;
          }, 150);
        }
      });
  };

  useEffect(() => {
    if (!evolution) {
      flushPendingSave(false);
      if (typingResetTimerRef.current !== null) {
        window.clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
      isUserTypingRef.current = false;
      setLocalText('');
      setLocalBlocks({});
      lastEvolutionIdRef.current = null;
      if (latestTextRef) {
        latestTextRef.current = null;
      }
      return;
    }

    const switchedEvolution = lastEvolutionIdRef.current !== evolution.id;
    if (switchedEvolution) {
      flushPendingSave(false);
      if (typingResetTimerRef.current !== null) {
        window.clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
      isUserTypingRef.current = false;
    }

    if (switchedEvolution || !isUserTypingRef.current) {
      setLocalText(evolution.renderedText);
      setLocalBlocks(evolution.blocksContent);
      lastEvolutionIdRef.current = evolution.id;
      if (latestTextRef) {
        latestTextRef.current = {
          evolutionId: evolution.id,
          text: evolution.renderedText,
        };
      }
    }
  }, [evolution?.id, evolution?.renderedText, evolution?.blocksContent, evolution, latestTextRef]);

  useEffect(() => {
    if (copyPulseTimestamp > 0) {
      setCopied(true);
      const t = window.setTimeout(() => setCopied(false), 2000);
      return () => window.clearTimeout(t);
    }
  }, [copyPulseTimestamp]);

  useEffect(() => {
    return () => {
      flushPendingSave(false);
      if (typingResetTimerRef.current !== null) {
        window.clearTimeout(typingResetTimerRef.current);
        typingResetTimerRef.current = null;
      }
    };
  }, []);

  const handleRawTextChange = (nextValue: string) => {
    if (!evolution) return;
    editGenerationRef.current += 1;
    isUserTypingRef.current = true;
    if (typingResetTimerRef.current !== null) {
      window.clearTimeout(typingResetTimerRef.current);
      typingResetTimerRef.current = null;
    }

    setLocalText(nextValue);
    if (latestTextRef) {
      latestTextRef.current = { evolutionId: evolution.id, text: nextValue };
    }

    if (
      pendingSaveRef.current &&
      (pendingSaveRef.current.evolutionId !== evolution.id ||
        pendingSaveRef.current.kind !== 'raw')
    ) {
      flushPendingSave(false);
    }

    pendingSaveRef.current = {
      evolutionId: evolution.id,
      kind: 'raw',
      text: nextValue,
    };

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      flushPendingSave(true);
    }, 350);
  };

  const handleBlockChange = (blockId: string, nextValue: string) => {
    if (!evolution) return;
    editGenerationRef.current += 1;
    isUserTypingRef.current = true;
    if (typingResetTimerRef.current !== null) {
      window.clearTimeout(typingResetTimerRef.current);
      typingResetTimerRef.current = null;
    }

    const nextBlocks = { ...localBlocks, [blockId]: nextValue };
    setLocalBlocks(nextBlocks);
    const nextRendered = activeTemplate
      ? renderEvolutionBlocks(activeTemplate, nextBlocks)
      : localText;
    setLocalText(nextRendered);
    if (latestTextRef) {
      latestTextRef.current = { evolutionId: evolution.id, text: nextRendered };
    }

    if (
      pendingSaveRef.current &&
      (pendingSaveRef.current.evolutionId !== evolution.id ||
        pendingSaveRef.current.kind !== 'blocks')
    ) {
      flushPendingSave(false);
    }

    if (
      pendingSaveRef.current &&
      pendingSaveRef.current.kind === 'blocks' &&
      pendingSaveRef.current.evolutionId === evolution.id
    ) {
      pendingSaveRef.current.updates[blockId] = nextValue;
    } else {
      pendingSaveRef.current = {
        evolutionId: evolution.id,
        kind: 'blocks',
        updates: { [blockId]: nextValue },
      };
    }

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      flushPendingSave(true);
    }, 350);
  };

  if (!evolution) {
    return (
      <div className="pv-glass flex min-h-[380px] flex-col items-center justify-center rounded-2xl border-dashed p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F67B8]/25 via-[#2B7BBB]/20 to-[#0D9488]/25 text-[#0D9488]">
          <FileText className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--pv-text)' }}>
          Pronto para capturar sua próxima evolução
        </h3>
        <p
          className="mt-1.5 max-w-md text-xs leading-relaxed"
          style={{ color: 'var(--pv-text-muted)' }}
        >
          Clique em <strong className="text-[#0D9488]">Nova Gravação</strong> (ou pressione{' '}
          <kbd className="pv-kbd">Ctrl+M</kbd>) e fale normalmente com o paciente ou narre o exame
          físico. O PinVoice separa as vozes, escolhe o modelo ideal, omite blocos vazios e destrói
          o áudio imediatamente após gerar o texto.
        </p>
      </div>
    );
  }

  const filledBlocks = activeTemplate
    ? activeTemplate.blocks.filter(
        (b) => b.enabled && !isBlockContentEmpty(evolution.blocksContent[b.id]),
      )
    : [];

  const selectionTag =
    evolution.selectionMode === 'auto'
      ? 'Auto'
      : evolution.selectionMode === 'voice'
        ? 'Voz'
        : 'Manual';

  const handleCopyHospub = async () => {
    const clean = sanitizeForHospub(localText, {
      asciiOnly: hospubAsciiMode,
    });
    await navigator.clipboard.writeText(clean);
    setCopied(true);
    onCopied();
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pv-glass flex flex-col overflow-hidden rounded-2xl">
      {/* Barra superior da Evolução */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
        style={{
          borderColor: 'var(--pv-border)',
          backgroundColor: 'var(--pv-bg-elevated)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Selo Modelo + [Trocar] */}
          <div
            className="relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <span style={{ color: 'var(--pv-text-muted)' }}>Modelo:</span>
            <span className="font-bold" style={{ color: 'var(--pv-text)' }}>
              {evolution.templateName} ({selectionTag})
            </span>
            <button
              type="button"
              disabled={isReformatting}
              onClick={() => setShowSwitcher((v) => !v)}
              className="ml-1 inline-flex items-center gap-1 rounded bg-[#2B7BBB]/20 px-1.5 py-0.5 text-[11px] font-semibold text-[#2B7BBB] transition hover:bg-[#2B7BBB] hover:text-white cursor-pointer disabled:opacity-50"
            >
              {isReformatting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3 w-3" />
              )}
              <span>Trocar</span>
            </button>

            {showSwitcher && (
              <div
                className="pv-glass-strong absolute left-0 top-full z-20 mt-1.5 w-52 rounded-xl p-1.5 shadow-2xl"
              >
                <p
                  className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--pv-text-muted)' }}
                >
                  Reformatar instantâneo (&lt;1s)
                </p>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={tpl.id === evolution.templateId}
                    onClick={() => {
                      setShowSwitcher(false);
                      onSwitchTemplate(evolution.id, tpl.id);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[#2B7BBB] hover:text-white disabled:opacity-40 cursor-pointer"
                    style={{ color: 'var(--pv-text)' }}
                  >
                    <span>{tpl.name}</span>
                    {tpl.id === evolution.templateId && (
                      <Check className="h-3.5 w-3.5 text-[#10B981]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {evolution.audioPurgedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#10B981]">
              <ShieldCheck className="h-3 w-3" />
              Áudio destruído
            </span>
          )}
        </div>

        {/* Ações: Complementar por voz + Toggle Texto/Blocos + Copiar 1-clique */}
        <div className="flex flex-wrap items-center gap-2">
          {isComplementRecording ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#EF4444]/50 bg-[#EF4444]/12 px-2 py-1">
              <span className="h-2 w-2 rounded-full bg-[#EF4444] animate-pulse" />
              <span className="font-mono text-xs font-bold text-[#EF4444]">
                {formatTimer(recordingSeconds)}
              </span>
              <button
                type="button"
                onClick={onStopComplement}
                className="flex items-center gap-1 rounded-md bg-[#EF4444] px-2 py-1 text-[11px] font-bold text-white hover:bg-red-500 cursor-pointer"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Integrar</span>
              </button>
              <button
                type="button"
                onClick={onCancelComplement}
                title="Cancelar complemento"
                className="rounded p-1 text-red-400 hover:bg-red-500/20 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : isComplementProcessing ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#0D9488]/40 bg-[#0D9488]/12 px-3 py-1.5 text-xs font-semibold text-[#0D9488]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Integrando áudio...</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isRecordingBusy}
              onClick={() => onStartComplement(evolution.id)}
              title="Gravar um áudio extra rápido para acrescentar exames, condutas ou achados nesta evolução"
              className="flex items-center gap-1.5 rounded-lg border border-[#0D9488]/45 bg-[#0D9488]/12 px-3 py-1.5 text-xs font-semibold text-[#0D9488] transition hover:bg-[#0D9488] hover:text-white disabled:opacity-40 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Complementar por voz</span>
            </button>
          )}

          <div
            className="flex rounded-lg border p-0.5 text-[11px]"
            style={{
              backgroundColor: 'var(--pv-bg-input)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('text')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition cursor-pointer ${
                viewMode === 'text' ? 'bg-[#2B7BBB] text-white' : ''
              }`}
              style={
                viewMode === 'text' ? undefined : { color: 'var(--pv-text-muted)' }
              }
            >
              <FileText className="h-3 w-3" />
              <span>Texto</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('blocks')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition cursor-pointer ${
                viewMode === 'blocks' ? 'bg-[#2B7BBB] text-white' : ''
              }`}
              style={
                viewMode === 'blocks' ? undefined : { color: 'var(--pv-text-muted)' }
              }
            >
              <Layers className="h-3 w-3" />
              <span>Blocos ({filledBlocks.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyHospub}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white transition cursor-pointer ${
              copied
                ? 'bg-[#10B981]'
                : 'bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] to-[#0D9488] shadow-md shadow-[#2B7BBB]/25 hover:brightness-110'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>
              {copied
                ? 'Copiado!'
                : hospubAsciiMode
                  ? 'Copiar p/ Hospub (ASCII)'
                  : 'Copiar p/ Hospub'}
            </span>
            {!copied && (
              <kbd className="pv-kbd ml-0.5 hidden text-white/90 xl:inline-flex">
                Ctrl+Shift+C
              </kbd>
            )}
          </button>
        </div>
      </div>

      {/* Corpo do Editor */}
      <div className="flex-1 p-4">
        {viewMode === 'text' ? (
          <>
            <textarea
              value={localText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              rows={19}
              spellCheck
              className="pv-input w-full resize-y rounded-xl p-4 font-sans text-[14.5px] leading-[1.68] tracking-[0.005em] outline-none transition"
            />
            <div
              className="mt-2 flex items-center justify-between text-[11px]"
              style={{ color: 'var(--pv-text-muted)' }}
            >
              <span>Edição livre • salvo e sincronizado em background</span>
              <span>
                {localText.trim() ? localText.trim().split(/\s+/).length : 0} palavras •{' '}
                {localText.length} caracteres
              </span>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {filledBlocks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--pv-text-muted)' }}>
                Nenhum bloco estruturado preenchido. Use a aba Texto para editar livremente.
              </p>
            ) : (
              filledBlocks.map((block) => (
                <div
                  key={block.id}
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--pv-bg-pill)',
                    borderColor: 'var(--pv-border)',
                  }}
                >
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#0D9488]">
                    {block.title}
                  </label>
                  <textarea
                    value={localBlocks[block.id] ?? ''}
                    onChange={(e) => handleBlockChange(block.id, e.target.value)}
                    rows={3}
                    className="pv-input w-full resize-y rounded-lg p-2.5 text-sm leading-relaxed outline-none"
                  />
                </div>
              ))
            )}
            <p className="text-[11px]" style={{ color: 'var(--pv-text-muted)' }}>
              Blocos sem dados falados no áudio foram omitidos automaticamente. Apagar o texto
              de um bloco aqui também o remove da evolução final.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
