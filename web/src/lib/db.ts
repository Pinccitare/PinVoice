import Dexie, { type Table } from 'dexie';
import type {
  ClinicalTemplate,
  Evolution,
  PendingAudioJob,
} from '../types/clinical';
import {
  cloneDefaultTemplates,
  DEFAULT_TEMPLATES_VERSION,
} from '../data/defaultTemplates';

const TEMPLATES_VERSION_KEY = 'pinvoice_default_templates_version';

export class PinVoiceDatabase extends Dexie {
  templates!: Table<ClinicalTemplate, string>;
  evolutions!: Table<Evolution, string>;
  pendingAudioQueue!: Table<PendingAudioJob, string>;

  constructor() {
    super('PinVoiceDB');
    this.version(1).stores({
      templates: 'id, name, isDefault, updatedAt',
      evolutions: 'id, createdAt, expiresAt, templateId, syncedToCloud',
      pendingAudioQueue: 'id, status, createdAt',
    });
  }
}

export const db = new PinVoiceDatabase();

export async function ensureDefaultTemplates(): Promise<ClinicalTemplate[]> {
  const existing = await db.templates.toArray();
  const storedVer =
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem(TEMPLATES_VERSION_KEY) || '0')
      : DEFAULT_TEMPLATES_VERSION;

  if (existing.length === 0 || storedVer < DEFAULT_TEMPLATES_VERSION) {
    const defaults = cloneDefaultTemplates();
    await db.templates.bulkPut(defaults);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TEMPLATES_VERSION_KEY, String(DEFAULT_TEMPLATES_VERSION));
    }
    return db.templates.toArray();
  }
  return existing;
}

export async function purgeExpiredLocalEvolutions(): Promise<number> {
  const nowIso = new Date().toISOString();
  const expired = await db.evolutions
    .where('expiresAt')
    .belowOrEqual(nowIso)
    .toArray();

  if (expired.length === 0) return 0;
  await db.evolutions.bulkDelete(expired.map((e) => e.id));
  return expired.length;
}
