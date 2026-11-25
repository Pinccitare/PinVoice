import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { ClinicalTemplate, Evolution } from '../types/clinical';

export const PERSONAL_USER_ID = '00000000-0000-0000-0000-000000000001';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getSupabaseClient(
  url: string,
  anonKey: string,
): SupabaseClient | null {
  const cleanUrl = url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey) return null;

  const signature = `${cleanUrl}::${cleanKey}`;
  if (cachedClient && cachedKey === signature) {
    return cachedClient;
  }

  cachedClient = createClient(cleanUrl, cleanKey);
  cachedKey = signature;
  return cachedClient;
}

interface EvolutionRow {
  id: string;
  user_id?: string;
  template_id: string;
  template_name: string;
  selection_mode: 'manual' | 'voice' | 'auto';
  patient_label: string;
  blocks_content: Record<string, string>;
  rendered_text: string;
  copilot?: Evolution['copilot'];
  source_device: Evolution['sourceDevice'];
  audio_purged_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  voice_triggers: string[];
  clinical_keywords: string[];
  blocks: ClinicalTemplate['blocks'];
  is_default: boolean;
  updated_at: string;
}

function rowToEvolution(row: EvolutionRow): Evolution {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    selectionMode: row.selection_mode,
    patientLabel: row.patient_label ?? '',
    blocksContent: row.blocks_content ?? {},
    renderedText: row.rendered_text ?? '',
    copilot: row.copilot ?? { pendencies: [], alerts: [], medications: [], exams: [] },
    sourceDevice: row.source_device ?? 'web',
    audioPurgedAt: row.audio_purged_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedToCloud: true,
  };
}

function rowToTemplate(row: TemplateRow): ClinicalTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    voiceTriggers: row.voice_triggers ?? [],
    clinicalKeywords: row.clinical_keywords ?? [],
    blocks: row.blocks ?? [],
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  };
}

export async function upsertEvolutionToCloud(
  client: SupabaseClient,
  evolution: Evolution,
): Promise<void> {
  const { error } = await client.from('evolutions').upsert({
    id: evolution.id,
    user_id: PERSONAL_USER_ID,
    template_id: evolution.templateId,
    template_name: evolution.templateName,
    selection_mode: evolution.selectionMode,
    patient_label: evolution.patientLabel,
    blocks_content: evolution.blocksContent,
    rendered_text: evolution.renderedText,
    source_device: evolution.sourceDevice,
    audio_purged_at: evolution.audioPurgedAt,
    expires_at: evolution.expiresAt,
    created_at: evolution.createdAt,
    updated_at: evolution.updatedAt,
  });
  if (error) throw new Error(error.message);
}

export async function deleteEvolutionFromCloud(
  client: SupabaseClient,
  evolutionId: string,
): Promise<void> {
  const { error } = await client.from('evolutions').delete().eq('id', evolutionId);
  if (error) throw new Error(error.message);
}

export async function clearAllCloudEvolutions(
  client: SupabaseClient,
): Promise<void> {
  const { error } = await client
    .from('evolutions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(error.message);
}

export async function fetchCloudEvolutions(
  client: SupabaseClient,
): Promise<Evolution[]> {
  const { data, error } = await client
    .from('evolutions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150);

  if (error) throw new Error(error.message);
  return (data as EvolutionRow[]).map(rowToEvolution);
}

export async function upsertTemplateToCloud(
  client: SupabaseClient,
  template: ClinicalTemplate,
): Promise<void> {
  const { error } = await client.from('templates').upsert({
    id: template.id,
    user_id: PERSONAL_USER_ID,
    name: template.name,
    description: template.description,
    voice_triggers: template.voiceTriggers,
    clinical_keywords: template.clinicalKeywords,
    blocks: template.blocks,
    is_default: template.isDefault,
    updated_at: template.updatedAt,
  });
  if (error) throw new Error(error.message);
}

export async function deleteTemplateFromCloud(
  client: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { error } = await client
    .from('templates')
    .delete()
    .eq('id', templateId);
  if (error) throw new Error(error.message);
}

export async function fetchCloudTemplates(
  client: SupabaseClient,
): Promise<ClinicalTemplate[]> {
  const { data, error } = await client.from('templates').select('*');
  if (error) throw new Error(error.message);
  return (data as TemplateRow[]).map(rowToTemplate);
}

export function subscribePinVoiceRealtime(
  client: SupabaseClient,
  callbacks: {
    onEvolutionUpsert: (ev: Evolution) => void;
    onEvolutionDelete: (id: string) => void;
    onTemplateUpsert: (tpl: ClinicalTemplate) => void;
    onTemplateDelete: (id: string) => void;
  },
): RealtimeChannel {
  return client
    .channel('pinvoice-personal-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'evolutions' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as { id?: string };
          if (oldRow?.id) callbacks.onEvolutionDelete(oldRow.id);
        } else if (payload.new) {
          callbacks.onEvolutionUpsert(rowToEvolution(payload.new as EvolutionRow));
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'templates' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as { id?: string };
          if (oldRow?.id) callbacks.onTemplateDelete(oldRow.id);
        } else if (payload.new) {
          callbacks.onTemplateUpsert(rowToTemplate(payload.new as TemplateRow));
        }
      },
    )
    .subscribe();
}
