import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { TabBar } from './components/TabBar.tsx';
import { UnifiedWorkspaceView } from './components/UnifiedWorkspaceView.tsx';
import { CrewPlannerSubView } from './components/CrewPlannerSection.tsx';
import { MeetingNotesView } from './components/MeetingNotesView.tsx';
import { StudioView } from './components/StudioView.tsx';
import { NotebookLMView } from './components/NotebookLMView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import { CreateNanobotPayload } from './components/CreateNanobotWizard.tsx';
import { ModelPickerModal } from './components/ModelPickerModal.tsx';
import { ApiKeysModal } from './components/ApiKeysModal.tsx';
import { useFirebaseAuth } from './components/FirebaseProvider.tsx';
import {
  AppMode,
  AppSettings,
  Callsign,
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  DictionaryEntry,
  DictionaryTermSource,
  DriveAudioFile,
  GenTeamAgent,
  GenTeamChannel,
  GenTeamMessage,
  GenTeamTask,
  MeetingSession,
  ModelOption,
  Nanobot,
  NanobotRun,
  NanobotStatus,
  PaidProviderId,
  SettingsBucketId,
  SparkpageData,
  UploadedAssetKind,
  UserIdentity,
  WhisperModelOption,
  WorkspaceSubTab
} from './types/index.ts';
import {
  AVAILABLE_MODELS,
  DEFAULT_APP_SETTINGS,
  INITIAL_DICTIONARY_ENTRIES,
  WHISPER_MODELS
} from './data/mockData.ts';
import {
  applySettingsPatch,
  markItemDownloaded,
  resolveActiveLlm,
  resolveActiveWhisper
} from './utils/modelCatalog.ts';
import {
  addDriveAudioFile,
  createDriveAudioFile,
  createSyntheticMeetingWavUrl,
  removeDriveAudioFile
} from './utils/audioDrive.ts';
import {
  formatDictionaryTermsCsv,
  learnTermsFromContext
} from './utils/dictionaryLearning.ts';
import { parseSpeakerLabels } from './utils/providerRouting.ts';
import {
  INITIAL_MEETING_SESSION,
  stripAudioFromMeetingSession
} from './utils/meetingNotes.ts';
import {
  configureHaptics,
  resolveInteractiveHapticKind,
  triggerHaptic
} from './utils/haptics.ts';
import {
  INITIAL_GENTEAM_AGENTS,
  INITIAL_GENTEAM_CHANNELS,
  INITIAL_GENTEAM_MESSAGES,
  INITIAL_GENTEAM_TASKS
} from './utils/genTeam.ts';
import {
  buildScreenVariants,
  getMotionConfigProps,
  getTabTransitionDirection
} from './utils/motion.ts';
import {
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  upsertCoreDataDocument
} from './utils/coreDataVectorDb.ts';
import {
  fetchCoreDataStoreSummary,
  syncDocumentDeleteToBackend,
  syncDocumentIngestToBackend
} from './utils/ragClient.ts';
import {
  deleteCallsignFromFirestore,
  deleteCoreDataDocFromFirestore,
  deleteNanobotFromFirestore,
  loadAccountIdentityFromFirestore,
  saveAccountIdentityToFirestore,
  saveCallsignToFirestore,
  saveCoreDataDocToFirestore,
  saveNanobotRunToFirestore,
  saveNanobotToFirestore,
  saveUserPreferencesToFirestore,
  subscribeCallsigns,
  subscribeCoreDataDocuments,
  subscribeNanobots,
  subscribeUserPreferences
} from './utils/firestoreSync.ts';
import {
  createCallsignRequest,
  createNanobotRequest,
  deleteCallsignRequest,
  deleteNanobotRequest,
  fetchNanobotsRequest,
  initBackendIdentity,
  rerunNanobotRequest,
  updateCallsignRequest,
  updateNanobotRequest
} from './utils/nanobotClient.ts';
import { generateReadableUserId } from './utils/identityCallsigns.ts';

const PRIMARY_MODES: readonly AppMode[] = [
  'workspace',
  'meetings',
  'studio',
  'notebook',
  'settings'
];

function readShouldSkipOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return true;
    return window.localStorage.getItem('hasSeenOnboarding') === 'true';
  } catch {
    return false;
  }
}

