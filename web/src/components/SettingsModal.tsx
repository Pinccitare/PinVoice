import { Cloud, KeyRound, Keyboard, Shield, X } from 'lucide-react';
import type { PinVoiceSettings } from '../types/clinical';

interface SettingsModalProps {
  open: boolean;
  settings: PinVoiceSettings;
  onUpdate: (patch: Partial<PinVoiceSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  settings,
  onUpdate,
  onClose,
}: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md">
      <div className="pv-glass-strong flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl">
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--pv-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--pv-text)' }}>
            Configurações do PinVoice
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:bg-slate-500/15 cursor-pointer"
            style={{ color: 'var(--pv-text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Motor Gemini BYOK */}
          <section
            className="space-y-3 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0D9488]">
              <KeyRound className="h-4 w-4" />
              <span>Gemini API (Direto do Navegador)</span>
            </div>

            <div>
              <label
                className="mb-1 block text-xs"
                style={{ color: 'var(--pv-text-secondary)' }}
              >
                Gemini API Key (salva apenas neste navegador)
              </label>
              <input
                type="password"
                value={settings.geminiApiKey}
                onChange={(e) => onUpdate({ geminiApiKey: e.target.value })}
                placeholder="Cole sua chave Gemini..."
                className="pv-input w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-xs"
                style={{ color: 'var(--pv-text-secondary)' }}
              >
                Modelo Multimodal (thinkingBudget=0 ativado)
              </label>
              <select
                value={settings.geminiModel}
                onChange={(e) => onUpdate({ geminiModel: e.target.value })}
                className="pv-input w-full rounded-lg px-3 py-2 text-xs outline-none"
              >
                <option value="gemini-3.5-flash-lite">
                  gemini-3.5-flash-lite (Recomendado — Ultra-rápido)
                </option>
                <option value="gemini-flash-lite-latest">
                  gemini-flash-lite-latest (Rápido)
                </option>
                <option value="gemini-3.6-flash">
                  gemini-3.6-flash (Estável)
                </option>
                <option value="gemini-3.5-flash">
                  gemini-3.5-flash (Alternativo)
                </option>
              </select>
            </div>
          </section>

          {/* Prontuário hb-hospub */}
          <section
            className="space-y-3 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#10B981]">
              <Shield className="h-4 w-4" />
              <span>Prontuário hb-hospub</span>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.hospubAsciiMode}
                onChange={(e) => onUpdate({ hospubAsciiMode: e.target.checked })}
                className="mt-1 accent-[#0D9488]"
              />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--pv-text)' }}>
                  Modo ASCII Estrito para hb-hospub
                </p>
                <p className="text-[11px]" style={{ color: 'var(--pv-text-muted)' }}>
                  Remove acentos e caracteres especiais ao copiar para não quebrar encoding.
                </p>
              </div>
            </label>
          </section>

          {/* Atalhos de Teclado */}
          <section
            className="space-y-2 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#4F67B8]">
              <Keyboard className="h-4 w-4" />
              <span>Atalhos Rápidos no PC</span>
            </div>
            <div
              className="flex items-center justify-between text-xs"
              style={{ color: 'var(--pv-text-secondary)' }}
            >
              <span>Iniciar / Concluir gravação</span>
              <kbd className="pv-kbd">Ctrl + M</kbd>
            </div>
            <div
              className="flex items-center justify-between text-xs"
              style={{ color: 'var(--pv-text-secondary)' }}
            >
              <span>Copiar evolução ativa p/ hb-hospub</span>
              <kbd className="pv-kbd">Ctrl + Shift + C</kbd>
            </div>
          </section>

          {/* Supabase Modo Pessoal Direto */}
          <section
            className="space-y-2.5 rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--pv-bg-pill)',
              borderColor: 'var(--pv-border)',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2B7BBB]">
              <Cloud className="h-4 w-4" />
              <span>Nuvem Supabase (Modo Pessoal Direto — Sem Login)</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--pv-text-muted)' }}>
              Sincroniza evoluções entre Relógio, Celular e PC automaticamente em background.
            </p>
            <input
              type="url"
              value={settings.supabaseUrl}
              onChange={(e) => onUpdate({ supabaseUrl: e.target.value })}
              placeholder="https://seu-projeto.supabase.co"
              className="pv-input w-full rounded-lg px-3 py-2 text-xs outline-none"
            />
            <input
              type="password"
              value={settings.supabaseAnonKey}
              onChange={(e) => onUpdate({ supabaseAnonKey: e.target.value })}
              placeholder="Supabase Publishable / Anon Key"
              className="pv-input w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
            />
          </section>
        </div>

        <div
          className="flex justify-end border-t px-5 py-3"
          style={{ borderColor: 'var(--pv-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-[#4F67B8] via-[#2B7BBB] to-[#0D9488] px-5 py-2 text-xs font-bold text-white hover:brightness-110 cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
