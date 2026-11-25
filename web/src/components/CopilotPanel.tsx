import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardCheck,
  Copy,
  FlaskConical,
  Pill,
  Sparkles,
} from 'lucide-react';
import type { CopilotData } from '../types/clinical';

interface CopilotPanelProps {
  copilot: CopilotData | null;
}

function CopyMiniButton({ items }: { items: string[] }) {
  const [done, setDone] = useState(false);
  if (items.length === 0) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(items.map((i) => `- ${i}`).join('\n'));
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700 cursor-pointer"
    >
      {done ? <Check className="h-3 w-3 text-[#10B981]" /> : <Copy className="h-3 w-3" />}
      <span>{done ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

export function CopilotPanel({ copilot }: CopilotPanelProps) {
  const hasAny =
    copilot &&
    (copilot.alerts.length > 0 ||
      copilot.pendencies.length > 0 ||
      copilot.medications.length > 0 ||
      copilot.exams.length > 0);

  return (
    <aside className="flex flex-col rounded-2xl border border-slate-800 bg-[#1E293B] shadow-xl shadow-slate-950/40 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-[#0F172A]/60 px-4 py-3">
        <Sparkles className="h-4 w-4 text-blue-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#F8FAFC]">
          Copilot Clínico
        </h2>
      </div>

      {!hasAny ? (
        <div className="p-5 text-xs leading-relaxed text-slate-400">
          Alertas de segurança, dias de antibiótico, pendências de sistema, medicamentos e
          exames citados no áudio aparecerão estruturados aqui.
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {/* Alertas e Checagens */}
          {copilot.alerts.length > 0 && (
            <div className="rounded-xl border border-[#EF4444]/35 bg-[#EF4444]/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 text-[#EF4444]" />
                  <span>Alertas & Checagens</span>
                </div>
                <CopyMiniButton items={copilot.alerts} />
              </div>
              <ul className="space-y-1.5 text-xs text-slate-100">
                {copilot.alerts.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EF4444]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pendências de Sistema */}
          {copilot.pendencies.length > 0 && (
            <div className="rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <ClipboardCheck className="h-3.5 w-3.5 text-[#F59E0B]" />
                  <span>Pendências de Sistema</span>
                </div>
                <CopyMiniButton items={copilot.pendencies} />
              </div>
              <ul className="space-y-1.5 text-xs text-slate-100">
                {copilot.pendencies.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Medicamentos Citados */}
          {copilot.medications.length > 0 && (
            <div className="rounded-xl border border-slate-700/80 bg-[#0F172A] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                  <Pill className="h-3.5 w-3.5" />
                  <span>Medicamentos Citados</span>
                </div>
                <CopyMiniButton items={copilot.medications} />
              </div>
              <ul className="space-y-1.5 text-xs text-slate-200">
                {copilot.medications.map((item, idx) => (
                  <li key={idx} className="rounded-md bg-[#1E293B] px-2.5 py-1.5">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Exames Citados */}
          {copilot.exams.length > 0 && (
            <div className="rounded-xl border border-slate-700/80 bg-[#0F172A] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <FlaskConical className="h-3.5 w-3.5 text-[#10B981]" />
                  <span>Exames Citados</span>
                </div>
                <CopyMiniButton items={copilot.exams} />
              </div>
              <ul className="space-y-1.5 text-xs text-slate-200">
                {copilot.exams.map((item, idx) => (
                  <li key={idx} className="rounded-md bg-[#1E293B] px-2.5 py-1.5">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