function getOrCreateGuestScopeKey(): string {
  const storageKey = 'nudge_guest_scope_key';
  if (typeof window === 'undefined') return 'guest-default';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `guest-${crypto.randomUUID().slice(0, 12)}`
        : `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return 'guest-default';
  }
}

export default function App() {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, authReady, workspaceRootReady } = useFirebaseAuth();
  const [[activeMode, navDirection], setModeState] = useState<[AppMode, 1 | -1]>([
    'workspace',
    1
  ]);
  const [requestedWorkspaceSubTab, setRequestedWorkspaceSubTab] = useState<WorkspaceSubTab | null>(
    null
  );
  const [requestedCrewView, setRequestedCrewView] = useState<CrewPlannerSubView | null>(null);
  const [requestedWorkspaceNonce, setRequestedWorkspaceNonce] = useState<number>(0);

  const setActiveMode = (nextMode: AppMode) => {
    if (nextMode === 'nanoteam' || nextMode === 'genteam') {
      setRequestedWorkspaceSubTab('scheduler');
      setRequestedCrewView('nanoteam');
      setRequestedWorkspaceNonce((n) => n + 1);
      setModeState(([prevMode]) => [
        'workspace',
        getTabTransitionDirection(PRIMARY_MODES, prevMode, 'workspace')
      ]);
      return;
    }
    if (nextMode === 'settings') {
      setRequestedSettingsBucket(null);
      setRequestedSettingsNonce(n => n + 1);
    }
    setModeState(([prevMode]) => {
      if (prevMode === nextMode) return [prevMode, 1];
      return [nextMode, getTabTransitionDirection(PRIMARY_MODES, prevMode, nextMode)];
    });
  };

  const [isDeviceFrame, setIsDeviceFrame] = useState<boolean>(true);
  const [ingestedSparkpage, setIngestedSparkpage] = useState<SparkpageData | null>(null);
  const [studioSeedSession, setStudioSeedSession] = useState<MeetingSession | null>(null);
  const [incomingDriveFile, setIncomingDriveFile] = useState<DriveAudioFile | null>(null);
  const [requestedSettingsBucket, setRequestedSettingsBucket] = useState<SettingsBucketId | null>(null);
  const [requestedSettingsNonce, setRequestedSettingsNonce] = useState<number>(0);

  const [driveFiles, setDriveFiles] = useState<DriveAudioFile[]>(() => [
    createDriveAudioFile({
      id: INITIAL_MEETING_SESSION.driveFileId || 'drive-sample-fnol-s1',
      fileName: INITIAL_MEETING_SESSION.audioFileName,
      origin: 'sample',
      durationSec: INITIAL_MEETING_SESSION.audioDurationSec || 760,
      sizeBytes: 6400000,
      audioUrl: createSyntheticMeetingWavUrl(INITIAL_MEETING_SESSION.audioDurationSec || 760, 1),
      mimeType: 'audio/wav',
      createdAt: INITIAL_MEETING_SESSION.recordedAt,
      linkedSessionTitle: INITIAL_MEETING_SESSION.title
    })
  ]);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const motionConfig = getMotionConfigProps(settings.motionIntensity);
  const isReducedMotion = prefersReduced || settings.motionIntensity === 'reduced';
  const screenVariants = buildScreenVariants(isReducedMotion);
  const [genTeamAgents, setGenTeamAgents] = useState<GenTeamAgent[]>(INITIAL_GENTEAM_AGENTS);
  const [genTeamChannels, setGenTeamChannels] = useState<GenTeamChannel[]>(INITIAL_GENTEAM_CHANNELS);
  const [genTeamMessages, setGenTeamMessages] = useState<GenTeamMessage[]>(INITIAL_GENTEAM_MESSAGES);
  const [genTeamTasks, setGenTeamTasks] = useState<GenTeamTask[]>(INITIAL_GENTEAM_TASKS);
  const [meetingSessions, setMeetingSessions] = useState<MeetingSession[]>([INITIAL_MEETING_SESSION]);
  const [meetingBaseId, setMeetingBaseId] = useState<string>(INITIAL_MEETING_SESSION.id);
  const [meetingCurrentId, setMeetingCurrentId] = useState<string>(INITIAL_MEETING_SESSION.id);
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>(
    INITIAL_DICTIONARY_ENTRIES
  );
  const [llmModels, setLlmModels] = useState<ModelOption[]>(AVAILABLE_MODELS);
  const [whisperModels, setWhisperModels] = useState<WhisperModelOption[]>(WHISPER_MODELS);
  const [pickerState, setPickerState] = useState<{ isOpen: boolean; section: 'llm' | 'whisper' }>({
    isOpen: false,
    section: 'llm'
  });
  const [apiKeyModalState, setApiKeyModalState] = useState<{
    isOpen: boolean;
    focusProvider: PaidProviderId | null;
  }>({
    isOpen: false,
    focusProvider: null
  });
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !readShouldSkipOnboarding());
  const [onboardingInitialStage, setOnboardingInitialStage] = useState<'carousel' | 'link'>('carousel');
  const [identity, setIdentity] = useState<UserIdentity>(() => ({
    userId: generateReadableUserId(),
    createdAt: new Date().toISOString(),
    linkedProvider: 'guest'
  }));
  const [identityReady, setIdentityReady] = useState<boolean>(false);
  const [callsigns, setCallsigns] = useState<Callsign[]>([]);
  const [nanobots, setNanobots] = useState<Nanobot[]>([]);
  const [nanobotRuns, setNanobotRuns] = useState<NanobotRun[]>([]);
  const [botNotificationToast, setBotNotificationToast] = useState<{
    botId: string;
    botName: string;
    status: NanobotRun['status'];
  } | null>(null);
  const seenRunIdsRef = React.useRef<Set<string>>(new Set());
  const isCloudSynced = Boolean(authReady && user && user.emailVerified && workspaceRootReady);

  const [coreDataStore, setCoreDataStore] = useState<CoreDataVectorStoreState>(() =>
    createInitialCoreDataStore()
  );

  const activeLlm = resolveActiveLlm(llmModels, settings.activeLlmId);

  useEffect(() => {
    let active = true;
    fetchCoreDataStoreSummary().then((summary) => {
      if (!active || !summary) return;
      // Merge any server-side uploaded documents not yet in client store
      setCoreDataStore((prev) => {
        const existingIds = new Set(prev.documents.map((d) => d.id));
        const missingDocs = summary.documents.filter((d) => !existingIds.has(d.id));
        if (missingDocs.length === 0) {
          return {
            ...prev,
            lastSyncedIso: summary.lastSyncedIso
          };
        }
        let next = prev;
        for (const doc of missingDocs) {
          next = upsertCoreDataDocument(next, {
            id: doc.id,
            title: doc.title,
            format: doc.format,
            assetKind: doc.assetKind,
            sizeKB: doc.sizeKB,
            summary: doc.summary,
            text: `${doc.summary}\n${doc.contentExcerpt}`,
            tags: doc.tags,
            dateAdded: doc.dateAdded
          }).nextStore;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Initialize server-issued immutable User ID (NB-XXXX-XXXX) and reconcile with Google/Firestore identity
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const guestScopeKey = getOrCreateGuestScopeKey();

    const syncIdentity = async () => {
      try {
        if (user) {
          let preferredExistingUserId: string | undefined;
          if (user.emailVerified && workspaceRootReady) {
            const cloudIdentity = await loadAccountIdentityFromFirestore(user.uid).catch(() => null);
            if (cloudIdentity) {
              preferredExistingUserId = cloudIdentity.userId;
            }
          }
          const res = await initBackendIdentity({
            scopeKey: `uid:${user.uid}`,
            authUid: user.uid,
            linkedProvider: 'google',
            preferredExistingUserId,
            guestScopeKey
          });
          if (cancelled) return;
          setIdentity(res.identity);
          setCallsigns(res.callsigns);
          setIdentityReady(true);

          if (user.emailVerified && workspaceRootReady && !preferredExistingUserId) {
            void saveAccountIdentityToFirestore(user.uid, res.identity).catch(() => undefined);
          }
        } else {
          const res = await initBackendIdentity({
            scopeKey: guestScopeKey,
            linkedProvider: 'guest'
          });
          if (cancelled) return;
          setIdentity(res.identity);
          setCallsigns(res.callsigns);
          setIdentityReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize backend User ID:', err);
        if (!cancelled) setIdentityReady(true);
      }
    };

    void syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, workspaceRootReady]);

  // Load Nanobots + Run history for active immutable userId and poll while any Nanobot is scheduled/running
  useEffect(() => {
    if (!identityReady || !identity.userId) return;
    let cancelled = false;

    const refreshNanobots = async (announceNewCompletions: boolean) => {
      try {
        const res = await fetchNanobotsRequest(identity.userId);
        if (cancelled) return;

        if (!announceNewCompletions) {
          seenRunIdsRef.current = new Set(res.runs.map((r) => r.id));
        } else {
          for (const run of res.runs) {
            if (!seenRunIdsRef.current.has(run.id)) {
              seenRunIdsRef.current.add(run.id);
              const ownerBot = res.nanobots.find((b) => b.id === run.botId);
              if (ownerBot && ownerBot.schedule.notificationsEnabled && run.status !== 'running') {
                setBotNotificationToast({
                  botId: ownerBot.id,
                  botName: ownerBot.name,
                  status: run.status
                });
                triggerHaptic('success');
                if (
                  typeof window !== 'undefined' &&
                  'Notification' in window &&
                  Notification.permission === 'granted'
                ) {
                  try {
                    new Notification(`Nanobot ${ownerBot.name}`, {
                      body: `Run ${run.status}: ${ownerBot.taskPrompt.slice(0, 80)}`
                    });
                  } catch {
                    // ignore browser notification block
                  }
                }
              }
            }
          }
        }

        setNanobots(res.nanobots);
        setNanobotRuns(res.runs);
      } catch {
        // ignore transient polling failure
      }
    };

    void refreshNanobots(false);
    const hasActiveBots = nanobots.some((b) => b.status === 'scheduled' || b.status === 'running');
    if (!hasActiveBots) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      void refreshNanobots(true);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [identityReady, identity.userId, nanobots.some((b) => b.status === 'scheduled' || b.status === 'running')]);

  // Auto-dismiss Nanobot completion toast
  useEffect(() => {
    if (!botNotificationToast) return;
    const t = setTimeout(() => setBotNotificationToast(null), 6000);
    return () => clearTimeout(t);
  }, [botNotificationToast]);

  // Firestore real-time sync for CoreData Documents, User Preferences, Callsigns & Nanobots when authenticated
  useEffect(() => {
    if (!isCloudSynced || !user) return;
    const unsubDocs = subscribeCoreDataDocuments(user.uid, (cloudDocs) => {
      if (cloudDocs.length === 0) return;
      setCoreDataStore((prev) => {
        const existingIds = new Set(prev.documents.map((d) => d.id));
        const missingDocs = cloudDocs.filter((d) => !existingIds.has(d.id));
        if (missingDocs.length === 0) return prev;
        let next = prev;
        for (const docItem of missingDocs) {
          next = upsertCoreDataDocument(next, {
            id: docItem.id,
            title: docItem.title,
            format: docItem.format,
            assetKind: docItem.assetKind,
            sizeKB: docItem.sizeKB,
            summary: docItem.summary,
            text: `${docItem.summary}\n${docItem.contentExcerpt}`,
            tags: docItem.tags,
            dateAdded: docItem.dateAdded
          }).nextStore;
        }
        return next;
      });
    });

    const unsubPrefs = subscribeUserPreferences(user.uid, (patch) => {
      setSettings((prev) => {
        const cleanedPatch: Partial<AppSettings> = {};
        if (patch.activeLlmId) cleanedPatch.activeLlmId = patch.activeLlmId;
        if (patch.activeWhisperId) cleanedPatch.activeWhisperId = patch.activeWhisperId;
        if (patch.ttsEngine) cleanedPatch.ttsEngine = patch.ttsEngine;
        if (patch.offlineOnly !== undefined) cleanedPatch.offlineOnly = patch.offlineOnly;
        if (patch.motionIntensity) cleanedPatch.motionIntensity = patch.motionIntensity;
        if (patch.hapticFeedback !== undefined) cleanedPatch.hapticFeedback = patch.hapticFeedback;
        if (patch.diarization !== undefined) cleanedPatch.diarization = patch.diarization;
        if (patch.autoPunctuation !== undefined) cleanedPatch.autoPunctuation = patch.autoPunctuation;
        if (patch.language) cleanedPatch.language = patch.language;
        if (patch.autoLearnDictionary !== undefined)
          cleanedPatch.autoLearnDictionary = patch.autoLearnDictionary;
        if (patch.liveProviderId) cleanedPatch.liveProviderId = patch.liveProviderId;
        return applySettingsPatch(prev, cleanedPatch);
      });
    });

    const unsubCallsigns = subscribeCallsigns(user.uid, (cloudCallsigns) => {
      setCallsigns((localCallsigns) => {
        if (cloudCallsigns.length === 0 && localCallsigns.length > 0) {
          for (const cs of localCallsigns) {
            void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
          }
          return localCallsigns;
        }
        if (cloudCallsigns.length === 0) return localCallsigns;
        const byId = new Map<string, Callsign>();
        for (const cs of localCallsigns) byId.set(cs.id, cs);
        for (const cs of cloudCallsigns) byId.set(cs.id, cs);
        return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    });

    const unsubNanobots = subscribeNanobots(user.uid, (cloudBots) => {
      setNanobots((localBots) => {
        if (cloudBots.length === 0 && localBots.length > 0) {
          for (const bot of localBots) {
            void saveNanobotToFirestore(user.uid, bot).catch(() => undefined);
          }
          return localBots;
        }
        if (cloudBots.length === 0) return localBots;
        const byId = new Map<string, Nanobot>();
        for (const bot of localBots) byId.set(bot.id, bot);
        for (const bot of cloudBots) byId.set(bot.id, bot);
        return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    return () => {
      unsubDocs();
      unsubPrefs();
      unsubCallsigns();
      unsubNanobots();
    };
  }, [isCloudSynced, user]);

  useEffect(() => {
    document.documentElement.dataset.motionIntensity = settings.motionIntensity;
  }, [settings.motionIntensity]);

  useEffect(() => {
    configureHaptics({
      ...settings.haptics,
      enabled: settings.hapticFeedback && settings.haptics.enabled
    });
  }, [settings.hapticFeedback, settings.haptics]);

  useEffect(() => {
    let lastPointerHapticAt = 0;

    const handlePointerDown = (e: PointerEvent) => {
      const kind = resolveInteractiveHapticKind(e.target as HTMLElement | null);
      if (kind) {
        lastPointerHapticAt = Date.now();
        triggerHaptic(kind);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const kind = resolveInteractiveHapticKind(e.target as HTMLElement | null);
      if (kind) {
        triggerHaptic(kind);
      }
    };

    const handleChange = (e: Event) => {
      // Avoid double trigger right after pointer interaction on form controls
      if (Date.now() - lastPointerHapticAt < 250) return;
      const target = e.target as HTMLElement | null;
      const inputType = (target as HTMLInputElement | null)?.type;
      if (
        target &&
        (target.tagName === 'SELECT' ||
          inputType === 'range' ||
          inputType === 'checkbox' ||
          inputType === 'radio')
      ) {
        triggerHaptic('selection');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true, passive: true });
    document.addEventListener('change', handleChange, { capture: true, passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('change', handleChange, { capture: true });
    };
  }, []);

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = applySettingsPatch(prev, patch);
      if (authReady && user && user.emailVerified && workspaceRootReady) {
        void saveUserPreferencesToFirestore(user.uid, next).catch((err) => {
          console.error('Failed to sync preferences to Firestore:', err);
        });
      }
      return next;
    });
  };

  const handleUpdateDictionary = (next: DictionaryEntry[]) => {
    setDictionaryEntries(next);
  };

  const handleLearnTerms = (payload: {
    text: string;
    source: DictionaryTermSource;
    sourceFile: string;
  }) => {
    if (!settings.autoLearnDictionary) {
      return { addedCount: 0, learnedTerms: [] };
    }
    const res = learnTermsFromContext(dictionaryEntries, {
      ...payload,
      speakerLabels: parseSpeakerLabels(settings.speakerLabels)
    });
    setDictionaryEntries(res.entries);
    setSettings(prev =>
      applySettingsPatch(prev, { domainTerms: formatDictionaryTermsCsv(res.entries) })
    );
    return { addedCount: res.addedCount, learnedTerms: res.learnedTerms };
  };

  const handleOpenModelPicker = (section: 'llm' | 'whisper') => {
    setPickerState({ isOpen: true, section });
  };

  const handleOpenApiKeys = (focusProvider?: PaidProviderId) => {
    setApiKeyModalState({ isOpen: true, focusProvider: focusProvider || null });
  };

  const handleSaveToDrive = (file: DriveAudioFile) => {
    setDriveFiles(prev => addDriveAudioFile(prev, file));
  };

  const handleDeleteFromDrive = (id: string) => {
    setDriveFiles(prev => removeDriveAudioFile(prev, id));
    setMeetingSessions(prev =>
      prev.map(s => (s.driveFileId === id ? stripAudioFromMeetingSession(s) : s))
    );
  };

  const handleOpenDriveFileInMeetings = (file: DriveAudioFile) => {
    setIncomingDriveFile(file);
    setActiveMode('meetings');
  };

  const handleDownloadLlm = (id: string) => {
    if (downloadingModelId) return;
    setDownloadingModelId(id);
    setTimeout(() => {
      setLlmModels(prev => markItemDownloaded(prev, id));
      setSettings(prev => applySettingsPatch(prev, { activeLlmId: id }));
      setDownloadingModelId(null);
      triggerHaptic('success');
    }, 550);
  };

  const handleDownloadWhisper = (id: string) => {
    if (downloadingModelId) return;
    setDownloadingModelId(id);
    setTimeout(() => {
      setWhisperModels(prev => markItemDownloaded(prev, id));
      setSettings(prev => applySettingsPatch(prev, { activeWhisperId: id }));
      setDownloadingModelId(null);
      triggerHaptic('success');
    }, 550);
  };

  const handleIngestDocumentToCoreData = async (input: {
    id?: string;
    title: string;
    format: CoreDataDocumentFormat;
    assetKind: UploadedAssetKind;
    sizeKB: number;
    summary?: string;
    text: string;
    sections?: Array<{ label: string; text: string }>;
    tags?: string[];
    dateAdded?: string;
  }): Promise<CoreDataManagedDocument> => {
    const resolvedId =
      input.id || `cd-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const normalizedInput = { ...input, id: resolvedId };
    const { document: localDoc } = upsertCoreDataDocument(coreDataStore, normalizedInput);

    setCoreDataStore((prev) => upsertCoreDataDocument(prev, normalizedInput).nextStore);

    const backendResp = await syncDocumentIngestToBackend(normalizedInput);
    const finalDoc = backendResp?.document || localDoc;
    if (authReady && user && user.emailVerified && workspaceRootReady) {
      void saveCoreDataDocToFirestore(user.uid, finalDoc).catch((err) => {
        console.error('Failed to sync CoreData document to Firestore:', err);
      });
    }
    return finalDoc;
  };

  const handleDeleteCoreDataDocument = async (docId: string): Promise<void> => {
    setCoreDataStore((prev) => deleteCoreDataDocument(prev, docId));
    await syncDocumentDeleteToBackend(docId);
    if (authReady && user && user.emailVerified && workspaceRootReady) {
      void deleteCoreDataDocFromFirestore(user.uid, docId).catch((err) => {
        console.error('Failed to delete CoreData document from Firestore:', err);
      });
    }
  };

  const handleIngestSparkpage = (sp: SparkpageData) => {
    const sections = sp.sections.map((s) => ({
      label: s.title,
      text: `${s.summary}\n${s.content}${s.bullets ? `\n${s.bullets.join('\n')}` : ''}`
    }));
    void handleIngestDocumentToCoreData({
      id: `doc-${sp.id}`,
      title: `${sp.title.slice(0, 48)}.md`,
      format: 'Markdown',
      assetKind: 'document',
      sizeKB: Math.max(12, Math.round(JSON.stringify(sp).length / 128)),
      summary: sp.subtitle,
      text: sections.map((s) => s.text).join('\n\n'),
      sections,
      tags: ['Sparkpage', 'Cloud Search']
    });
    setIngestedSparkpage(sp);
    setActiveMode('notebook');
  };

  const handleOpenInStudio = (session: MeetingSession) => {
    setStudioSeedSession(session);
    setActiveMode('studio');
  };

  const handleOpenSettingsBucket = (bucket?: SettingsBucketId) => {
    setRequestedSettingsBucket(bucket || null);
    setRequestedSettingsNonce(n => n + 1);
    setModeState(([prevMode]) => {
      if (prevMode === 'settings') return [prevMode, 1];
      return ['settings', getTabTransitionDirection(PRIMARY_MODES, prevMode, 'settings')];
    });
  };

  const handleCompleteOnboarding = () => {
    try {
      window.localStorage.setItem('hasSeenOnboarding', 'true');
    } catch {
      // ignore storage quota errors
    }
    setShowOnboarding(false);
  };

  const handleReplayOnboarding = () => {
    setOnboardingInitialStage('carousel');
    setShowOnboarding(true);
  };

  const handleCreateCallsign = async (input: {
    displayName: string;
    avatar: string;
    isActive: boolean;
  }): Promise<void> => {
    const res = await createCallsignRequest({
      userId: identity.userId,
      ...input
    });
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleUpdateCallsign = async (
    callsignId: string,
    patch: { displayName?: string; avatar?: string; isActive?: boolean }
  ): Promise<void> => {
    const res = await updateCallsignRequest(callsignId, {
      userId: identity.userId,
      ...patch
    });
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleDeleteCallsign = async (callsignId: string): Promise<void> => {
    const res = await deleteCallsignRequest(callsignId, identity.userId);
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      void deleteCallsignFromFirestore(user.uid, callsignId).catch(() => undefined);
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleReleaseNanobot = async (payload: CreateNanobotPayload): Promise<Nanobot> => {
    const res = await createNanobotRequest({
      userId: identity.userId,
      ...payload
    });
    for (const r of res.runs) {
      seenRunIdsRef.current.add(r.id);
    }
    setNanobots(res.nanobots);
    setNanobotRuns((prev) => [...res.runs, ...prev.filter((r) => !res.runs.some((nr) => nr.id === r.id))]);
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
      for (const r of res.runs) {
        void saveNanobotRunToFirestore(user.uid, r).catch(() => undefined);
      }
    }
    return res.nanobot;
  };

  const handleRerunNanobot = async (bot: Nanobot): Promise<void> => {
    const res = await rerunNanobotRequest(bot.id, identity.userId);
    seenRunIdsRef.current.add(res.run.id);
    setNanobots((prev) => prev.map((b) => (b.id === res.nanobot.id ? res.nanobot : b)));
    setNanobotRuns((prev) => [res.run, ...prev]);
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
      void saveNanobotRunToFirestore(user.uid, res.run).catch(() => undefined);
    }
  };

  const handleUpdateNanobot = async (
    botId: string,
    patch: {
      name?: string;
      modelId?: string;
      taskPrompt?: string;
      schedule?: Nanobot['schedule'];
      status?: NanobotStatus;
    }
  ): Promise<void> => {
    const res = await updateNanobotRequest(botId, {
      userId: identity.userId,
      ...patch
    });
    setNanobots((prev) => prev.map((b) => (b.id === res.nanobot.id ? res.nanobot : b)));
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
    }
  };

  const handleDeleteNanobot = async (bot: Nanobot): Promise<void> => {
    await deleteNanobotRequest(bot.id, identity.userId);
    setNanobots((prev) => prev.filter((b) => b.id !== bot.id));
    setNanobotRuns((prev) => prev.filter((r) => r.botId !== bot.id));
    if (isCloudSynced && user) {
      void deleteNanobotFromFirestore(user.uid, bot.id).catch(() => undefined);
    }
  };

  // Ensure resolveActiveWhisper remains validated even when Settings-only picker is used
  resolveActiveWhisper(whisperModels, settings.activeWhisperId);

  return (
    <MotionConfig reducedMotion={motionConfig.reducedMotion} transition={motionConfig.transition}>
      <div
        data-device-frame={isDeviceFrame ? 'true' : 'false'}
        className={`group/app relative w-full liquid-canvas text-zinc-100 flex flex-col font-sans selection:bg-[#0F7FFF]/35 selection:text-white overflow-hidden ${
          isDeviceFrame ? 'min-h-screen items-center justify-center p-2 sm:p-6' : 'h-screen'
        }`}
      >
        <div
          className={
            isDeviceFrame
              ? 'relative z-10 w-full max-w-[422px] h-[874px] max-h-[96vh] rounded-[54px] p-[3px] bg-gradient-to-b from-zinc-600/80 via-zinc-900 to-zinc-700/80 shadow-[0_32px_90px_-16px_rgba(0,0,0,0.92)] flex flex-col overflow-hidden my-auto'
              : 'relative z-10 flex-1 min-h-0 flex flex-col h-full overflow-hidden'
          }
        >
          <div
            className={
              isDeviceFrame
                ? 'relative w-full h-full rounded-[51px] bg-black p-2.5 flex flex-col overflow-hidden'
                : 'flex-1 min-h-0 flex flex-col h-full overflow-hidden'
            }
          >
            {isDeviceFrame && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[106px] h-[28px] bg-black rounded-full z-50 border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center justify-end pr-2.5 pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-white/10" />
              </div>
            )}

            <div
              className={
                isDeviceFrame
                  ? 'relative w-full h-full rounded-[42px] overflow-hidden isolate [transform:translateZ(0)] liquid-canvas flex flex-col border border-white/12'
                  : 'flex-1 min-h-0 flex flex-col h-full overflow-hidden'
              }
            >
            <main
              className={`@container flex-1 min-h-0 overflow-hidden relative ${
                isDeviceFrame ? 'pt-10' : 'pt-0.5'
              }`}
            >
              {/* Completed Nanobot Notification Banner */}
              <AnimatePresence>
                {!showOnboarding && botNotificationToast && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="absolute top-11 left-3 right-3 z-40 p-2.5 rounded-2xl liquid-glass-elevated border border-emerald-400/35 flex items-center justify-between gap-2 text-xs shadow-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-zinc-100 truncate block">
                        Nanobot {botNotificationToast.botName} finished ({botNotificationToast.status})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBotNotificationToast(null);
                        setActiveMode('nanoteam');
                      }}
                      className="px-2.5 py-1 rounded-lg liquid-accent-glass text-[11px] font-semibold shrink-0"
                    >
                      Open
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {showOnboarding ? (
                <OnboardingFlow
                  initialStage={onboardingInitialStage}
                  onComplete={handleCompleteOnboarding}
                />
              ) : (
                <AnimatePresence mode="popLayout" initial={false} custom={navDirection}>
                  <motion.div
                    key={activeMode}
                    custom={navDirection}
                    variants={screenVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full w-full"
                  >
                    {activeMode === 'workspace' && (
                      <UnifiedWorkspaceView
                        selectedModel={activeLlm}
                        offlineOnly={settings.offlineOnly}
                        coreDataStore={coreDataStore}
                        onToggleOffline={() => handleUpdateSettings({ offlineOnly: !settings.offlineOnly })}
                        onIngestToNotebook={handleIngestSparkpage}
                        onIngestToCoreData={handleIngestDocumentToCoreData}
                        onSaveToDrive={handleSaveToDrive}
                        genTeamAgents={genTeamAgents}
                        genTeamChannels={genTeamChannels}
                        genTeamMessages={genTeamMessages}
                        genTeamTasks={genTeamTasks}
                        onGenTeamAgentsChange={setGenTeamAgents}
                        onGenTeamChannelsChange={setGenTeamChannels}
                        onGenTeamMessagesChange={setGenTeamMessages}
                        onGenTeamTasksChange={setGenTeamTasks}
                        identity={identity}
                        nanobots={nanobots}
                        nanobotRuns={nanobotRuns}
                        onReleaseNanobot={handleReleaseNanobot}
                        onRerunNanobot={handleRerunNanobot}
                        onUpdateNanobot={handleUpdateNanobot}
                        onDeleteNanobot={handleDeleteNanobot}
                        requestedSubTab={requestedWorkspaceSubTab}
                        requestedCrewView={requestedCrewView}
                        requestedNonce={requestedWorkspaceNonce}
                      />
                    )}
                    {activeMode === 'meetings' && (
                      <MeetingNotesView
                        onSendNotesToVault={handleIngestSparkpage}
                        onOpenInStudio={handleOpenInStudio}
                        onOpenSettings={() => handleOpenSettingsBucket()}
                        onOpenApiKeys={handleOpenApiKeys}
                        settings={settings}
                        driveFiles={driveFiles}
                        onSaveToDrive={handleSaveToDrive}
                        onDeleteFromDrive={handleDeleteFromDrive}
                        dictionaryEntries={dictionaryEntries}
                        whisperModels={whisperModels}
                        onLearnTerms={handleLearnTerms}
                        sessions={meetingSessions}
                        onSessionsChange={setMeetingSessions}
                        baseSessionId={meetingBaseId}
                        onBaseSessionIdChange={setMeetingBaseId}
                        currentSessionId={meetingCurrentId}
                        onCurrentSessionIdChange={setMeetingCurrentId}
                        incomingDriveFile={incomingDriveFile}
                        onClearIncomingDriveFile={() => setIncomingDriveFile(null)}
                      />
                    )}
                    {activeMode === 'studio' && (
                      <StudioView
                        settings={settings}
                        meetingSessions={meetingSessions}
                        dictionaryEntries={dictionaryEntries}
                        seedSession={studioSeedSession}
                        onOpenSettings={() => handleOpenSettingsBucket('system')}
                        onOpenApiKeys={handleOpenApiKeys}
                      />
                    )}
                    {activeMode === 'notebook' && (
                      <NotebookLMView
                        incomingSparkpage={ingestedSparkpage}
                        defaultTtsMode={settings.ttsEngine}
                        onChangeTtsMode={(mode) => handleUpdateSettings({ ttsEngine: mode })}
                        voiceProfile={settings.voiceProfile}
                        onOpenVoiceSettings={() => handleOpenSettingsBucket('voice')}
                        coreDataStore={coreDataStore}
                        localModel={activeLlm}
                        offlineOnly={settings.offlineOnly}
                        onIngestToCoreData={handleIngestDocumentToCoreData}
                        onDeleteFromCoreData={handleDeleteCoreDataDocument}
                      />
                    )}
                    {activeMode === 'settings' && (
                      <SettingsView
                        settings={settings}
                        llmModels={llmModels}
                        whisperModels={whisperModels}
                        driveFiles={driveFiles}
                        dictionaryEntries={dictionaryEntries}
                        identity={identity}
                        callsigns={callsigns}
                        isDeviceFrame={isDeviceFrame}
                        onToggleDeviceFrame={() => setIsDeviceFrame(!isDeviceFrame)}
                        onUpdateSettings={handleUpdateSettings}
                        onUpdateDictionary={handleUpdateDictionary}
                        onOpenModelPicker={handleOpenModelPicker}
                        onOpenApiKeys={handleOpenApiKeys}
                        onSaveToDrive={handleSaveToDrive}
                        onDeleteFromDrive={handleDeleteFromDrive}
                        onOpenDriveFileInMeetings={handleOpenDriveFileInMeetings}
                        onCreateCallsign={handleCreateCallsign}
                        onUpdateCallsign={handleUpdateCallsign}
                        onDeleteCallsign={handleDeleteCallsign}
                        onReplayOnboarding={handleReplayOnboarding}
                        requestedBucket={requestedSettingsBucket}
                        requestedBucketNonce={requestedSettingsNonce}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </main>

            {isDeviceFrame && (
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-white/30 rounded-full z-50 pointer-events-none" />
            )}

            {!showOnboarding && (
              <TabBar
                activeMode={activeMode}
                onChangeMode={setActiveMode}
                isContained={isDeviceFrame}
              />
            )}
            </div>
          </div>
        </div>

        <ModelPickerModal
          isOpen={pickerState.isOpen}
          onClose={() => setPickerState(prev => ({ ...prev, isOpen: false }))}
          llmModels={llmModels}
          whisperModels={whisperModels}
          activeLlmId={settings.activeLlmId}
          activeWhisperId={settings.activeWhisperId}
          initialSection={pickerState.section}
          downloadingModelId={downloadingModelId}
          onSelectLlm={(id) => handleUpdateSettings({ activeLlmId: id })}
          onSelectWhisper={(id) => handleUpdateSettings({ activeWhisperId: id })}
          onDownloadLlm={handleDownloadLlm}
          onDownloadWhisper={handleDownloadWhisper}
        />

        <ApiKeysModal
          isOpen={apiKeyModalState.isOpen}
          onClose={() => setApiKeyModalState(prev => ({ ...prev, isOpen: false }))}
          settings={settings}
          focusProvider={apiKeyModalState.focusProvider}
          onUpdateSettings={handleUpdateSettings}
        />
      </div>
    </MotionConfig>
  );
}
