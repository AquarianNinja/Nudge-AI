import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySettingsPatch,
  markItemDownloaded,
  resolveActiveLlm,
  resolveActiveWhisper
} from './modelCatalog.ts';
import { AVAILABLE_MODELS, DEFAULT_APP_SETTINGS, WHISPER_MODELS } from '../data/mockData.ts';

test('resolveActiveLlm returns matching model or falls back to first', () => {
  const picked = resolveActiveLlm(AVAILABLE_MODELS, 'mistral-7b-v03-q4');
  assert.equal(picked.id, 'mistral-7b-v03-q4');
  assert.equal(picked.name, 'Mistral 7B v0.3');

  const fallback = resolveActiveLlm(AVAILABLE_MODELS, 'non-existent');
  assert.equal(fallback.id, AVAILABLE_MODELS[0].id);
});

test('resolveActiveWhisper returns matching speech model or falls back to first', () => {
  const picked = resolveActiveWhisper(WHISPER_MODELS, 'whisper-base-en');
  assert.equal(picked.id, 'whisper-base-en');

  const fallback = resolveActiveWhisper(WHISPER_MODELS, 'unknown');
  assert.equal(fallback.id, WHISPER_MODELS[0].id);
});

test('markItemDownloaded sets isDownloaded to true for the target model only', () => {
  const updated = markItemDownloaded(AVAILABLE_MODELS, 'phi-3.5-mini-q4');
  const phi = updated.find(m => m.id === 'phi-3.5-mini-q4');
  assert.equal(phi?.isDownloaded, true);
  assert.equal(AVAILABLE_MODELS.find(m => m.id === 'phi-3.5-mini-q4')?.isDownloaded, false);
});

test('applySettingsPatch updates only provided fields', () => {
  const next = applySettingsPatch(DEFAULT_APP_SETTINGS, {
    offlineOnly: true,
    activeWhisperId: 'whisper-base-en'
  });
  assert.equal(next.offlineOnly, true);
  assert.equal(next.activeWhisperId, 'whisper-base-en');
  assert.equal(next.activeLlmId, DEFAULT_APP_SETTINGS.activeLlmId);
  assert.equal(next.diarization, true);
});
