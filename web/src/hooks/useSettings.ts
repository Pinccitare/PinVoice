import { useCallback, useState } from 'react';
import type { PinVoiceSettings } from '../types/clinical';

const STORAGE_KEY = 'pinvoice_settings_v1';

const DEFAULT_SETTINGS: PinVoiceSettings = {
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  geminiModel: 'gemini-3.5-flash-lite',
  hospubAsciiMode: false,
  ttlHours: 24,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  theme: 'dark',
};

function loadInitialSettings(): PinVoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PinVoiceSettings>;
    const migratedModel =
      !parsed.geminiModel || parsed.geminiModel === 'gemini-2.5-flash'
        ? DEFAULT_SETTINGS.geminiModel
        : parsed.geminiModel;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      geminiModel: migratedModel,
      geminiApiKey: parsed.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey,
      supabaseUrl: parsed.supabaseUrl || DEFAULT_SETTINGS.supabaseUrl,
      supabaseAnonKey: parsed.supabaseAnonKey || DEFAULT_SETTINGS.supabaseAnonKey,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<PinVoiceSettings>(loadInitialSettings);

  const updateSettings = useCallback((patch: Partial<PinVoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignora erro de quota do storage
      }
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
