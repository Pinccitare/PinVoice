import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import type { PendingAudioJob } from '../types/clinical';

interface OfflineQueueBarProps {
  jobs: PendingAudioJob[];
  isOnline: boolean;
  onRetryAll: () => void;
  onDeleteJob: (id: string) => void;
}

export function OfflineQueueBar({
  jobs,
  isOnline,
  onRetryAll,
  onDeleteJob,
}: OfflineQueueBarProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="pv-glass rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" />
          <div>
            <p className="text-xs font-bold text-[#F59E0B]">
              Fila Offline: {jobs.length}{' '}
              {jobs.length === 1 ? 'áudio retido localmente' : 'áudios retidos localmente'}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--pv-text-secondary)' }}>
              {isOnline
                ? 'Conexão ativa — você pode reenviar agora. O áudio será destruído imediatamente após o processamento.'
                : 'Aguardando sinal Wi-Fi/4G para envio automático e destruição imediata.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOnline && (
            <button
              type="button"
              onClick={onRetryAll}
              className="flex items-center gap-1.5 rounded-lg bg-[#F59E0B] px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Processar Fila</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-2 rounded-lg border border-[#F59E0B]/30 px-2.5 py-1 text-[11px]"
            style={{ backgroundColor: 'var(--pv-bg-pill)' }}
          >
            <span className="font-mono font-semibold text-[#F59E0B]">{job.durationSec}s</span>
            <span style={{ color: 'var(--pv-text-secondary)' }}>
              {new Date(job.createdAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {job.lastError && (
              <span className="max-w-[180px] truncate text-[#EF4444]" title={job.lastError}>
                ({job.lastError})
              </span>
            )}
            <button
              type="button"
              onClick={() => onDeleteJob(job.id)}
              title="Descartar e destruir este áudio"
              className="transition hover:text-[#EF4444] cursor-pointer"
              style={{ color: 'var(--pv-text-muted)' }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
