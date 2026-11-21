import { AppSettings, ModelOption, WhisperModelOption } from '../types/index.ts';

export function resolveActiveLlm(models: ModelOption[], activeLlmId: string): ModelOption {
  return models.find(m => m.id === activeLlmId) || models[0];
}

export function resolveActiveWhisper(
  models: WhisperModelOption[],
  activeWhisperId: string
): WhisperModelOption {
  return models.find(m => m.id === activeWhisperId) || models[0];
}

export function markItemDownloaded<T extends { id: string; isDownloaded?: boolean }>(
  items: T[],
  id: string
): T[] {
  return items.map(item => (item.id === id ? { ...item, isDownloaded: true } : item));
}

export function applySettingsPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return { ...current, ...patch };
}
