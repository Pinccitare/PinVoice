import { useState } from 'react';
import { Clock, Laptop, Search, Smartphone, Trash2, Watch } from 'lucide-react';
import type { Evolution } from '../types/clinical';

interface HistorySidebarProps {
  evolutions: Evolution[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearShift: () => void;
}

function DeviceIcon({ device }: { device: Evolution['sourceDevice'] }) {
  if (device === 'wear') return <Watch className="h-3.5 w-3.5 text-[#0D9488]" />;
  if (device === 'android') return <Smartphone className="h-3.5 w-3.5 text-[#2B7BBB]" />;
  return <Laptop className="h-3.5 w-3.5 text-[#4F67B8]" />;
}

function badgeColor(templateId: string): string {
  switch (templateId) {
    case 'cirurgica':
      return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
    case 'ps':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    case 'uti':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'aps':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    default:
      return 'bg-[#2B7BBB]/15 text-[#2B7BBB] border-[#2B7BBB]/30';
  }
}

export function HistorySidebar({
  evolutions,
  activeId,
  onSelect,
  onDelete,
  onClearShift,
}: HistorySidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? evolutions.filter((ev) => {
        const q = query.toLowerCase();
        return (
          ev.patientLabel.toLowerCase().includes(q) ||
          ev.templateName.toLowerCase().includes(q) ||
          ev.renderedText.toLowerCase().includes(q)
        );
      })
    : evolutions;

  return (
    <aside className="pv-glass flex flex-col overflow-hidden rounded-2xl">
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--pv-border)' }}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#0D9488]" />
          <h2
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--pv-text)' }}
          >
            Plantão ({evolutions.length})
          </h2>
        </div>

        {evolutions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Limpar todas as evoluções do plantão?')) {
                onClearShift();
              }
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
            style={{ color: 'var(--pv-text-muted)' }}
          >
            <Trash2 className="h-3 w-3" />
            <span>Limpar</span>
          </button>
        )}
      </div>

      {evolutions.length > 3 && (
        <div
          className="border-b px-3 py-2"
          style={{ borderColor: 'var(--pv-border)' }}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: 'var(--pv-text-muted)' }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente ou texto..."
              className="pv-input w-full rounded-lg py-1.5 pl-8 pr-2.5 text-xs outline-none transition"
            />
          </div>
        </div>
      )}

      <div className="max-h-[340px] flex-1 overflow-y-auto lg:max-h-[calc(100vh-260px)]">
        {filtered.length === 0 ? (
          <div
            className="p-6 text-center text-xs"
            style={{ color: 'var(--pv-text-muted)' }}
          >
            {evolutions.length === 0
              ? 'Nenhuma evolução gravada ainda.'
              : 'Nenhum resultado para a busca.'}
          </div>
        ) : (
          filtered.map((ev) => {
            const isSelected = ev.id === activeId;
            return (
              <div
                key={ev.id}
                onClick={() => onSelect(ev.id)}
                className={`group flex cursor-pointer items-start justify-between gap-2 border-b px-3.5 py-3 transition ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#0D9488]/18 via-[#2B7BBB]/8 to-transparent border-l-2 border-l-[#0D9488]'
                    : 'hover:bg-[#2B7BBB]/8'
                }`}
                style={{ borderBottomColor: 'var(--pv-border)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <DeviceIcon device={ev.sourceDevice} />
                    <span
                      className="truncate text-xs font-semibold"
                      style={{ color: 'var(--pv-text)' }}
                    >
                      {ev.patientLabel || 'Paciente sem identificação'}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 flex items-center gap-2 text-[11px]"
                    style={{ color: 'var(--pv-text-muted)' }}
                  >
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badgeColor(ev.templateId)}`}
                    >
                      {ev.templateName}
                    </span>
                    <span>
                      {new Date(ev.createdAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p
                    className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed"
                    style={{ color: 'var(--pv-text-muted)' }}
                  >
                    {ev.renderedText}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ev.id);
                  }}
                  title="Excluir evolução"
                  className="rounded p-1 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100 cursor-pointer"
                  style={{ color: 'var(--pv-text-muted)' }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
