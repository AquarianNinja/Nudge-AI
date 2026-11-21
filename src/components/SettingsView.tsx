import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  FileCode,
  Fingerprint,
  HardDrive,
  Key,
  LogIn,
  LogOut,
  Mic,
  Radio,
  Shield,
  Smartphone,
  Sparkles,
  Vibrate
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HAPTIC_PROFILES } from '../utils/haptics.ts';
import {
  MOTION_INTENSITY_OPTIONS,
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildTabVariants
} from '../utils/motion.ts';
import {
  SETTINGS_CATEGORY_GROUPS,
  buildSettingsCategorySummaries,
  getSettingsCategoryMeta,
  resolveInitialSettingsCategory
} from '../utils/settingsCategories.ts';
import {
  ActivityType,
  AppSettings,
  Callsign,
  DictionaryEntry,
  DriveAudioFile,
  LiveProviderId,
  ModelOption,
  PaidProviderId,
  SettingsBucketId,
  SettingsCategoryId,
  UserIdentity,
  WhisperModelOption
} from '../types/index.ts';
import { LIVE_TRANSCRIPTION_PROVIDERS } from '../data/mockData.ts';
import {
  ACTIVITY_LABELS,
  PAID_PROVIDERS,
  checkLiveTranscriptionReadiness,
  countConfiguredApiKeys,
  validateApiKeyFormat
} from '../utils/providerRouting.ts';
import { ActivityPipelineBar } from './ActivityPipelineBar.tsx';
import { CallsignIdentitySection } from './CallsignIdentitySection.tsx';
import { DictionaryBucketView } from './DictionaryBucketView.tsx';
import { DriveFolderView } from './DriveFolderView.tsx';
import { HapticsBucketView } from './HapticsBucketView.tsx';
import { HardwareLabView } from './HardwareLabView.tsx';
import { VoiceProfileBucketView } from './VoiceProfileBucketView.tsx';
import { WhitepaperView } from './WhitepaperView.tsx';
import { useFirebaseAuth } from './FirebaseProvider.tsx';

interface SettingsViewProps {
  settings: AppSettings;
  llmModels: ModelOption[];
  whisperModels: WhisperModelOption[];
  driveFiles: DriveAudioFile[];
  dictionaryEntries: DictionaryEntry[];
  identity: UserIdentity;
  callsigns: Callsign[];
  isDeviceFrame: boolean;
  onToggleDeviceFrame: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateDictionary: (next: DictionaryEntry[]) => void;
  onOpenModelPicker: (section: 'llm' | 'whisper') => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
  onSaveToDrive: (file: DriveAudioFile) => void;
  onDeleteFromDrive: (id: string) => void;
  onOpenDriveFileInMeetings: (file: DriveAudioFile) => void;
  onCreateCallsign: (input: { displayName: string; avatar: string; isActive: boolean }) => Promise<void>;
  onUpdateCallsign: (
    callsignId: string,
    patch: { displayName?: string; avatar?: string; isActive?: boolean }
  ) => Promise<void>;
  onDeleteCallsign: (callsignId: string) => Promise<void>;
  onReplayOnboarding?: () => void;
  requestedBucket?: SettingsBucketId | null;
  requestedBucketNonce?: number;
}

const ACTIVITIES: ActivityType[] = ['transcription', 'meetingNotes', 'slideDeck'];

