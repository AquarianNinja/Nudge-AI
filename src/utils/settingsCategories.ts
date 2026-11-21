import type {
  AppSettings,
  DictionaryEntry,
  DriveAudioFile,
  ModelOption,
  SettingsCategoryId,
  WhisperModelOption
} from '../types/index.ts';
import { getDriveStorageSummary } from './audioDrive.ts';
import { HAPTIC_PROFILES } from './haptics.ts';
import { MOTION_INTENSITY_OPTIONS } from './motion.ts';
import { PAID_PROVIDERS, countConfiguredApiKeys } from './providerRouting.ts';

export type SettingsCategoryGroupId = 'intelligence' | 'personalization' | 'system';

export interface SettingsCategoryMeta {
  id: SettingsCategoryId;
  group: SettingsCategoryGroupId;
  title: string;
  description: string;
  accentClass: string;
}

export interface SettingsCategoryGroup {
  id: SettingsCategoryGroupId;
  label: string;
  categoryIds: readonly SettingsCategoryId[];
}

export interface SettingsCategorySummary {
  id: SettingsCategoryId;
  primarySummary: string;
  trailingLabel: string;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategoryMeta[] = [
  {
    id: 'callsigns',
    group: 'personalization',
    title: 'Callsign & Identity',
    description: 'Create display Callsigns and inspect your immutable backend User ID',
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#2B98FF]/30'
  },
  {
    id: 'models',
    group: 'intelligence',
    title: 'Models & Routing',
    description: 'Local LLM, Whisper weights, and per-activity cloud or offline pipelines',
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#2B98FF]/30'
  },
  {
    id: 'speech',
    group: 'intelligence',
    title: 'Speech & Live',
    description: 'Real-time streaming ASR providers, language, speaker diarization & TTS',
    accentClass: 'bg-cyan-500/18 text-cyan-300 border-cyan-400/30'
  },
  {
    id: 'voice',
    group: 'personalization',
    title: 'Voice Profile',
    description: 'Personal voice training samples and open-source cloud voice mods',
    accentClass: 'bg-violet-500/18 text-violet-300 border-violet-400/30'
  },
  {
    id: 'haptics',
    group: 'personalization',
    title: 'Haptics',
    description: 'Tactile feedback profiles, intensity scaling & interaction triggers',
    accentClass: 'bg-amber-500/18 text-amber-300 border-amber-400/30'
  },
  {
    id: 'dictionary',
    group: 'personalization',
    title: 'Dictionary',
    description: 'Domain glossary, auto-learned vocabulary & keyterm boosts',
    accentClass: 'bg-emerald-500/18 text-emerald-300 border-emerald-400/30'
  },
  {
    id: 'drive',
    group: 'personalization',
    title: 'Drive',
    description: 'Recorded audio vault, imported clips & storage management',
    accentClass: 'bg-sky-500/18 text-sky-300 border-sky-400/30'
  },
  {
    id: 'system',
    group: 'system',
    title: 'Keys & System',
    description: 'Paid API keys, Motion Intensity, Air-Gap mode & device diagnostics',
    accentClass: 'bg-white/10 text-zinc-200 border-white/20'
  }
] as const;

export const SETTINGS_CATEGORY_GROUPS: readonly SettingsCategoryGroup[] = [
  {
    id: 'intelligence',
    label: 'Intelligence & Audio',
    categoryIds: ['models', 'speech']
  },
  {
    id: 'personalization',
    label: 'Identity, Personalization & Vault',
    categoryIds: ['callsigns', 'voice', 'haptics', 'dictionary', 'drive']
  },
  {
    id: 'system',
    label: 'Keys & System',
    categoryIds: ['system']
  }
] as const;

export function getSettingsCategoryMeta(id: SettingsCategoryId): SettingsCategoryMeta {
  return SETTINGS_CATEGORIES.find(c => c.id === id) || SETTINGS_CATEGORIES[0];
}

export function resolveInitialSettingsCategory(
  requestedBucket?: SettingsCategoryId | null
): SettingsCategoryId | null {
  if (!requestedBucket) return null;
  return SETTINGS_CATEGORIES.some(c => c.id === requestedBucket) ? requestedBucket : null;
}

export function buildSettingsCategorySummaries(params: {
  settings: AppSettings;
  llmModels: readonly ModelOption[];
  whisperModels: readonly WhisperModelOption[];
  driveFiles: readonly DriveAudioFile[];
  dictionaryEntries: readonly DictionaryEntry[];
  liveProviderLabel: string;
  isDeviceFrame: boolean;
  activeCallsignLabel?: string;
  callsignCount?: number;
}): Record<SettingsCategoryId, SettingsCategorySummary> {
  const {
    settings,
    llmModels,
    whisperModels,
    driveFiles,
    dictionaryEntries,
    liveProviderLabel,
    isDeviceFrame,
    activeCallsignLabel,
    callsignCount = 0
  } = params;

  const activeLlm = llmModels.find(m => m.id === settings.activeLlmId) || llmModels[0];
  const activeWhisper =
    whisperModels.find(m => m.id === settings.activeWhisperId) || whisperModels[0];
  const driveSummary = getDriveStorageSummary([...driveFiles]);
  const configuredKeyCount = countConfiguredApiKeys(settings);
  const isHapticsActive = settings.hapticFeedback && settings.haptics.enabled;
  const activeHapticProfile =
    HAPTIC_PROFILES.find(p => p.id === settings.haptics.profile) || HAPTIC_PROFILES[0];
  const activeMotionOption =
    MOTION_INTENSITY_OPTIONS.find(o => o.id === settings.motionIntensity) ||
    MOTION_INTENSITY_OPTIONS[1];

  const voiceReady = settings.voiceProfile.personalProfile.status === 'ready';
  const voiceSummary =
    settings.voiceProfile.activeMode === 'open-source-mod'
      ? `Open-source mod · ${settings.voiceProfile.openSourceModId}`
      : voiceReady
        ? 'Personal voice clone trained'
        : `${settings.voiceProfile.personalProfile.samplesCompleted}/${settings.voiceProfile.personalProfile.totalSamples} calibration samples`;

  return {
    callsigns: {
      id: 'callsigns',
      primarySummary: activeCallsignLabel
        ? `Active: ${activeCallsignLabel} · ${callsignCount} ${callsignCount === 1 ? 'Callsign' : 'Callsigns'}`
        : 'Create display Callsigns & view immutable User ID',
      trailingLabel: `${callsignCount}`
    },
    models: {
      id: 'models',
      primarySummary: `${activeLlm?.name || 'Local LLM'} · ${activeWhisper?.name || 'Whisper'}`,
      trailingLabel: settings.offlineOnly ? 'Local' : 'Hybrid'
    },
    speech: {
      id: 'speech',
      primarySummary: `${liveProviderLabel} · ${settings.language}`,
      trailingLabel: settings.diarization ? 'Diarization On' : 'Single Speaker'
    },
    voice: {
      id: 'voice',
      primarySummary: voiceSummary,
      trailingLabel: voiceReady
        ? 'Trained'
        : `${settings.voiceProfile.personalProfile.samplesCompleted}/3`
    },
    haptics: {
      id: 'haptics',
      primarySummary: isHapticsActive
        ? `${activeHapticProfile.name} · ${settings.haptics.intensity} intensity`
        : 'Muted across all interactions',
      trailingLabel: isHapticsActive ? activeHapticProfile.name : 'Off'
    },
    dictionary: {
      id: 'dictionary',
      primarySummary: `${dictionaryEntries.length} domain terms · ${
        settings.autoLearnDictionary ? 'Auto-learn on' : 'Manual'
      }`,
      trailingLabel: `${dictionaryEntries.length}`
    },
    drive: {
      id: 'drive',
      primarySummary:
        driveSummary.count === 0
          ? 'No recordings stored'
          : `${driveSummary.count} ${driveSummary.count === 1 ? 'file' : 'files'} · ${driveSummary.totalSizeLabel}`,
      trailingLabel: `${driveSummary.count}`
    },
    system: {
      id: 'system',
      primarySummary: `${activeMotionOption.label} motion · ${
        settings.offlineOnly ? 'Air-Gap Offline' : 'Hybrid'
      } · ${isDeviceFrame ? 'iPhone frame' : 'Expanded'}`,
      trailingLabel: `${configuredKeyCount}/${PAID_PROVIDERS.length} keys`
    }
  };
}
