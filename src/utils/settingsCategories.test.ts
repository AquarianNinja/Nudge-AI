import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVAILABLE_MODELS,
  DEFAULT_APP_SETTINGS,
  INITIAL_DICTIONARY_ENTRIES,
  WHISPER_MODELS
} from '../data/mockData.ts';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_GROUPS,
  buildSettingsCategorySummaries,
  getSettingsCategoryMeta,
  resolveInitialSettingsCategory
} from './settingsCategories.ts';

describe('settingsCategories', () => {
  it('groups all settings categories uniquely across groups', () => {
    const groupedIds = SETTINGS_CATEGORY_GROUPS.flatMap(g => g.categoryIds);
    assert.equal(groupedIds.length, SETTINGS_CATEGORIES.length);
    assert.equal(new Set(groupedIds).size, SETTINGS_CATEGORIES.length);
  });

  it('defaults to null (categories overview) unless deep-linked to a valid category', () => {
    assert.equal(resolveInitialSettingsCategory(null), null);
    assert.equal(resolveInitialSettingsCategory(undefined), null);
    assert.equal(resolveInitialSettingsCategory('callsigns'), 'callsigns');
    assert.equal(resolveInitialSettingsCategory('voice'), 'voice');
    assert.equal(resolveInitialSettingsCategory('system'), 'system');
  });

  it('returns metadata for any category ID', () => {
    const speech = getSettingsCategoryMeta('speech');
    assert.equal(speech.title, 'Speech & Live');
    assert.equal(speech.group, 'intelligence');
  });

  it('builds dynamic summaries reflecting motion preset, haptics state, offline mode, and counts', () => {
    const summaries = buildSettingsCategorySummaries({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        motionIntensity: 'fluid',
        offlineOnly: true,
        haptics: {
          ...DEFAULT_APP_SETTINGS.haptics,
          enabled: false
        }
      },
      llmModels: AVAILABLE_MODELS,
      whisperModels: WHISPER_MODELS,
      driveFiles: [],
      dictionaryEntries: INITIAL_DICTIONARY_ENTRIES,
      liveProviderLabel: 'WhisperKit Local',
      isDeviceFrame: true,
      activeCallsignLabel: 'Field Ops',
      callsignCount: 2
    });

    assert.equal(summaries.callsigns.trailingLabel, '2');
    assert.match(summaries.callsigns.primarySummary, /Field Ops/);
    assert.equal(summaries.models.trailingLabel, 'Local');
    assert.equal(summaries.haptics.trailingLabel, 'Off');
    assert.match(summaries.haptics.primarySummary, /Muted/);
    assert.equal(summaries.drive.trailingLabel, '0');
    assert.match(summaries.drive.primarySummary, /No recordings/);
    assert.equal(summaries.dictionary.trailingLabel, String(INITIAL_DICTIONARY_ENTRIES.length));
    assert.match(summaries.system.primarySummary, /Fluid motion/);
    assert.match(summaries.system.primarySummary, /Air-Gap Offline/);
    assert.match(summaries.system.primarySummary, /iPhone frame/);
  });
});