const CATEGORY_ICONS: Record<SettingsCategoryId, React.ComponentType<{ className?: string }>> = {
  callsigns: Fingerprint,
  models: Cpu,
  speech: Radio,
  voice: Mic,
  haptics: Vibrate,
  dictionary: BookOpen,
  drive: HardDrive,
  system: Key
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  llmModels,
  whisperModels,
  driveFiles,
  dictionaryEntries,
  identity,
  callsigns,
  isDeviceFrame,
  onToggleDeviceFrame,
  onUpdateSettings,
  onUpdateDictionary,
  onOpenModelPicker,
  onOpenApiKeys,
  onSaveToDrive,
  onDeleteFromDrive,
  onOpenDriveFileInMeetings,
  onCreateCallsign,
  onUpdateCallsign,
  onDeleteCallsign,
  onReplayOnboarding,
  requestedBucket,
  requestedBucketNonce = 0
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, workspaceRootReady, isSigningIn, authError, signInWithGoogle, signOut, clearAuthError } =
    useFirebaseAuth();
  const isReducedMotion = prefersReduced || settings.motionIntensity === 'reduced';
  const drillVariants = buildTabVariants(isReducedMotion);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [[activeCategory, viewDirection], setCategoryState] = useState<
    [SettingsCategoryId | null, 1 | -1]
  >(() => [resolveInitialSettingsCategory(requestedBucket), 1]);

  const openCategory = (next: SettingsCategoryId) => {
    setCategoryState(([prev]) => [next, prev === null ? 1 : 1]);
  };

  const backToCategories = () => {
    setCategoryState(([prev]) => (prev === null ? [null, -1] : [null, -1]));
  };

  const [expandedDiagnostic, setExpandedDiagnostic] = useState<'none' | 'hardware' | 'whitepaper'>('none');

  useEffect(() => {
    const resolved = resolveInitialSettingsCategory(requestedBucket);
    setCategoryState(([prev]) => {
      if (prev === resolved) return [prev, 1];
      return [resolved, resolved === null ? -1 : 1];
    });
  }, [requestedBucket, requestedBucketNonce]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeCategory]);

  const activeLlm = llmModels.find(m => m.id === settings.activeLlmId) || llmModels[0];
  const activeWhisper = whisperModels.find(m => m.id === settings.activeWhisperId) || whisperModels[0];
  const configuredKeyCount = countConfiguredApiKeys(settings);
  const configuredProviderNames = PAID_PROVIDERS
    .filter(p => validateApiKeyFormat(p.id, settings.apiKeys[p.id] || '').valid)
    .map(p => p.name);
  const liveReadiness = useMemo(() => checkLiveTranscriptionReadiness(settings), [settings]);

  const activeHapticProfile =
    HAPTIC_PROFILES.find(p => p.id === settings.haptics.profile) || HAPTIC_PROFILES[0];
  const isHapticsActive = settings.hapticFeedback && settings.haptics.enabled;
  const activeMotionOption =
    MOTION_INTENSITY_OPTIONS.find(o => o.id === settings.motionIntensity) || MOTION_INTENSITY_OPTIONS[1];

  const activeCallsign = callsigns.find((c) => c.isActive) || callsigns[0];
  const activeCallsignLabel = activeCallsign
    ? `${activeCallsign.avatar ? `${activeCallsign.avatar} ` : ''}${activeCallsign.displayName}`
    : undefined;

  const categorySummaries = useMemo(
    () =>
      buildSettingsCategorySummaries({
        settings,
        llmModels,
        whisperModels,
        driveFiles,
        dictionaryEntries,
        liveProviderLabel: liveReadiness.option.companyName,
        isDeviceFrame,
        activeCallsignLabel,
        callsignCount: callsigns.length
      }),
    [
      settings,
      llmModels,
      whisperModels,
      driveFiles,
      dictionaryEntries,
      liveReadiness.option.companyName,
      isDeviceFrame,
      activeCallsignLabel,
      callsigns.length
    ]
  );

  const activeMeta = activeCategory ? getSettingsCategoryMeta(activeCategory) : null;
  const ActiveCategoryIcon = activeCategory ? CATEGORY_ICONS[activeCategory] : null;

  return (
    <div
      ref={scrollRef}
      className="flex flex-col h-full max-w-3xl mx-auto w-full px-3 sm:px-5 py-3 pb-28 overflow-y-auto"
    >
      <AnimatePresence mode="wait" initial={false} custom={viewDirection}>
        {activeCategory === null ? (
          <motion.div
            key="settings-categories-root"
            custom={viewDirection}
            variants={drillVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-4"
          >
            {/* Categories Root Header */}
            <div className="flex items-baseline justify-between gap-3 px-1">
              <div>
                <h2 className="text-base font-semibold text-zinc-50 tracking-tight">Settings</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Select a category to inspect and configure options
                </p>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0 whitespace-nowrap">
                {configuredKeyCount}/{PAID_PROVIDERS.length} keys · {settings.offlineOnly ? 'Offline' : 'Hybrid'}
              </span>
            </div>

            {/* Firebase Cloud Sync & Account Card */}
            <div className="rounded-2xl liquid-glass p-3.5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google Account'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-xl object-cover border border-white/15 shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                        user
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                          : 'bg-[#0F7FFF]/15 border-[#54B0FF]/35 text-[#54B0FF]'
                      }`}
                    >
                      <Cloud className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-zinc-100 truncate">
                      {user ? user.displayName || 'Google Workspace User' : 'Firebase Cloud Sync'}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {user
                        ? `${user.email || 'Verified'} · ${
                            workspaceRootReady ? 'Firestore Live' : 'Connecting…'
                          }`
                        : 'Sign in with Google to sync diary, tasks, documents & preferences'}
                    </div>
                  </div>
                </div>

                {user ? (
                  <button
                    type="button"
                    data-haptic="selection"
                    onClick={() => void signOut()}
                    className="px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-[11px] font-medium text-zinc-200 flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-haptic="medium"
                    disabled={isSigningIn}
                    onClick={() => void signInWithGoogle()}
                    className="px-3 py-1.5 rounded-xl bg-[#0F7FFF] hover:bg-[#2B98FF] text-[11px] font-semibold text-white flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{isSigningIn ? 'Connecting…' : 'Sign In'}</span>
                  </button>
                )}
              </div>

              {authError && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200">
                  <span className="truncate">{authError}</span>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="text-[10px] font-semibold text-amber-300 hover:text-amber-100 shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Grouped Category Directory */}
            <div className="space-y-4">
              {SETTINGS_CATEGORY_GROUPS.map((group) => (
                <section key={group.id} aria-label={group.label} className="space-y-1.5">
                  <div className="px-1">
                    <span className="text-[11px] font-medium text-zinc-400 tracking-wide">
                      {group.label}
                    </span>
                  </div>

                  <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                    {group.categoryIds.map((categoryId) => {
                      const meta = getSettingsCategoryMeta(categoryId);
                      const summary = categorySummaries[categoryId];
                      const Icon = CATEGORY_ICONS[categoryId];

                      return (
                        <motion.button
                          key={categoryId}
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => openCategory(categoryId)}
                          aria-label={`${meta.title}: ${summary.primarySummary}`}
                          className="w-full min-h-[64px] flex items-center justify-between gap-3 px-3.5 sm:px-4 py-3 text-left hover:bg-white/[0.06] transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.accentClass}`}
                              aria-hidden="true"
                            >
                              <Icon className="w-[18px] h-[18px]" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold text-zinc-100 leading-snug">
                                {meta.title}
                              </div>
                              <div className="text-xs text-zinc-400 truncate mt-0.5">
                                {summary.primarySummary}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                              {summary.trailingLabel}
                            </span>
                            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`settings-detail-${activeCategory}`}
            custom={viewDirection}
            variants={drillVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-4"
          >
            {/* Category Detail Sticky-Style Top Navigation Bar */}
            <div className="rounded-2xl liquid-glass px-3 py-2.5 flex items-center justify-between gap-3">
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={backToCategories}
                aria-label="Back to settings categories"
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors shrink-0 whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Settings</span>
              </motion.button>

              {activeMeta && ActiveCategoryIcon && (
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${activeMeta.accentClass}`}
                    aria-hidden="true"
                  >
                    <ActiveCategoryIcon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 text-right sm:text-left">
                    <h2 className="text-sm font-semibold text-zinc-50 tracking-tight truncate">
                      {activeMeta.title}
                    </h2>
                  </div>
                </div>
              )}
            </div>

            {activeMeta && (
              <p className="text-xs text-zinc-400 px-1">{activeMeta.description}</p>
            )}

            {/* DETAIL 0: Callsign & Identity */}
            {activeCategory === 'callsigns' && (
              <section aria-label="Callsign and Identity settings">
                <CallsignIdentitySection
                  identity={identity}
                  callsigns={callsigns}
                  onCreateCallsign={onCreateCallsign}
                  onUpdateCallsign={onUpdateCallsign}
                  onDeleteCallsign={onDeleteCallsign}
                  onReplayOnboarding={onReplayOnboarding}
                />
              </section>
            )}

            {/* DETAIL 1: Models & Routing */}
            {activeCategory === 'models' && (
              <section aria-label="Models and Routing settings" className="space-y-3">
                <div className="space-y-2">
                  {ACTIVITIES.map((activity) => (
                    <ActivityPipelineBar
                      key={activity}
                      activity={activity}
                      label={ACTIVITY_LABELS[activity]}
                      settings={settings}
                      onUpdateSettings={onUpdateSettings}
                      onOpenApiKeys={onOpenApiKeys}
                    />
                  ))}
                </div>

                <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => onOpenModelPicker('llm')}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Cpu className="w-4 h-4 text-[#2B98FF] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100">Local LLM</div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {activeLlm.name} · {activeLlm.quantization} · {activeLlm.tokensPerSec} tok/s
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </motion.button>

                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => onOpenModelPicker('whisper')}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Mic className="w-4 h-4 text-[#2B98FF] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100">Speech & Whisper Model</div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {activeWhisper.name} · {activeWhisper.sizeLabel} · {activeWhisper.speedLabel}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </motion.button>
                </div>
              </section>
            )}

            {/* DETAIL 2: Speech & Live */}
            {activeCategory === 'speech' && (
              <section aria-label="Speech and Live Transcription settings" className="space-y-3">
                <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
                  <div className="p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-[#2B98FF] shrink-0" />
                        <span className="text-xs font-medium text-zinc-100">
                          Live Transcription
                        </span>
                      </div>

                      <select
                        aria-label="Live transcription provider"
                        value={settings.liveProviderId}
                        onChange={(e) =>
                          onUpdateSettings({ liveProviderId: e.target.value as LiveProviderId })
                        }
                        className="liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 max-w-[260px]"
                      >
                        {LIVE_TRANSCRIPTION_PROVIDERS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.companyName} · {opt.modelName}
                            {!opt.supportsLiveStreaming ? ' (No Live ASR)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] ${
                        liveReadiness.ready
                          ? 'liquid-glass-subtle text-zinc-200'
                          : 'bg-amber-950/30 border-amber-500/35 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {liveReadiness.ready ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">
                          {liveReadiness.ready
                            ? `${liveReadiness.pipelineSummary} · ${liveReadiness.option.protocol}`
                            : liveReadiness.reason}
                        </span>
                      </div>

                      {!liveReadiness.ready && liveReadiness.missingProvider && !settings.offlineOnly && (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => onOpenApiKeys(liveReadiness.missingProvider)}
                          className="px-2.5 py-1 rounded-full liquid-lens-active font-medium shrink-0"
                        >
                          Add Key
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {/* Company Paid Plan Live Streaming Support Table */}
                  <div className="p-3.5 space-y-2">
                    <div className="text-[11px] font-medium text-zinc-400">
                      Live Streaming Support Matrix
                    </div>
                    <div className="divide-y divide-white/10 rounded-xl liquid-glass-subtle overflow-hidden">
                      {LIVE_TRANSCRIPTION_PROVIDERS.map((opt) => {
                        const isSelected = settings.liveProviderId === opt.id;
                        const keyValid =
                          !opt.requiresPaidKey ||
                          opt.provider === 'local' ||
                          opt.provider === 'custom' ||
                          validateApiKeyFormat(
                            opt.provider as PaidProviderId,
                            settings.apiKeys[opt.provider as PaidProviderId] || ''
                          ).valid;

                        return (
                          <div
                            key={opt.id}
                            className={`px-3 py-2 flex items-center justify-between gap-3 text-[11px] ${
                              isSelected ? 'bg-white/[0.08]' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-zinc-100">{opt.companyName}</span>
                                <span className="text-zinc-600">·</span>
                                <span className="text-zinc-300">{opt.modelName}</span>
                                <span className="text-zinc-600">·</span>
                                <span className="font-mono text-zinc-500">{opt.paidPlanLabel}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                {opt.capabilityNote}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                              <span
                                className={
                                  opt.supportsLiveStreaming ? 'text-emerald-400' : 'text-zinc-500'
                                }
                              >
                                {opt.supportsLiveStreaming ? 'Live WS ✓' : 'Text / Notes Only'}
                              </span>
                              {opt.requiresPaidKey && opt.provider !== 'local' && (
                                <motion.button
                                  type="button"
                                  data-haptic="selection"
                                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                                  transition={MOTION_SPRINGS.interactive}
                                  onClick={() => onOpenApiKeys(opt.provider as PaidProviderId)}
                                  className={`px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                    keyValid
                                      ? 'border-emerald-400/40 text-emerald-300 bg-emerald-500/15'
                                      : 'border-white/15 text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12]'
                                  }`}
                                >
                                  {keyValid ? 'Key Set' : 'Set Key'}
                                </motion.button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language, Diarization, Punctuation & TTS */}
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-zinc-200">Language</span>
                    <select
                      aria-label="Transcription language"
                      value={settings.language}
                      onChange={(e) => onUpdateSettings({ language: e.target.value })}
                      className="liquid-glass-subtle rounded-lg px-2.5 py-1 text-xs text-zinc-100"
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="English (UK)">English (UK)</option>
                      <option value="Auto-detect">Auto-detect</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div>
                      <div className="text-zinc-200">Speaker Identification (Diarization)</div>
                      <div className="text-[11px] text-zinc-400">Attribute transcript turns by speaker</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Expected speaker count"
                        value={settings.speakerCount}
                        onChange={(e) =>
                          onUpdateSettings({
                            speakerCount: e.target.value === 'auto' ? 'auto' : Number(e.target.value)
                          })
                        }
                        className="liquid-glass-subtle rounded-lg px-2 py-1 text-[11px] text-zinc-200"
                      >
                        <option value="auto">Auto</option>
                        <option value={2}>2 speakers</option>
                        <option value={3}>3 speakers</option>
                        <option value={4}>4 speakers</option>
                      </select>
                      <motion.button
                        type="button"
                        role="switch"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        aria-checked={settings.diarization}
                        aria-label="Toggle speaker diarization"
                        onClick={() => onUpdateSettings({ diarization: !settings.diarization })}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                          settings.diarization
                            ? 'liquid-lens-active font-semibold'
                            : 'liquid-glass-subtle text-zinc-400'
                        }`}
                      >
                        {settings.diarization ? 'ON' : 'OFF'}
                      </motion.button>
                    </div>
                  </div>

                  <div className="px-3.5 py-2.5 space-y-1.5">
                    <label htmlFor="speaker-labels-input" className="text-zinc-200 block">
                      Speaker Profile Labels
                    </label>
                    <input
                      id="speaker-labels-input"
                      type="text"
                      value={settings.speakerLabels}
                      onChange={(e) => onUpdateSettings({ speakerLabels: e.target.value })}
                      className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-hidden focus:border-[#0F7FFF]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="text-zinc-200">Auto-Punctuation</div>
                    <motion.button
                      type="button"
                      role="switch"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-checked={settings.autoPunctuation}
                      aria-label="Toggle auto-punctuation"
                      onClick={() => onUpdateSettings({ autoPunctuation: !settings.autoPunctuation })}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                        settings.autoPunctuation
                          ? 'liquid-lens-active font-semibold'
                          : 'liquid-glass-subtle text-zinc-400'
                      }`}
                    >
                      {settings.autoPunctuation ? 'ON' : 'OFF'}
                    </motion.button>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="text-zinc-200">Audio Overview TTS</span>
                    <select
                      aria-label="Audio Overview TTS engine"
                      value={settings.ttsEngine}
                      onChange={(e) =>
                        onUpdateSettings({ ttsEngine: e.target.value as 'on-device' | 'secure-cloud' })
                      }
                      className="liquid-glass-subtle rounded-lg px-2.5 py-1 text-xs text-zinc-100"
                    >
                      <option value="on-device">AVSpeech (Local)</option>
                      <option value="secure-cloud">Cloud TTS</option>
                    </select>
                  </div>
                </div>
              </section>
            )}

            {/* DETAIL 3: Voice Profile */}
            {activeCategory === 'voice' && (
              <section aria-label="Voice Profile settings">
                <VoiceProfileBucketView
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  onSaveToDrive={onSaveToDrive}
                />
              </section>
            )}

            {/* DETAIL 4: Haptics */}
            {activeCategory === 'haptics' && (
              <section aria-label="Haptics settings">
                <HapticsBucketView
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                />
              </section>
            )}

            {/* DETAIL 5: Dictionary */}
            {activeCategory === 'dictionary' && (
              <section aria-label="Dictionary settings">
                <DictionaryBucketView
                  entries={dictionaryEntries}
                  settings={settings}
                  onUpdateEntries={onUpdateDictionary}
                  onUpdateSettings={onUpdateSettings}
                  onOpenApiKeys={onOpenApiKeys}
                />
              </section>
            )}

            {/* DETAIL 6: Drive */}
            {activeCategory === 'drive' && (
              <section aria-label="Drive audio storage settings">
                <DriveFolderView
                  embedded
                  files={driveFiles}
                  onSaveToDrive={onSaveToDrive}
                  onDeleteFromDrive={onDeleteFromDrive}
                  onOpenInMeetings={onOpenDriveFileInMeetings}
                />
              </section>
            )}

            {/* DETAIL 7: Keys & System */}
            {activeCategory === 'system' && (
              <section aria-label="Keys and System settings">
                <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => onOpenApiKeys()}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Key className="w-4 h-4 text-[#2B98FF] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100">
                          Paid API Keys & Custom Endpoints
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate">
                          {configuredKeyCount}/{PAID_PROVIDERS.length} configured
                          {configuredProviderNames.length > 0
                            ? ` · ${configuredProviderNames.join(' · ')}`
                            : ' · OpenAI, Anthropic, Gemini, Deepgram, AssemblyAI'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </motion.button>

                  <div className="px-3.5 py-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Sparkles className="w-4 h-4 text-[#2B98FF] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100">Motion Intensity</div>
                          <div className="text-[11px] text-zinc-400">
                            {activeMotionOption.tagline} · {activeMotionOption.description}
                          </div>
                        </div>
                      </div>

                      <div
                        role="radiogroup"
                        aria-label="Motion intensity preset"
                        className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px] shrink-0"
                      >
                        {MOTION_INTENSITY_OPTIONS.map((opt) => {
                          const active = settings.motionIntensity === opt.id;
                          return (
                            <motion.button
                              key={opt.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              data-haptic="selection"
                              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                              transition={MOTION_SPRINGS.interactive}
                              onClick={() => onUpdateSettings({ motionIntensity: opt.id })}
                              className={`relative px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                                active ? 'text-zinc-950' : 'text-zinc-300 hover:text-zinc-100'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="motion-intensity-pill"
                                  transition={MOTION_SPRINGS.pill}
                                  aria-hidden="true"
                                  className="absolute inset-0 rounded-full liquid-lens-active"
                                />
                              )}
                              <span className="relative z-10">{opt.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Shield
                        className={`w-4 h-4 ${settings.offlineOnly ? 'text-emerald-400' : 'text-zinc-400'}`}
                      />
                      <div className="text-zinc-200">Offline Air-Gap Mode</div>
                    </div>
                    <motion.button
                      type="button"
                      role="switch"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-checked={settings.offlineOnly}
                      aria-label="Toggle offline air-gap mode"
                      onClick={() => onUpdateSettings({ offlineOnly: !settings.offlineOnly })}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                        settings.offlineOnly
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'liquid-glass-subtle text-zinc-300'
                      }`}
                    >
                      {settings.offlineOnly ? 'OFFLINE' : 'HYBRID'}
                    </motion.button>
                  </div>

                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => openCategory('haptics')}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Vibrate className="w-4 h-4 text-[#2B98FF] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100">Haptic Feedback & Feel</div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {isHapticsActive
                            ? `${activeHapticProfile.name} · ${settings.haptics.intensity}`
                            : 'Muted across all screens'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  </motion.button>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-4 h-4 text-zinc-400" />
                      <div className="text-zinc-200">iOS Device Frame</div>
                    </div>
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={onToggleDeviceFrame}
                      className="px-2.5 py-1 rounded-full text-[11px] font-mono liquid-glass-subtle text-zinc-200 hover:bg-white/10"
                    >
                      {isDeviceFrame ? 'iPhone' : 'Expanded'}
                    </motion.button>
                  </div>

                  {/* Inline Expandable Diagnostics inside Keys & System */}
                  <div>
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-expanded={expandedDiagnostic === 'hardware'}
                      onClick={() =>
                        setExpandedDiagnostic(prev => (prev === 'hardware' ? 'none' : 'hardware'))
                      }
                      className="w-full min-h-[48px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Activity className="w-4 h-4 text-zinc-400" />
                        <div className="text-xs font-medium text-zinc-100">iOS Memory & Jetsam Lab</div>
                      </div>
                      {expandedDiagnostic === 'hardware' ? (
                        <ChevronDown className="w-4 h-4 text-zinc-300" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </motion.button>
                    <AnimatePresence initial={false}>
                      {expandedDiagnostic === 'hardware' && (
                        <motion.div
                          initial={{ opacity: 0, y: isReducedMotion ? 0 : -4 }}
                          animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                          exit={{ opacity: 0, y: isReducedMotion ? 0 : -4, transition: MOTION_TRANSITIONS.elementExit }}
                          className="p-3 border-t border-white/10 bg-black/20"
                        >
                          <HardwareLabView />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-expanded={expandedDiagnostic === 'whitepaper'}
                      onClick={() =>
                        setExpandedDiagnostic(prev => (prev === 'whitepaper' ? 'none' : 'whitepaper'))
                      }
                      className="w-full min-h-[48px] flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileCode className="w-4 h-4 text-zinc-400" />
                        <div className="text-xs font-medium text-zinc-100">Architecture Study</div>
                      </div>
                      {expandedDiagnostic === 'whitepaper' ? (
                        <ChevronDown className="w-4 h-4 text-zinc-300" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </motion.button>
                    <AnimatePresence initial={false}>
                      {expandedDiagnostic === 'whitepaper' && (
                        <motion.div
                          initial={{ opacity: 0, y: isReducedMotion ? 0 : -4 }}
                          animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                          exit={{ opacity: 0, y: isReducedMotion ? 0 : -4, transition: MOTION_TRANSITIONS.elementExit }}
                          className="p-3 border-t border-white/10 bg-black/20"
                        >
                          <WhitepaperView />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
