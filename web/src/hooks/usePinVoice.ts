import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClinicalTemplate,
  Evolution,
  PendingAudioJob,
  PinVoiceSettings,
} from '../types/clinical';
import { db, ensureDefaultTemplates } from '../lib/db';
import {
  blobToBase64,
  EphemeralAudioRecorder,
} from '../lib/audioRecorder';
import {
  complementEvolutionWithAudio,
  processClinicalAudioWithGemini,
  reformatEvolutionToTemplate,
} from '../lib/geminiClient';
import {
  buildEvolutionFromGemini,
  enqueueOfflineAudio,
  processQueuedJob,
  purgeAllQueuedAudios,
} from '../lib/offlineQueue';
import { filterNonEmptyBlocks, renderEvolutionBlocks } from '../lib/renderer';
import {
  clearAllCloudEvolutions,
  deleteEvolutionFromCloud,
  deleteTemplateFromCloud,
  fetchCloudEvolutions,
  fetchCloudTemplates,
  getSupabaseClient,
  subscribePinVoiceRealtime,
  upsertEvolutionToCloud,
  upsertTemplateToCloud,
} from '../lib/supabaseSync';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface ToastNotice {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

export function usePinVoice(settings: PinVoiceSettings) {
  const [templates, setTemplates] = useState<ClinicalTemplate[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [activeEvolutionId, setActiveEvolutionId] = useState<string | null>(null);
  const [lockedTemplateId, setLockedTemplateId] = useState<string | null>(null);
  const [pendingQueue, setPendingQueue] = useState<PendingAudioJob[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [complementTargetId, setComplementTargetId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isReformatting, setIsReformatting] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const recorderRef = useRef<EphemeralAudioRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const processingQueueRef = useRef(false);

  const showToast = useCallback(
    (type: ToastNotice['type'], message: string) => {
      const id = crypto.randomUUID();
      setToast({ id, type, message });
      window.setTimeout(() => {
        setToast((curr) => (curr?.id === id ? null : curr));
      }, 3600);
    },
    [],
  );

  const refreshLocalState = useCallback(async () => {
    const [tpls, evs, jobs] = await Promise.all([
      ensureDefaultTemplates(),
      db.evolutions.orderBy('createdAt').reverse().toArray(),
      db.pendingAudioQueue.orderBy('createdAt').toArray(),
    ]);
    setTemplates(tpls);
    setEvolutions(evs);
    setPendingQueue(jobs);
    setActiveEvolutionId((curr) => {
      if (curr && evs.some((e) => e.id === curr)) return curr;
      return evs[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    refreshLocalState();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      recorderRef.current?.purgeMemoryBuffers();
    };
  }, [refreshLocalState]);

  // Supabase Modo Pessoal Direto (sem login/senha/TTL)
  useEffect(() => {
    const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!client) {
      setIsCloudConnected(false);
      return;
    }

    let cancelled = false;

    const mergeCloudEvolutionsSafely = async (
      cloudEvolutions: Evolution[],
    ) => {
      const localEvolutions = await db.evolutions.toArray();
      const dirtyLocals = localEvolutions.filter((e) => !e.syncedToCloud);

      // Envia primeiro qualquer edição/criação local ainda não sincronizada
      const stillDirtyIds = new Set<string>();
      for (const dirty of dirtyLocals) {
        try {
          await upsertEvolutionToCloud(client, dirty);
          await db.evolutions.update(dirty.id, { syncedToCloud: true });
        } catch {
          stillDirtyIds.add(dirty.id);
        }
      }

      const toPut = cloudEvolutions.filter((ev) => !stillDirtyIds.has(ev.id));
      if (toPut.length > 0) {
        await db.evolutions.bulkPut(toPut);
      }
    };

    const pullFromCloud = async (showError = false) => {
      try {
        const [cloudTemplates, cloudEvolutions] = await Promise.all([
          fetchCloudTemplates(client),
          fetchCloudEvolutions(client),
        ]);
        if (cancelled) return;
        setIsCloudConnected(true);
        if (cloudTemplates.length > 0) await db.templates.bulkPut(cloudTemplates);
        await mergeCloudEvolutionsSafely(cloudEvolutions);
        await refreshLocalState();
      } catch (err) {
        if (cancelled) return;
        setIsCloudConnected(false);
        if (showError) {
          showToast(
            'warning',
            `Supabase: ${err instanceof Error ? err.message : 'rode a migração 002 no SQL Editor'}`,
          );
        }
      }
    };

    pullFromCloud(true);

    const channel = subscribePinVoiceRealtime(client, {
      onEvolutionUpsert: async (ev) => {
        const local = await db.evolutions.get(ev.id);
        if (local && !local.syncedToCloud && local.updatedAt > ev.updatedAt) {
          return;
        }
        await db.evolutions.put(ev);
        await refreshLocalState();
      },
      onEvolutionDelete: async (id) => {
        await db.evolutions.delete(id);
        await refreshLocalState();
      },
      onTemplateUpsert: async (tpl) => {
        await db.templates.put(tpl);
        await refreshLocalState();
      },
      onTemplateDelete: async (id) => {
        await db.templates.delete(id);
        await refreshLocalState();
      },
    });

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pullFromCloud(false);
      }
    }, 10000);

    const onFocusSync = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pullFromCloud(false);
      }
    };
    document.addEventListener('visibilitychange', onFocusSync);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onFocusSync);
      client.removeChannel(channel);
    };
  }, [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState, showToast]);

  const syncNowFromCloud = useCallback(async () => {
    const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!client) {
      showToast('warning', 'Configure URL e Key do Supabase nas Configurações.');
      return;
    }
    try {
      const [cloudTemplates, cloudEvolutions] = await Promise.all([
        fetchCloudTemplates(client),
        fetchCloudEvolutions(client),
      ]);
      setIsCloudConnected(true);
      if (cloudTemplates.length > 0) await db.templates.bulkPut(cloudTemplates);

      const localEvolutions = await db.evolutions.toArray();
      const stillDirtyIds = new Set<string>();
      for (const dirty of localEvolutions.filter((e) => !e.syncedToCloud)) {
        try {
          await upsertEvolutionToCloud(client, dirty);
          await db.evolutions.update(dirty.id, { syncedToCloud: true });
        } catch {
          stillDirtyIds.add(dirty.id);
        }
      }
      const toPut = cloudEvolutions.filter((ev) => !stillDirtyIds.has(ev.id));
      if (toPut.length > 0) await db.evolutions.bulkPut(toPut);

      await refreshLocalState();
      showToast('success', `Sincronizado (${cloudEvolutions.length} evoluções na nuvem).`);
    } catch (err) {
      setIsCloudConnected(false);
      showToast(
        'error',
        `Erro ao sincronizar: ${err instanceof Error ? err.message : 'verifique a migração 002'}`,
      );
    }
  }, [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState, showToast]);

  const syncEvolutionIfConnected = useCallback(
    async (ev: Evolution) => {
      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!client) return;
      try {
        await upsertEvolutionToCloud(client, ev);
        await db.evolutions.update(ev.id, { syncedToCloud: true });
        setIsCloudConnected(true);
        await refreshLocalState();
      } catch {
        // Mantém salvo localmente
      }
    },
    [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState],
  );

  const flushOfflineQueue = useCallback(async () => {
    if (processingQueueRef.current || !isOnline || !settings.geminiApiKey.trim()) {
      return;
    }
    const jobs = await db.pendingAudioQueue.orderBy('createdAt').toArray();
    if (jobs.length === 0) return;

    processingQueueRef.current = true;
    try {
      const currentTemplates = await ensureDefaultTemplates();
      for (const job of jobs) {
        try {
          const ev = await processQueuedJob(job.id, currentTemplates, settings);
          setActiveEvolutionId(ev.id);
          await refreshLocalState();
          void syncEvolutionIfConnected(ev);
          showToast('success', 'Áudio offline processado e sincronizado.');
        } catch (err) {
          await refreshLocalState();
          showToast(
            'warning',
            err instanceof Error
              ? `Fila offline mantida: ${err.message}`
              : 'Falha ao enviar áudio da fila offline.',
          );
          break;
        }
      }
    } finally {
      processingQueueRef.current = false;
    }
  }, [isOnline, settings, refreshLocalState, syncEvolutionIfConnected, showToast]);

  useEffect(() => {
    if (isOnline && pendingQueue.length > 0 && settings.geminiApiKey.trim()) {
      flushOfflineQueue();
    }
  }, [isOnline, pendingQueue.length, settings.geminiApiKey, flushOfflineQueue]);

  const startRecording = useCallback(async () => {
    if (recordingState !== 'idle') return;
    try {
      if (!recorderRef.current) {
        recorderRef.current = new EphemeralAudioRecorder();
      }
      await recorderRef.current.start();
      setComplementTargetId(null);
      setRecordingSeconds(0);
      setRecordingState('recording');
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error
          ? `Microfone indisponível: ${err.message}`
          : 'Não foi possível acessar o microfone.',
      );
    }
  }, [recordingState, showToast]);

  const startComplementRecording = useCallback(
    async (evolutionId: string) => {
      if (recordingState !== 'idle') return;
      try {
        if (!recorderRef.current) {
          recorderRef.current = new EphemeralAudioRecorder();
        }
        await recorderRef.current.start();
        setComplementTargetId(evolutionId);
        setRecordingSeconds(0);
        setRecordingState('recording');
        timerRef.current = window.setInterval(() => {
          setRecordingSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        setComplementTargetId(null);
        showToast(
          'error',
          err instanceof Error
            ? `Microfone indisponível: ${err.message}`
            : 'Não foi possível acessar o microfone.',
        );
      }
    },
    [recordingState, showToast],
  );

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.cancel();
    setComplementTargetId(null);
    setRecordingSeconds(0);
    setRecordingState('idle');
    showToast('info', 'Gravação cancelada.');
  }, [showToast]);

  const stopAndProcessRecording = useCallback(async () => {
    if (recordingState !== 'recording' || !recorderRef.current) return;

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const activeComplementId = complementTargetId;
    setRecordingState('processing');
    let audioRef: { blob: Blob; mimeType: string; durationSec: number } | null = null;

    try {
      audioRef = await recorderRef.current.stop();
      const currentTemplates = await ensureDefaultTemplates();

      if (activeComplementId) {
        if (!navigator.onLine || !settings.geminiApiKey.trim()) {
          audioRef = null;
          showToast(
            'warning',
            !settings.geminiApiKey.trim()
              ? 'Configure sua Gemini API Key para complementar por voz.'
              : 'Sem conexão para complementar por voz agora.',
          );
          return;
        }

        const targetEv = await db.evolutions.get(activeComplementId);
        if (!targetEv) {
          audioRef = null;
          showToast('error', 'Evolução original não encontrada.');
          return;
        }

        const tpl =
          currentTemplates.find((t) => t.id === targetEv.templateId) ??
          currentTemplates[0];
        const audioBase64 = await blobToBase64(audioRef.blob);
        const complemented = await complementEvolutionWithAudio({
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          audioBase64,
          mimeType: audioRef.mimeType,
          existingText: targetEv.renderedText,
          template: tpl,
        });
        audioRef = null;

        const renderedText = renderEvolutionBlocks(tpl, complemented.blocksContent);
        const nowIso = new Date().toISOString();
        const updated: Evolution = {
          ...targetEv,
          patientLabel: complemented.patientLabel || targetEv.patientLabel,
          blocksContent: complemented.blocksContent,
          renderedText,
          audioPurgedAt: nowIso,
          updatedAt: nowIso,
          syncedToCloud: false,
        };
        await db.evolutions.put(updated);
        await refreshLocalState();
        // Sync assíncrono em background (texto aparece imediatamente na tela)
        void syncEvolutionIfConnected(updated);
        showToast('success', 'Evolução complementada por voz.');
        return;
      }

      if (!navigator.onLine || !settings.geminiApiKey.trim()) {
        await enqueueOfflineAudio({
          audioBlob: audioRef.blob,
          mimeType: audioRef.mimeType,
          durationSec: audioRef.durationSec,
          lockedTemplateId,
        });
        audioRef = null;
        await refreshLocalState();
        showToast(
          'warning',
          !settings.geminiApiKey.trim()
            ? 'Áudio salvo na fila. Configure sua Gemini API Key para processar.'
            : 'Sem conexão. Áudio retido na fila offline.',
        );
        return;
      }

      const audioBase64 = await blobToBase64(audioRef.blob);
      const result = await processClinicalAudioWithGemini({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        audioBase64,
        mimeType: audioRef.mimeType,
        templates: currentTemplates,
        lockedTemplateId,
      });

      audioRef = null;

      const evolution = buildEvolutionFromGemini(result, currentTemplates, 24 * 3650);
      await db.evolutions.put(evolution);
      setActiveEvolutionId(evolution.id);
      await refreshLocalState();
      // Sync assíncrono em background (mostra o texto pronto imediatamente sem esperar o Supabase)
      void syncEvolutionIfConnected(evolution);
      showToast('success', 'Evolução pronta • áudio destruído.');
    } catch (err) {
      if (audioRef && !activeComplementId) {
        await enqueueOfflineAudio({
          audioBlob: audioRef.blob,
          mimeType: audioRef.mimeType,
          durationSec: audioRef.durationSec,
          lockedTemplateId,
        });
        audioRef = null;
        await refreshLocalState();
      }
      showToast(
        'error',
        err instanceof Error
          ? activeComplementId
            ? `Erro ao complementar: ${err.message}`
            : `Salvo na fila offline: ${err.message}`
          : 'Erro ao processar áudio.',
      );
    } finally {
      setComplementTargetId(null);
      setRecordingSeconds(0);
      setRecordingState('idle');
    }
  }, [
    recordingState,
    complementTargetId,
    settings,
    lockedTemplateId,
    refreshLocalState,
    syncEvolutionIfConnected,
    showToast,
  ]);

  const updateEvolutionBlock = useCallback(
    async (evolutionId: string, blockId: string, content: string) => {
      const ev = await db.evolutions.get(evolutionId);
      if (!ev) return;
      const tpl = templates.find((t) => t.id === ev.templateId) ?? templates[0];
      const nextBlocks = filterNonEmptyBlocks({
        ...ev.blocksContent,
        [blockId]: content,
      });
      const renderedText = tpl
        ? renderEvolutionBlocks(tpl, nextBlocks)
        : Object.values(nextBlocks).join('\n\n');

      const updated: Evolution = {
        ...ev,
        blocksContent: nextBlocks,
        renderedText,
        updatedAt: new Date().toISOString(),
        syncedToCloud: false,
      };
      await db.evolutions.put(updated);
      await refreshLocalState();
      void syncEvolutionIfConnected(updated);
    },
    [templates, refreshLocalState, syncEvolutionIfConnected],
  );

  const updateEvolutionRawText = useCallback(
    async (evolutionId: string, renderedText: string) => {
      const ev = await db.evolutions.get(evolutionId);
      if (!ev) return;
      const updated: Evolution = {
        ...ev,
        renderedText,
        updatedAt: new Date().toISOString(),
        syncedToCloud: false,
      };
      await db.evolutions.put(updated);
      await refreshLocalState();
      void syncEvolutionIfConnected(updated);
    },
    [refreshLocalState, syncEvolutionIfConnected],
  );

  const switchEvolutionTemplate = useCallback(
    async (evolutionId: string, targetTemplateId: string) => {
      const ev = await db.evolutions.get(evolutionId);
      const target = templates.find((t) => t.id === targetTemplateId);
      if (!ev || !target) return;

      setIsReformatting(true);
      try {
        const reformatted = await reformatEvolutionToTemplate({
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          currentText: ev.renderedText,
          targetTemplate: target,
        });

        const renderedText = renderEvolutionBlocks(target, reformatted.blocksContent);
        const updated: Evolution = {
          ...ev,
          templateId: target.id,
          templateName: target.name,
          selectionMode: 'manual',
          blocksContent: reformatted.blocksContent,
          renderedText,
          updatedAt: new Date().toISOString(),
          syncedToCloud: false,
        };
        await db.evolutions.put(updated);
        await refreshLocalState();
        void syncEvolutionIfConnected(updated);
        showToast('success', `Reformatado para ${target.name}.`);
      } catch (err) {
        showToast(
          'error',
          err instanceof Error ? err.message : 'Falha ao trocar template.',
        );
      } finally {
        setIsReformatting(false);
      }
    },
    [templates, settings, refreshLocalState, syncEvolutionIfConnected, showToast],
  );

  const deleteEvolution = useCallback(
    async (evolutionId: string) => {
      await db.evolutions.delete(evolutionId);
      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
      if (client) {
        await deleteEvolutionFromCloud(client, evolutionId).catch(() => {});
      }
      await refreshLocalState();
    },
    [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState],
  );

  const clearShiftHistory = useCallback(async () => {
    await db.evolutions.clear();
    await purgeAllQueuedAudios();
    const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
    if (client) {
      await clearAllCloudEvolutions(client).catch(() => {});
    }
    setActiveEvolutionId(null);
    await refreshLocalState();
    showToast('success', 'Histórico do plantão limpo.');
  }, [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState, showToast]);

  const saveTemplate = useCallback(
    async (template: ClinicalTemplate) => {
      const updated: ClinicalTemplate = {
        ...template,
        updatedAt: new Date().toISOString(),
      };
      await db.templates.put(updated);

      const affected = await db.evolutions
        .where('templateId')
        .equals(updated.id)
        .toArray();
      for (const ev of affected) {
        const nextText = renderEvolutionBlocks(updated, ev.blocksContent);
        await db.evolutions.update(ev.id, {
          templateName: updated.name,
          renderedText: nextText,
        });
      }

      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
      if (client) {
        await upsertTemplateToCloud(client, updated).catch(() => {});
      }

      await refreshLocalState();
      showToast('success', `Template "${updated.name}" salvo.`);
    },
    [settings.supabaseUrl, settings.supabaseAnonKey, refreshLocalState, showToast],
  );

  const removeTemplate = useCallback(
    async (templateId: string) => {
      await db.templates.delete(templateId);
      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
      if (client) {
        await deleteTemplateFromCloud(client, templateId).catch(() => {});
      }
      if (lockedTemplateId === templateId) {
        setLockedTemplateId(null);
      }
      await refreshLocalState();
      showToast('info', 'Template removido.');
    },
    [settings.supabaseUrl, settings.supabaseAnonKey, lockedTemplateId, refreshLocalState, showToast],
  );

  const deleteQueuedAudio = useCallback(
    async (jobId: string) => {
      await db.pendingAudioQueue.delete(jobId);
      await refreshLocalState();
      showToast('info', 'Áudio pendente descartado.');
    },
    [refreshLocalState, showToast],
  );

  const activeEvolution =
    evolutions.find((e) => e.id === activeEvolutionId) ?? null;

  return {
    templates,
    evolutions,
    activeEvolution,
    activeEvolutionId,
    setActiveEvolutionId,
    lockedTemplateId,
    setLockedTemplateId,
    pendingQueue,
    recordingState,
    recordingSeconds,
    complementTargetId,
    analyser: recorderRef.current?.getAnalyser() ?? null,
    isOnline,
    isReformatting,
    isCloudConnected,
    toast,
    showToast,
    startRecording,
    startComplementRecording,
    cancelRecording,
    stopAndProcessRecording,
    flushOfflineQueue,
    deleteQueuedAudio,
    updateEvolutionBlock,
    updateEvolutionRawText,
    switchEvolutionTemplate,
    deleteEvolution,
    clearShiftHistory,
    saveTemplate,
    removeTemplate,
    syncNowFromCloud,
  };
}
