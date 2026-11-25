import { useEffect, useRef, useState } from 'react';
import { useSettings } from './hooks/useSettings';
import { usePinVoice } from './hooks/usePinVoice';
import { AuroraBackground } from './components/AuroraBackground';
import { Header } from './components/Header';
import { RecordDock } from './components/RecordDock';
import { OfflineQueueBar } from './components/OfflineQueueBar';
import { HistorySidebar } from './components/HistorySidebar';
import {
  EvolutionEditor,
  resolveLatestTextForCopy,
  type LatestEditorTextSnapshot,
} from './components/EvolutionEditor';
import { TemplateManager } from './components/TemplateManager';
import { SettingsModal } from './components/SettingsModal';
import { sanitizeForHospub } from './lib/renderer';

export function App() {
  const { settings, updateSettings } = useSettings();
  const pv = usePinVoice(settings);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyPulseTimestamp, setCopyPulseTimestamp] = useState(0);
  const latestEditorTextRef = useRef<LatestEditorTextSnapshot | null>(null);

  // Sincroniza tema Claro / Escuro no <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Atalhos de teclado no PC:
  // Ctrl+M -> Iniciar / Concluir gravação
  // Ctrl+Shift+C -> Copiar evolução ativa para o hb-hospub
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (templatesOpen || settingsOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === 'm' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (pv.recordingState === 'idle') {
          void pv.startRecording();
        } else if (pv.recordingState === 'recording') {
          void pv.stopAndProcessRecording();
        }
        return;
      }

      if (key === 'c' && e.shiftKey && !e.altKey) {
        if (!pv.activeEvolution) return;
        e.preventDefault();
        const textToCopy = resolveLatestTextForCopy(
          pv.activeEvolution,
          latestEditorTextRef.current,
        );
        const clean = sanitizeForHospub(textToCopy, {
          asciiOnly: settings.hospubAsciiMode,
        });
        void navigator.clipboard
          .writeText(clean)
          .then(() => {
            setCopyPulseTimestamp(Date.now());
            pv.showToast('success', 'Evolução copiada no formato seguro para o hb-hospub.');
          })
          .catch(() => {
            pv.showToast('error', 'Não foi possível copiar para a área de transferência.');
          });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    templatesOpen,
    settingsOpen,
    pv,
    settings.hospubAsciiMode,
  ]);

  const isComplementMode = Boolean(pv.complementTargetId);
  const isComplementForActive =
    Boolean(pv.activeEvolution) && pv.complementTargetId === pv.activeEvolution?.id;

  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground
        theme={settings.theme}
        paused={pv.recordingState === 'processing'}
      />

      <div className="relative z-10 flex min-h-screen flex-col pv-enter">
        <Header
          isOnline={pv.isOnline}
          hasApiKey={Boolean(settings.geminiApiKey.trim())}
          isCloudConnected={pv.isCloudConnected}
          theme={settings.theme}
          onToggleTheme={() =>
            updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
          }
          onSyncNow={pv.syncNowFromCloud}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 p-4">
          <RecordDock
            recordingState={pv.recordingState}
            recordingSeconds={pv.recordingSeconds}
            isComplementMode={isComplementMode}
            analyser={pv.analyser}
            templates={pv.templates}
            lockedTemplateId={pv.lockedTemplateId}
            onLockTemplate={pv.setLockedTemplateId}
            onStart={pv.startRecording}
            onStop={pv.stopAndProcessRecording}
            onCancel={pv.cancelRecording}
          />

          <OfflineQueueBar
            jobs={pv.pendingQueue}
            isOnline={pv.isOnline}
            onRetryAll={pv.flushOfflineQueue}
            onDeleteJob={pv.deleteQueuedAudio}
          />

          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[288px_1fr]">
            <HistorySidebar
              evolutions={pv.evolutions}
              activeId={pv.activeEvolutionId}
              onSelect={pv.setActiveEvolutionId}
              onDelete={pv.deleteEvolution}
              onClearShift={pv.clearShiftHistory}
            />

            <EvolutionEditor
              evolution={pv.activeEvolution}
              templates={pv.templates}
              hospubAsciiMode={settings.hospubAsciiMode}
              isReformatting={pv.isReformatting}
              streamingText={pv.streamingText}
              isRecordingBusy={pv.recordingState !== 'idle'}
              isComplementRecording={
                isComplementForActive && pv.recordingState === 'recording'
              }
              isComplementProcessing={
                isComplementForActive && pv.recordingState === 'processing'
              }
              recordingSeconds={pv.recordingSeconds}
              copyPulseTimestamp={copyPulseTimestamp}
              latestTextRef={latestEditorTextRef}
              onStartComplement={pv.startComplementRecording}
              onStopComplement={pv.stopAndProcessRecording}
              onCancelComplement={pv.cancelRecording}
              onUpdateBlock={pv.updateEvolutionBlock}
              onUpdateRawText={pv.updateEvolutionRawText}
              onSwitchTemplate={pv.switchEvolutionTemplate}
              onCopied={() =>
                pv.showToast('success', 'Evolução copiada no formato seguro para o hb-hospub.')
              }
            />
          </div>
        </main>
      </div>

      <TemplateManager
        open={templatesOpen}
        templates={pv.templates}
        onClose={() => setTemplatesOpen(false)}
        onSaveTemplate={pv.saveTemplate}
        onDeleteTemplate={pv.removeTemplate}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onUpdate={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {pv.toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm">
          <div
            className={`pv-glass-strong rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl ${
              pv.toast.type === 'success'
                ? 'border-[#10B981]/50 text-[#10B981]'
                : pv.toast.type === 'warning'
                  ? 'border-[#F59E0B]/50 text-[#F59E0B]'
                  : pv.toast.type === 'error'
                    ? 'border-[#EF4444]/50 text-[#EF4444]'
                    : 'border-[#0D9488]/50 text-[#0D9488]'
            }`}
          >
            {pv.toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
