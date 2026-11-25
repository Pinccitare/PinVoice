import { useEffect, useRef } from 'react';
import { Loader2, Lock, Mic, Sparkles, Square, X } from 'lucide-react';
import type { ClinicalTemplate } from '../types/clinical';
import type { RecordingState } from '../hooks/usePinVoice';

interface RecordDockProps {
  recordingState: RecordingState;
  recordingSeconds: number;
  isComplementMode: boolean;
  analyser: AnalyserNode | null;
  templates: ClinicalTemplate[];
  lockedTemplateId: string | null;
  onLockTemplate: (id: string | null) => void;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RecordDock({
  recordingState,
  recordingSeconds,
  isComplementMode,
  analyser,
  templates,
  lockedTemplateId,
  onLockTemplate,
  onStart,
  onStop,
  onCancel,
}: RecordDockProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (recordingState !== 'recording' || !analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#4F67B8');
      gradient.addColorStop(0.35, '#2B7BBB');
      gradient.addColorStop(0.7, '#0D9488');
      gradient.addColorStop(1, '#10B981');

      const barCount = 30;
      const gap = 3;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i] ?? 0;
        const normalized = Math.max(0.14, val / 255);
        const barH = normalized * (height - 4);
        const x = i * (barWidth + gap);
        const y = (height - barH) / 2;

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 3);
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [recordingState, analyser]);

  return (
    <section className="pv-glass relative overflow-hidden rounded-2xl p-4">
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Seletor rápido de template */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onLockTemplate(null)}
            disabled={recordingState !== 'idle'}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
              lockedTemplateId === null
                ? 'bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] to-[#0D9488] text-white shadow-md shadow-teal-950/30'
                : 'border hover:border-[#0D9488]/45'
            }`}
            style={
              lockedTemplateId === null
                ? undefined
                : {
                    backgroundColor: 'var(--pv-bg-pill)',
                    borderColor: 'var(--pv-border)',
                    color: 'var(--pv-text-secondary)',
                  }
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto (Voz / IA)</span>
          </button>

          {templates.map((tpl) => {
            const active = lockedTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onLockTemplate(active ? null : tpl.id)}
                disabled={recordingState !== 'idle'}
                className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                  active
                    ? 'bg-gradient-to-r from-[#4F67B8] to-[#2B7BBB] text-white shadow-sm'
                    : 'border hover:border-[#2B7BBB]/45'
                }`}
                style={
                  active
                    ? undefined
                    : {
                        backgroundColor: 'var(--pv-bg-pill)',
                        borderColor: 'var(--pv-border)',
                        color: 'var(--pv-text-secondary)',
                      }
                }
              >
                {active && <Lock className="h-3 w-3" />}
                <span>{tpl.name}</span>
              </button>
            );
          })}
        </div>

        {/* Controles de Gravação */}
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {recordingState === 'recording' && (
            <div
              className="flex flex-1 items-center gap-3 rounded-xl border border-[#0D9488]/45 px-3.5 py-2 lg:flex-none"
              style={{ backgroundColor: 'var(--pv-bg-input)' }}
            >
              <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="font-mono text-sm font-bold text-[#0D9488]">
                {formatTimer(recordingSeconds)}
              </span>
              {isComplementMode && (
                <span className="rounded-md bg-[#0D9488]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0D9488]">
                  Complemento
                </span>
              )}
              <canvas
                ref={canvasRef}
                width={156}
                height={28}
                className="h-7 w-[124px] sm:w-[156px]"
              />
              <button
                type="button"
                onClick={onCancel}
                title="Cancelar gravação"
                className="rounded-lg p-1 transition hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                style={{ color: 'var(--pv-text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {recordingState === 'processing' && (
            <div className="flex items-center gap-2 rounded-xl border border-[#0D9488]/35 bg-[#0D9488]/12 px-4 py-2.5 text-xs font-semibold text-[#0D9488]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {isComplementMode
                  ? 'Integrando complemento...'
                  : 'Gerando evolução...'}
              </span>
            </div>
          )}

          {recordingState === 'idle' ? (
            <button
              type="button"
              onClick={onStart}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] to-[#0D9488] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#2B7BBB]/25 transition hover:brightness-110 active:scale-[0.98] cursor-pointer"
            >
              <Mic className="h-4 w-4" />
              <span>Nova Gravação</span>
              <kbd className="pv-kbd ml-1 hidden text-white/90 md:inline-flex">
                Ctrl+M
              </kbd>
            </button>
          ) : recordingState === 'recording' ? (
            <button
              type="button"
              onClick={onStop}
              className="relative flex items-center gap-2 rounded-xl bg-[#EF4444] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 cursor-pointer"
            >
              <Square className="h-4 w-4 fill-current" />
              <span>
                {isComplementMode ? 'Integrar Complemento' : 'Concluir & Gerar'}
              </span>
              <kbd className="pv-kbd ml-1 hidden text-white/90 md:inline-flex">
                Ctrl+M
              </kbd>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
