export type SelectionMode = 'manual' | 'voice' | 'auto';
export type SourceDevice = 'web' | 'android' | 'wear';

export interface TemplateBlock {
  id: string;
  title: string;
  hint: string;
  enabled: boolean;
}

export interface ClinicalTemplate {
  id: string;
  name: string;
  description: string;
  /** Diretriz de estilo para a IA (ex.: detalhado cronológico vs direto/objetivo vs SOAP) */
  styleInstruction?: string;
  voiceTriggers: string[];
  clinicalKeywords: string[];
  blocks: TemplateBlock[];
  isDefault: boolean;
  updatedAt: string;
}

export interface CopilotData {
  pendencies: string[];
  alerts: string[];
  medications: string[];
  exams: string[];
}

export interface Evolution {
  id: string;
  templateId: string;
  templateName: string;
  selectionMode: SelectionMode;
  patientLabel: string;
  /** Mapa { [blockId]: string } contendo apenas blocos preenchidos */
  blocksContent: Record<string, string>;
  renderedText: string;
  copilot: CopilotData;
  sourceDevice: SourceDevice;
  audioPurgedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  syncedToCloud: boolean;
}

export interface PendingAudioJob {
  id: string;
  audioBlob: Blob;
  mimeType: string;
  durationSec: number;
  lockedTemplateId: string | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  status: 'queued' | 'processing' | 'failed';
}

export type ThemeMode = 'dark' | 'light';

export interface PinVoiceSettings {
  geminiApiKey: string;
  geminiModel: string;
  hospubAsciiMode: boolean;
  ttlHours: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  theme: ThemeMode;
}
