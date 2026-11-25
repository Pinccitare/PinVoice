import type {
  ClinicalTemplate,
  Evolution,
  PendingAudioJob,
  PinVoiceSettings,
} from '../types/clinical';
import { db } from './db';
import { blobToBase64 } from './audioRecorder';
import {
  processClinicalAudioWithGemini,
  type GeminiClinicalResponse,
} from './geminiClient';
import { renderEvolutionBlocks } from './renderer';

export type GeminiAudioProcessor = (params: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
  templates: ClinicalTemplate[];
  lockedTemplateId: string | null;
}) => Promise<GeminiClinicalResponse>;

export interface EnqueueAudioParams {
  audioBlob: Blob;
  mimeType: string;
  durationSec: number;
  lockedTemplateId: string | null;
}

export async function enqueueOfflineAudio(
  params: EnqueueAudioParams,
): Promise<PendingAudioJob> {
  const job: PendingAudioJob = {
    id: crypto.randomUUID(),
    audioBlob: params.audioBlob,
    mimeType: params.mimeType,
    durationSec: params.durationSec,
    lockedTemplateId: params.lockedTemplateId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: 'queued',
  };
  await db.pendingAudioQueue.put(job);
  return job;
}

export function buildEvolutionFromGemini(
  result: GeminiClinicalResponse,
  templates: ClinicalTemplate[],
  ttlHours: number,
): Evolution {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1, ttlHours) * 3600 * 1000);
  const template =
    templates.find((t) => t.id === result.selectedTemplateId) ?? templates[0];

  const renderedText = renderEvolutionBlocks(template, result.blocksContent);

  return {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateName: template.name,
    selectionMode: result.selectionMode,
    patientLabel: result.patientLabel,
    blocksContent: result.blocksContent,
    renderedText,
    copilot: result.copilot,
    sourceDevice: 'web',
    audioPurgedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    syncedToCloud: false,
  };
}

/**
 * Processa um único job da fila offline:
 * - Chama Gemini API diretamente
 * - Em HTTP 200: salva o texto da evolução e DESTRÓI imediatamente o áudio do IndexedDB
 * - Em erro: marca como failed/queued mantendo o áudio seguro até reconectar
 */
export async function processQueuedJob(
  jobId: string,
  templates: ClinicalTemplate[],
  settings: PinVoiceSettings,
  processor: GeminiAudioProcessor = processClinicalAudioWithGemini,
): Promise<Evolution> {
  const job = await db.pendingAudioQueue.get(jobId);
  if (!job) {
    throw new Error('Áudio pendente não encontrado na fila.');
  }

  await db.pendingAudioQueue.update(jobId, {
    status: 'processing',
    attempts: job.attempts + 1,
    lastError: null,
  });

  try {
    const audioBase64 = await blobToBase64(job.audioBlob);
    const result = await processor({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      audioBase64,
      mimeType: job.mimeType,
      templates,
      lockedTemplateId: job.lockedTemplateId,
    });

    const evolution = buildEvolutionFromGemini(result, templates, settings.ttlHours);
    await db.evolutions.put(evolution);

    // Gatilho 1 — Destruição Imediata Pós-Processamento (HTTP 200)
    await db.pendingAudioQueue.delete(jobId);

    return evolution;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao processar áudio.';
    await db.pendingAudioQueue.update(jobId, {
      status: 'failed',
      lastError: message,
    });
    throw err;
  }
}

/**
 * Gatilho 2 — Varredura de Segurança na Abertura / Nova Gravação:
 * Remove resíduos órfãos ou jobs expirados (> 24h) mantendo intactos
 * áudios legítimos retidos na fila offline recente.
 */
export async function purgeResidualAudios(maxAgeHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000).toISOString();
  const stale = await db.pendingAudioQueue
    .where('createdAt')
    .below(cutoff)
    .toArray();

  if (stale.length > 0) {
    await db.pendingAudioQueue.bulkDelete(stale.map((j) => j.id));
  }
  return stale.length;
}

/**
 * Destruição manual imediata de todos os áudios pendentes (limpeza de emergência / LGPD).
 */
export async function purgeAllQueuedAudios(): Promise<void> {
  await db.pendingAudioQueue.clear();
}
