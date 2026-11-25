import {
  Cloud,
  CloudOff,
  LayoutTemplate,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import type { ThemeMode } from '../types/clinical';

interface HeaderProps {
  isOnline: boolean;
  hasApiKey: boolean;
  isCloudConnected: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSyncNow: () => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
}

export function Header({
  isOnline,
  hasApiKey,
  isCloudConnected,
  theme,
  onToggleTheme,
  onSyncNow,
  onOpenTemplates,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-2xl transition-colors"
      style={{
        backgroundColor: 'var(--pv-bg-elevated)',
        borderColor: 'var(--pv-border)',
      }}
    >
      {/* Linha luminosa sutil na paleta do relógio */}
      <div className="h-[2px] w-full bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] via-[#0D9488] to-[#10B981] opacity-85" />

      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2.5">
        {/* Marca */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#0D9488]/35 bg-[#090E1A] shadow-lg shadow-teal-950/30">
            <img src="/icon.svg" alt="PinVoice" className="h-9 w-9" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-base font-bold tracking-tight"
                style={{ color: 'var(--pv-text)' }}
              >
                PinVoice
              </h1>
              <span className="rounded-full border border-[#0D9488]/35 bg-gradient-to-r from-[#4F67B8]/15 via-[#2B7BBB]/15 to-[#10B981]/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#0D9488]">
                Clínico Pro
              </span>
            </div>
            <p
              className="hidden text-[11px] sm:block"
              style={{ color: 'var(--pv-text-muted)' }}
            >
              Evoluções médicas por voz • Relógio, Celular &amp; Web
            </p>
          </div>
        </div>

        {/* Status + Ações */}
        <div className="flex items-center gap-2">
          {!isOnline && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 px-2.5 py-1 text-xs font-medium text-[#F59E0B]">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Offline</span>
            </div>
          )}

          <button
            type="button"
            onClick={onSyncNow}
            title="Clique para atualizar evoluções da nuvem agora"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              isCloudConnected
                ? 'border-[#10B981]/35 bg-[#10B981]/12 text-[#10B981] hover:bg-[#10B981]/20'
                : 'hover:opacity-90'
            }`}
            style={
              isCloudConnected
                ? undefined
                : {
                    backgroundColor: 'var(--pv-bg-pill)',
                    borderColor: 'var(--pv-border)',
                    color: 'var(--pv-text-muted)',
                  }
            }
          >
            {isCloudConnected ? (
              <Cloud className="h-3.5 w-3.5 text-[#10B981]" />
            ) : (
              <CloudOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isCloudConnected ? 'Nuvem Ativa' : 'Local'}
            </span>
            <RefreshCw className="h-3 w-3 opacity-75" />
          </button>

          {/* Alternador Claro / Escuro */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={
              theme === 'dark'
                ? 'Alternar para Modo Claro (consultório iluminado)'
                : 'Alternar para Modo Escuro (plantão noturno)'
            }
            aria-label="Alternar tema claro ou escuro"
            className="flex h-8 w-8 items-center justify-center rounded-xl border transition hover:border-[#0D9488]/50 cursor-pointer"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
              color: 'var(--pv-text-secondary)',
            }}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-[#4F67B8]" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenTemplates}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:border-[#0D9488]/50 cursor-pointer"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
              color: 'var(--pv-text)',
            }}
          >
            <LayoutTemplate className="h-3.5 w-3.5 text-[#0D9488]" />
            <span className="hidden sm:inline">Templates</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              hasApiKey
                ? 'hover:border-[#2B7BBB]/50'
                : 'border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25'
            }`}
            style={
              hasApiKey
                ? {
                    backgroundColor: 'var(--pv-bg-pill)',
                    borderColor: 'var(--pv-border)',
                    color: 'var(--pv-text)',
                  }
                : undefined
            }
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {hasApiKey ? 'Configurações' : 'Configurar API Key'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
