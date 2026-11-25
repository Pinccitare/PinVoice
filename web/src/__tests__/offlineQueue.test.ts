import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates';
import { isRecordingTooShort } from '../lib/audioRecorder';
import { db } from '../lib/db';
import {
  enqueueOfflineAudio,
  processQueuedJob,
  purgeResidualAudios,
} from '../lib/offlineQueue';
import type { PinVoiceSettings } from '../types/clinical';

const MOCK_SETTINGS: PinVoiceSettings = {
  geminiApiKey: 'test-key',
  geminiModel: 'gemini-3.5-flash-lite',
  hospubAsciiMode: false,
  ttlHours: 24,
  supabaseUrl: '',
  supabaseAnonKey: '',
  theme: 'dark',
};

describe('offlineQueue — fila resiliente e destruição efêmera do áudio', () => {
  beforeEach(async () => {
    await db.pendingAudioQueue.clear();
    await db.evolutions.clear();
  });

  it('destrói imediatamente o áudio do IndexedDB após HTTP 200 e salva o texto', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const job = await enqueueOfflineAudio({
      audioBlob: blob,
      mimeType: 'audio/webm',
      durationSec: 12,
      lockedTemplateId: null,
    });

    expect(await db.pendingAudioQueue.count()).toBe(1);

    const evolution = await processQueuedJob(
      job.id,
      DEFAULT_TEMPLATES,
      MOCK_SETTINGS,
      async () => ({
        selectedTemplateId: 'ps',
        selectionMode: 'auto',
        patientLabel: 'Carlos - Box 2',
        blocksContent: {
          cabecalho: 'Carlos, 45 anos, sexo masculino.\nDIH: 24/11/2026',
          condutas: 'Manejo SCA: AAS 200mg VO; ECG + troponina seriada.',
          pendencias: '- Checar troponina em 1h',
        },
        copilot: {
          pendencies: [],
          alerts: [],
          medications: [],
          exams: [],
        },
      }),
    );

    // Áudio destruído imediatamente
    expect(await db.pendingAudioQueue.count()).toBe(0);
    // Evolução salva e sem blocos vazios
    expect(await db.evolutions.count()).toBe(1);
    expect(evolution.audioPurgedAt).toBeTruthy();
    expect(evolution.renderedText).toContain('EVOLUÇÃO MÉDICA HOSPITALAR\nCarlos');
    expect(evolution.renderedText).toContain('PENDÊNCIAS\n- Checar troponina em 1h');
    expect(evolution.renderedText).not.toContain('EXAME FÍSICO');
  });

  it('retém áudio na fila em caso de falha de rede para retry posterior', async () => {
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/webm' });
    const job = await enqueueOfflineAudio({
      audioBlob: blob,
      mimeType: 'audio/webm',
      durationSec: 5,
      lockedTemplateId: 'uti',
    });

    await expect(
      processQueuedJob(job.id, DEFAULT_TEMPLATES, MOCK_SETTINGS, async () => {
        throw new Error('Network offline');
      }),
    ).rejects.toThrow('Network offline');

    const stored = await db.pendingAudioQueue.get(job.id);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe('failed');
    expect(stored?.lastError).toBe('Network offline');
  });

  it('purgeResidualAudios remove áudios antigos expirados', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' });
    await db.pendingAudioQueue.put({
      id: 'stale-job',
      audioBlob: blob,
      mimeType: 'audio/webm',
      durationSec: 3,
      lockedTemplateId: null,
      createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      attempts: 1,
      lastError: null,
      status: 'failed',
    });

    const removed = await purgeResidualAudios(24);
    expect(removed).toBe(1);
    expect(await db.pendingAudioQueue.count()).toBe(0);
  });

  it('descarta áudios menores de 3,5 segundos como erro', () => {
    expect(isRecordingTooShort(0)).toBe(true);
    expect(isRecordingTooShort(3499)).toBe(true);
    expect(isRecordingTooShort(3500)).toBe(false);
    expect(isRecordingTooShort(5200)).toBe(false);
  });
});
