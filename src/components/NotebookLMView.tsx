import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Download,
  FileText,
  Headphones,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  LocalDocument,
  ModelOption,
  PodcastEpisode,
  RagStrategyId,
  RagSynthesisResult,
  SparkpageData,
  UploadedAssetKind,
  VoiceProfileConfig
} from '../types/index.ts';
import { AVAILABLE_MODELS, SAMPLE_PODCAST_EPISODES } from '../data/mockData.ts';
import {
  createEpisodeOverviewWavBytes,
  sanitizeDownloadBaseName
} from '../utils/audioConversion.ts';
import {
  generateDualHostScriptFromDocument,
  resolvePodcastVoiceProfile
} from '../utils/audioSynthesis.ts';
import {
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  toLocalDocument,
  upsertCoreDataDocument
} from '../utils/coreDataVectorDb.ts';
import {
  RAG_STRATEGIES,
  executeRagRetrieval,
  getRagStrategySpec,
  synthesizeRagAnswerWithLocalLlm
} from '../utils/ragEngine.ts';
import {
  executeFullRagPipeline,
  parseDocumentFileViaBackendOrClient
} from '../utils/ragClient.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants,
  buildTabVariants,
  getTabTransitionDirection
} from '../utils/motion.ts';
import { AudioDownloadSource, AudioFormatDownloadModal } from './AudioFormatDownloadModal.tsx';
import { SkeletonStreamLoader } from './MotionPrimitives.tsx';
import { TranscriptDetailView } from './TranscriptDetailView.tsx';
import { TranscriptFormatDownloadModal } from './TranscriptFormatDownloadModal.tsx';

interface NotebookLMViewProps {
  incomingSparkpage?: SparkpageData | null;
  defaultTtsMode?: 'on-device' | 'secure-cloud';
  onChangeTtsMode?: (mode: 'on-device' | 'secure-cloud') => void;
  voiceProfile?: VoiceProfileConfig;
  onOpenVoiceSettings?: () => void;
  coreDataStore?: CoreDataVectorStoreState;
  localModel?: ModelOption;
  offlineOnly?: boolean;
  onIngestToCoreData?: (input: {
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
  }) => Promise<CoreDataManagedDocument>;
  onDeleteFromCoreData?: (docId: string) => Promise<void>;
}

const NOTEBOOK_TABS = ['podcast', 'rag-qa', 'vault'] as const;
type NotebookTab = (typeof NOTEBOOK_TABS)[number];

export const NotebookLMView: React.FC<NotebookLMViewProps> = ({
  incomingSparkpage,
  defaultTtsMode,
  onChangeTtsMode,
  voiceProfile,
  onOpenVoiceSettings,
  coreDataStore: externalCoreDataStore,
  localModel,
  offlineOnly = false,
  onIngestToCoreData,
  onDeleteFromCoreData
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const tabVariants = buildTabVariants(prefersReduced);
  const listItemVariants = buildListItemVariants(prefersReduced);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const vaultFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeLocalModel = localModel || AVAILABLE_MODELS[0];
  const [fallbackStore, setFallbackStore] = useState<CoreDataVectorStoreState>(() =>
    createInitialCoreDataStore()
  );
  const activeStore = externalCoreDataStore || fallbackStore;
  const documents: LocalDocument[] = useMemo(
    () => activeStore.documents.map(toLocalDocument),
    [activeStore.documents]
  );

  const [[activeTab, tabDirection], setTabState] = useState<[NotebookTab, 1 | -1]>([
    'podcast',
    1
  ]);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>(SAMPLE_PODCAST_EPISODES);
  // Collapsed by default until user taps/selects an audio file
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const selectedEpisode = useMemo(
    () => (selectedEpisodeId ? episodes.find((ep) => ep.id === selectedEpisodeId) || null : null),
    [episodes, selectedEpisodeId]
  );

  const [[transcriptEpisodeId, transcriptDirection], setTranscriptScreenState] = useState<
    [string | null, 1 | -1]
  >([null, 1]);
  const [downloadSource, setDownloadSource] = useState<AudioDownloadSource | null>(null);
  const [transcriptDownloadTarget, setTranscriptDownloadTarget] = useState<{
    episode: PodcastEpisode;
    filteredTurnIndices?: number[];
  } | null>(null);

  const setActiveTab = (next: NotebookTab) => {
    if (next === 'podcast' && activeTab === 'podcast' && transcriptEpisodeId !== null) {
      setTranscriptScreenState([null, -1]);
      return;
    }
    if (next !== 'podcast' && transcriptEpisodeId !== null) {
      setTranscriptScreenState([null, -1]);
    }
    setTabState(([prev]) => {
      if (prev === next) return [prev, 1];
      return [next, getTabTransitionDirection(NOTEBOOK_TABS, prev, next)];
    });
  };

  const openTranscriptForEpisode = (ep: PodcastEpisode) => {
    if (selectedEpisodeId !== ep.id) {
      setSelectedEpisodeId(ep.id);
      setCurrentTurnIndex(0);
    }
    setTranscriptScreenState([ep.id, 1]);
  };

  const closeTranscriptScreen = () => {
    setTranscriptScreenState([null, -1]);
  };

  const openDownloadModalForEpisode = (ep: PodcastEpisode) => {
    setDownloadSource({
      title: ep.title,
      subtitle: `~${ep.durationMinutes} min · ${ep.dialogue.length} turns`,
      baseName: sanitizeDownloadBaseName(ep.title),
      sourceExt: 'wav',
      getSourceBytes: async () => createEpisodeOverviewWavBytes(ep)
    });
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const [ragQuery, setRagQuery] = useState('');
  const [ragStrategyId, setRagStrategyId] = useState<RagStrategyId>('hybrid-rrf');
  const [ragFilterDocId, setRagFilterDocId] = useState<string>('all');
  const [isQueryingRag, setIsQueryingRag] = useState(false);
  const [expandedRagIndices, setExpandedRagIndices] = useState<Record<number, boolean>>({ 0: true });
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isDraggingVault, setIsDraggingVault] = useState(false);
  const [vaultUploadNotice, setVaultUploadNotice] = useState<string | null>(null);

  const [ragResults, setRagResults] = useState<RagSynthesisResult[]>(() => {
    const seedStore = createInitialCoreDataStore();
    const initialQuery = 'How are automatic reserves posted at FNOL in ClaimCenter?';
    const retrieval = executeRagRetrieval(seedStore, initialQuery, {
      strategyId: 'hybrid-rrf',
      topK: 3,
      offlineOnly: false
    });
    return [
      synthesizeRagAnswerWithLocalLlm({
        query: initialQuery,
        strategyId: 'hybrid-rrf',
        localModel: AVAILABLE_MODELS[0],
        retrievedChunks: retrieval.retrieved,
        pipelineSteps: retrieval.pipelineSteps,
        confidenceScore: retrieval.confidenceScore,
        cloudSearchTriggered: retrieval.shouldTriggerCloudFallback,
        latencyMs: 112
      })
    ];
  });

  useEffect(() => {
    if (!incomingSparkpage) return;
    if (onIngestToCoreData) return;
    const sections = incomingSparkpage.sections.map((s) => ({
      label: s.title,
      text: `${s.summary}\n${s.content}`
    }));
    setFallbackStore((prev) => {
      const id = `doc-${incomingSparkpage.id}`;
      if (prev.documents.some((d) => d.id === id)) return prev;
      return upsertCoreDataDocument(prev, {
        id,
        title: `${incomingSparkpage.title.slice(0, 42)}.md`,
        format: 'Markdown',
        assetKind: 'document',
        sizeKB: 320,
        summary: incomingSparkpage.subtitle,
        text: sections.map((s) => s.text).join('\n\n'),
        sections,
        tags: ['Sparkpage', 'Cloud Search']
      }).nextStore;
    });
  }, [incomingSparkpage, onIngestToCoreData]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [transcriptEpisodeId, activeTab]);

  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const resolvedVoice = resolvePodcastVoiceProfile(voiceProfile);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPlaying && selectedEpisode) {
      const currentTurn = selectedEpisode.dialogue[currentTurnIndex];
      const turnDuration = (currentTurn?.durationSec || 10) / playbackSpeed;

      if ('speechSynthesis' in window && !isAudioMuted && currentTurn) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentTurn.text);
        const isHostAlex = currentTurn.speaker === 'Alex';
        utterance.rate = (isHostAlex ? resolvedVoice.alexRate : resolvedVoice.mayaRate) * playbackSpeed;
        utterance.pitch = isHostAlex ? resolvedVoice.alexPitch : resolvedVoice.mayaPitch;
        window.speechSynthesis.speak(utterance);
        speechUtteranceRef.current = utterance;
      }

      timer = setTimeout(() => {
        if (currentTurnIndex < selectedEpisode.dialogue.length - 1) {
          setCurrentTurnIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
          setCurrentTurnIndex(0);
        }
      }, turnDuration * 1000);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    return () => {
      clearTimeout(timer);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying, currentTurnIndex, selectedEpisode, playbackSpeed, isAudioMuted]);

  const handleTurnClick = (index: number) => {
    setCurrentTurnIndex(index);
    if (!isPlaying) setIsPlaying(true);
  };

  const handleSelectEpisode = (ep: PodcastEpisode, autoPlay = false) => {
    if (selectedEpisodeId === ep.id) {
      if (autoPlay) setIsPlaying(prev => !prev);
      return;
    }
    setSelectedEpisodeId(ep.id);
    setCurrentTurnIndex(0);
    setIsPlaying(autoPlay);
  };

  const handleGenerateNewPodcast = (doc: LocalDocument) => {
    const turns = generateDualHostScriptFromDocument(doc);
    const newEpisode: PodcastEpisode = {
      id: `ep-${Date.now()}`,
      title: doc.title.replace(/\.[^/.]+$/, ''),
      subtitle: '',
      topic: doc.tags[0] || 'Brief',
      durationMinutes: 1.5,
      hosts: {
        alex: {
          name: resolvedVoice.hostAlexLabel,
          voice: 'Host',
          tone: 'Host'
        },
        maya: {
          name: resolvedVoice.hostMayaLabel,
          voice: 'Co-Host',
          tone: 'Co-Host'
        }
      },
      coverGradient: 'from-zinc-800 to-zinc-900',
      sourceDocumentIds: [doc.id],
      dialogue: turns
    };

    setEpisodes(prev => [newEpisode, ...prev]);
    setSelectedEpisodeId(newEpisode.id);
    setTranscriptScreenState([null, -1]);
    setCurrentTurnIndex(0);
    setIsPlaying(true);
    setActiveTab('podcast');
    triggerHaptic('success');
  };

  const ingestDocumentFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsUploadingDocs(true);
    setVaultUploadNotice(null);
    triggerHaptic('selection');

    let indexedCount = 0;
    let totalNewChunks = 0;
    let lastTitle = '';

    try {
      for (const file of files) {
        const parsed = await parseDocumentFileViaBackendOrClient(file);
        const inputPayload = {
          title: file.name,
          format: parsed.format,
          assetKind: 'document' as const,
          sizeKB: Math.max(1, Math.round((file.size || parsed.extractedText.length) / 1024)),
          text: parsed.extractedText,
          sections: parsed.sections,
          tags: parsed.tags,
          dateAdded: 'Just now'
        };

        if (onIngestToCoreData) {
          const doc = await onIngestToCoreData(inputPayload);
          totalNewChunks += doc?.chunkCount || parsed.sectionCount;
        } else {
          setFallbackStore((prev) => {
            const { nextStore, chunks } = upsertCoreDataDocument(prev, inputPayload);
            totalNewChunks += chunks.length;
            return nextStore;
          });
        }
        indexedCount += 1;
        lastTitle = file.name;
      }

      setVaultUploadNotice(
        `Indexed ${indexedCount} file${indexedCount === 1 ? '' : 's'} (${lastTitle}) -> ${totalNewChunks} CoreData ${activeStore.embeddingDim}-d vectors stored.`
      );
      triggerHaptic('success');
    } finally {
      setIsUploadingDocs(false);
    }
  };

  const handleDeleteVaultDoc = async (docId: string) => {
    triggerHaptic('medium');
    if (onDeleteFromCoreData) {
      await onDeleteFromCoreData(docId);
    } else {
      setFallbackStore((prev) => deleteCoreDataDocument(prev, docId));
    }
    if (ragFilterDocId === docId) {
      setRagFilterDocId('all');
    }
  };

  const handleRagSubmit = async () => {
    const query = ragQuery.trim();
    if (!query || isQueryingRag) return;
    setRagQuery('');
    setIsQueryingRag(true);
    triggerHaptic('medium');

    try {
      const result = await executeFullRagPipeline({
        store: activeStore,
        query,
        strategyId: ragStrategyId,
        localModel: activeLocalModel,
        topK: 4,
        filterDocumentId: ragFilterDocId === 'all' ? null : ragFilterDocId,
        offlineOnly
      });
      setRagResults((prev) => [result, ...prev]);
      setExpandedRagIndices((prev) => {
        const shifted: Record<number, boolean> = { 0: true };
        Object.entries(prev).forEach(([k, v]) => {
          shifted[Number(k) + 1] = v;
        });
        return shifted;
      });
      triggerHaptic('success');
    } finally {
      setIsQueryingRag(false);
    }
  };

  const activeTurn = selectedEpisode
    ? selectedEpisode.dialogue[currentTurnIndex] || selectedEpisode.dialogue[0]
    : null;
  const transcriptEpisode = transcriptEpisodeId
    ? episodes.find(ep => ep.id === transcriptEpisodeId) || selectedEpisode
    : null;

  // Preserve unused optional callbacks in props signature without rendering removed TTS/Voice chrome
  void defaultTtsMode;
  void onChangeTtsMode;
  void onOpenVoiceSettings;

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-col h-full max-w-4xl mx-auto w-full px-3 @xl:px-5 py-3 pb-24 overflow-y-auto"
    >
      {/* Clean Sub-navigation (No AVSpeech / Cloud TTS toggle clutter) */}
      <div className="flex items-center justify-center p-2 rounded-2xl liquid-glass mb-3">
        <div className="grid grid-cols-3 gap-1 w-full p-1 liquid-glass-subtle rounded-full">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => setActiveTab('podcast')}
            className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'podcast'
                ? 'text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {activeTab === 'podcast' && (
              <motion.span
                layoutId="notebook-subtab-pill"
                transition={MOTION_SPRINGS.pill}
                aria-hidden="true"
                className="absolute inset-0 rounded-full liquid-lens-active"
              />
            )}
            <Headphones className="relative z-10 w-3.5 h-3.5 shrink-0" />
            <span className="relative z-10">Audio</span>
          </motion.button>
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => setActiveTab('rag-qa')}
            className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'rag-qa'
                ? 'text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {activeTab === 'rag-qa' && (
              <motion.span
                layoutId="notebook-subtab-pill"
                transition={MOTION_SPRINGS.pill}
                aria-hidden="true"
                className="absolute inset-0 rounded-full liquid-lens-active"
              />
            )}
            <BookOpen className="relative z-10 w-3.5 h-3.5 shrink-0" />
            <span className="relative z-10">RAG Q&A</span>
          </motion.button>
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => setActiveTab('vault')}
            className={`relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'vault'
                ? 'text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {activeTab === 'vault' && (
              <motion.span
                layoutId="notebook-subtab-pill"
                transition={MOTION_SPRINGS.pill}
                aria-hidden="true"
                className="absolute inset-0 rounded-full liquid-lens-active"
              />
            )}
            <FileText className="relative z-10 w-3.5 h-3.5 shrink-0" />
            <span className="relative z-10">Vault ({documents.length})</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={tabDirection}>
        <motion.div
          key={activeTab}
          custom={tabDirection}
          variants={tabVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="space-y-3"
        >
          {/* VIEW 1: PODCAST / AUDIO OVERVIEWS & SEPARATE TRANSCRIPT SCREEN */}
          {activeTab === 'podcast' && (
            <AnimatePresence mode="wait" initial={false} custom={transcriptDirection}>
              {transcriptEpisode === null ? (
                <motion.div
                  key="audio-overviews-screen"
                  custom={transcriptDirection}
                  variants={tabVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-3"
                >
                  {/* Top Audio Overview Section: Collapsed by default until user selects an audio file */}
                  <AnimatePresence initial={false}>
                    {selectedEpisode && (
                      <motion.div
                        key={`selected-overview-${selectedEpisode.id}`}
                        initial={{ opacity: 0, y: prefersReduced ? 0 : -8 }}
                        animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                        exit={{ opacity: 0, y: prefersReduced ? 0 : -8, transition: MOTION_TRANSITIONS.elementExit }}
                        className="rounded-2xl liquid-glass-elevated p-4 space-y-3.5"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-mono text-zinc-400">
                              Audio Overview · ~{selectedEpisode.durationMinutes} min
                            </div>
                            <h2 className="text-base font-semibold text-zinc-100 mt-0.5 tracking-tight leading-snug">
                              {selectedEpisode.title}
                            </h2>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPlaying(false);
                              setSelectedEpisodeId(null);
                              triggerHaptic('selection');
                            }}
                            aria-label="Collapse audio overview"
                            title="Collapse audio overview"
                            className="p-1.5 rounded-full liquid-glass-subtle text-zinc-300 hover:text-white hover:bg-white/15 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Minimal Waveform */}
                        <div className="flex items-center justify-center gap-1 h-10 liquid-glass-subtle rounded-2xl px-3">
                          {Array.from({ length: 34 }).map((_, i) => {
                            const isCurrent =
                              Math.floor((i / 34) * selectedEpisode.dialogue.length) ===
                              currentTurnIndex;
                            const scaleY =
                              isPlaying && isCurrent
                                ? 0.55 + Math.sin(i * 0.8) * 0.35
                                : 0.25 + (i % 4) * 0.1;

                            return (
                              <div
                                key={i}
                                style={{ transform: `scaleY(${scaleY.toFixed(2)})` }}
                                className={`w-1 h-6 origin-center rounded-full transition-transform duration-150 ${
                                  isCurrent
                                    ? 'bg-[#2B98FF]'
                                    : i < (currentTurnIndex / selectedEpisode.dialogue.length) * 34
                                      ? 'bg-sky-300/60'
                                      : 'bg-white/15'
                                }`}
                              />
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-400">
                          <span>
                            Turn {currentTurnIndex + 1}/{selectedEpisode.dialogue.length}
                          </span>
                          <span className="text-zinc-100">{activeTurn?.speaker}</span>
                          <span>{playbackSpeed}x</span>
                        </div>

                        {/* Player Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <motion.button
                              type="button"
                              data-haptic="selection"
                              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                              transition={MOTION_SPRINGS.interactive}
                              onClick={() => {
                                if (currentTurnIndex > 0) setCurrentTurnIndex(prev => prev - 1);
                              }}
                              aria-label="Previous turn"
                              className="p-2 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </motion.button>

                            <motion.button
                              type="button"
                              data-haptic="selection"
                              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                              transition={MOTION_SPRINGS.interactive}
                              onClick={() => setIsPlaying(!isPlaying)}
                              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                              className="flex items-center justify-center w-10 h-10 rounded-full liquid-accent-glass transition-opacity hover:opacity-95"
                            >
                              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </motion.button>

                            <motion.button
                              type="button"
                              data-haptic="selection"
                              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                              transition={MOTION_SPRINGS.interactive}
                              onClick={() => {
                                if (currentTurnIndex < selectedEpisode.dialogue.length - 1) {
                                  setCurrentTurnIndex(prev => prev + 1);
                                }
                              }}
                              aria-label="Next turn"
                              className="p-2 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                            >
                              <RotateCw className="w-4 h-4" />
                            </motion.button>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1.0, 1.25, 1.5].map((s) => {
                              const active = playbackSpeed === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setPlaybackSpeed(s)}
                                  className={`px-2 py-1 rounded-full text-[11px] font-mono transition-colors ${
                                    active
                                      ? 'liquid-lens-active text-zinc-950 font-semibold'
                                      : 'text-zinc-400 hover:text-zinc-100'
                                  }`}
                                >
                                  {s}x
                                </button>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() => setIsAudioMuted(!isAudioMuted)}
                              aria-label={isAudioMuted ? 'Unmute Voice' : 'Mute Voice'}
                              className="p-2 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-300 hover:text-white transition-colors ml-0.5"
                            >
                              {isAudioMuted ? (
                                <VolumeX className="w-4 h-4 text-red-400" />
                              ) : (
                                <Volume2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Top Overview Action Bar: Open Transcript + Download Audio + Download Transcript */}
                        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-2">
                          <motion.button
                            type="button"
                            data-haptic="selection"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() => openTranscriptForEpisode(selectedEpisode)}
                            aria-label={`View transcript for ${selectedEpisode.title}`}
                            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap"
                          >
                            <MessageSquareText className="w-3.5 h-3.5 text-[#54B0FF]" />
                            <span>Transcript ({selectedEpisode.dialogue.length})</span>
                          </motion.button>

                          <motion.button
                            type="button"
                            data-haptic="selection"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() => openDownloadModalForEpisode(selectedEpisode)}
                            aria-label={`Download ${selectedEpisode.title} audio in multiple formats`}
                            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5 text-[#54B0FF]" />
                            <span>Download Audio</span>
                          </motion.button>

                          <motion.button
                            type="button"
                            data-haptic="selection"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() =>
                              setTranscriptDownloadTarget({ episode: selectedEpisode })
                            }
                            aria-label={`Download ${selectedEpisode.title} transcript in multiple formats`}
                            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#54B0FF]" />
                            <span>Download Transcript</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Clean Audio Overviews Directory (No specs/model clutter, no per-row download buttons) */}
                  <section aria-label="Audio overviews library" className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-medium text-zinc-400">
                        {selectedEpisode ? 'Audio Overviews' : 'Select an audio file to play or download'}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                        {episodes.length} files
                      </span>
                    </div>

                    <div className="space-y-2">
                      {episodes.map((ep, idx) => {
                        const isSelected = ep.id === selectedEpisodeId;
                        const isThisPlaying = isSelected && isPlaying;
                        return (
                          <motion.div
                            key={ep.id}
                            layout="position"
                            custom={idx}
                            variants={listItemVariants}
                            initial="initial"
                            animate="animate"
                            className={`rounded-2xl p-3.5 transition-colors ${
                              isSelected
                                ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/10'
                                : 'liquid-glass'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <motion.button
                                  type="button"
                                  data-haptic="selection"
                                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                                  transition={MOTION_SPRINGS.interactive}
                                  onClick={() => handleSelectEpisode(ep, true)}
                                  aria-label={
                                    isThisPlaying ? `Pause ${ep.title}` : `Play ${ep.title}`
                                  }
                                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-95 ${
                                    isSelected ? 'liquid-accent-glass' : 'liquid-glass-subtle text-zinc-200'
                                  }`}
                                >
                                  {isThisPlaying ? (
                                    <Pause className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4 ml-0.5" />
                                  )}
                                </motion.button>

                                <button
                                  type="button"
                                  data-haptic="selection"
                                  onClick={() => {
                                    handleSelectEpisode(ep, false);
                                    scrollContainerRef.current?.scrollTo({
                                      top: 0,
                                      behavior: prefersReduced ? 'auto' : 'smooth'
                                    });
                                  }}
                                  aria-label={`Select ${ep.title} audio overview`}
                                  className="min-w-0 flex-1 text-left focus-visible:outline-hidden"
                                >
                                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                                    <span>~{ep.durationMinutes} min</span>
                                    <span>·</span>
                                    <span>{ep.dialogue.length} turns</span>
                                  </div>
                                  <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug mt-0.5 truncate">
                                    {ep.title}
                                  </h3>
                                </button>
                              </div>

                              <motion.button
                                type="button"
                                data-haptic="selection"
                                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                                transition={MOTION_SPRINGS.interactive}
                                onClick={() => openTranscriptForEpisode(ep)}
                                aria-label={`Open transcript for ${ep.title}`}
                                className="min-h-[36px] flex items-center gap-1 px-2.5 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                              >
                                <MessageSquareText className="w-3.5 h-3.5 text-[#54B0FF]" />
                                <span>Transcript</span>
                              </motion.button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </section>
                </motion.div>
              ) : (
                <motion.div
                  key={`audio-transcript-${transcriptEpisode.id}`}
                  custom={transcriptDirection}
                  variants={tabVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <TranscriptDetailView
                    episode={transcriptEpisode}
                    isEpisodeSelected={selectedEpisodeId === transcriptEpisode.id}
                    isPlaying={isPlaying}
                    activeTurnIndex={currentTurnIndex}
                    hostAlexLabel={resolvedVoice.hostAlexLabel}
                    hostMayaLabel={resolvedVoice.hostMayaLabel}
                    onBack={closeTranscriptScreen}
                    onTogglePlay={() => handleSelectEpisode(transcriptEpisode, true)}
                    onSelectTurn={(idx) => {
                      if (selectedEpisodeId !== transcriptEpisode.id) {
                        setSelectedEpisodeId(transcriptEpisode.id);
                      }
                      handleTurnClick(idx);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* VIEW 2: RAG Q&A (CoreData Vector DB + Local LLM Synthesis) */}
          {activeTab === 'rag-qa' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl liquid-glass space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-400">
                  <div className="flex items-center gap-1.5 text-zinc-200">
                    <Database className="w-3.5 h-3.5 text-[#54B0FF]" />
                    <span>CoreData Cloud Vector DB · {activeStore.chunks.length} vectors</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{activeLocalModel.name}</span>
                  </div>
                </div>

                {/* RAG Strategy + Document Scope Controls */}
                <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {RAG_STRATEGIES.map((strategy) => {
                      const active = ragStrategyId === strategy.id;
                      return (
                        <button
                          key={strategy.id}
                          type="button"
                          onClick={() => setRagStrategyId(strategy.id)}
                          aria-pressed={active}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'liquid-lens-active text-zinc-950 font-semibold'
                              : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                          }`}
                        >
                          {strategy.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  <select
                    aria-label="Filter CoreData document scope"
                    value={ragFilterDocId}
                    onChange={(e) => setRagFilterDocId(e.target.value)}
                    className="liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-[11px] text-zinc-100 focus:outline-hidden shrink-0 max-w-full @xl:max-w-[210px]"
                  >
                    <option value="all" className="bg-zinc-900">
                      All CoreData Docs ({documents.length})
                    </option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id} className="bg-zinc-900">
                        {doc.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    aria-label="Ask grounded question from CoreData vault"
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleRagSubmit()}
                    placeholder={`Query CoreData vectors (${getRagStrategySpec(ragStrategyId).shortLabel})...`}
                    className="flex-1 min-w-0 liquid-glass-subtle rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
                  />
                  <motion.button
                    type="button"
                    data-haptic="off"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => void handleRagSubmit()}
                    disabled={!ragQuery.trim() || isQueryingRag}
                    className="min-h-[40px] px-4 py-2 rounded-full liquid-accent-glass text-xs font-semibold transition-opacity hover:opacity-95 disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    Run RAG
                  </motion.button>
                </div>
              </div>

              <div className="space-y-2.5">
                <AnimatePresence>
                  {isQueryingRag && (
                    <SkeletonStreamLoader
                      key="rag-query-skeleton"
                      label={`Retrieving CoreData chunks & synthesizing on ${activeLocalModel.name}...`}
                      lines={3}
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {ragResults.map((item, i) => {
                    const detailsOpen = expandedRagIndices[i] ?? false;
                    return (
                      <motion.div
                        key={`${item.query}-${ragResults.length - i}`}
                        layout="position"
                        custom={i}
                        variants={listItemVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="p-4 rounded-2xl liquid-glass space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs sm:text-sm font-semibold text-zinc-100">
                            {item.query}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-300">
                            <span className="text-[#54B0FF]">{item.strategyLabel}</span>
                            <span>·</span>
                            <span className="text-emerald-400">{item.confidenceScore}%</span>
                            <span>·</span>
                            <span>{item.latencyMs}ms</span>
                          </div>
                        </div>

                        <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {item.answer}
                        </div>

                        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {item.retrievedChunks.length > 0
                                ? item.retrievedChunks
                                    .map((c) => `${c.documentTitle} (${c.sectionLabel})`)
                                    .join(' · ')
                                : 'No local chunk above threshold'}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRagIndices((prev) => ({
                                ...prev,
                                [i]: !detailsOpen
                              }))
                            }
                            className="flex items-center gap-1 text-[#54B0FF] hover:text-sky-300 whitespace-nowrap"
                          >
                            <span>CoreData Chunks ({item.retrievedChunks.length})</span>
                            {detailsOpen ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {detailsOpen && (
                          <div className="space-y-2 pt-1">
                            <div className="p-2.5 rounded-xl liquid-glass-subtle space-y-1 text-[11px] font-mono text-zinc-300">
                              {item.pipelineSteps.map((step, sIdx) => (
                                <div key={sIdx}>{step}</div>
                              ))}
                            </div>
                            {item.retrievedChunks.map((chunk) => (
                              <div
                                key={chunk.chunkId}
                                className="p-2.5 rounded-xl liquid-glass-subtle space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                  <span className="font-semibold text-zinc-100 truncate">
                                    {chunk.documentTitle} · {chunk.sectionLabel}
                                  </span>
                                  <span className="text-emerald-400 tabular-nums shrink-0">
                                    fused {chunk.fusedScore.toFixed(2)} · cos{' '}
                                    {chunk.vectorScore.toFixed(2)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-300 leading-relaxed">
                                  {chunk.text}
                                </p>
                                <div className="text-[10px] font-mono text-zinc-500 truncate">
                                  {chunk.chunkId}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* VIEW 3: VAULT (PDF, TXT, EPUB Upload + CoreData Cloud Vector DB) */}
          {activeTab === 'vault' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isDraggingVault) setIsDraggingVault(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsDraggingVault(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingVault(false);
                if (e.dataTransfer.files?.length) {
                  void ingestDocumentFiles(e.dataTransfer.files);
                }
              }}
              className="space-y-3"
            >
              <input
                ref={vaultFileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.epub,.md,application/pdf,text/plain,application/epub+zip"
                aria-label="Upload PDF, TXT, or EPUB documents to CoreData"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void ingestDocumentFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />

              <div
                className={`p-4 rounded-2xl liquid-glass transition-colors space-y-3 ${
                  isDraggingVault ? 'border-2 border-dashed border-[#54B0FF]' : ''
                }`}
              >
                <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-100">
                      <Database className="w-4 h-4 text-[#54B0FF] shrink-0" />
                      <span>CoreData Cloud Vector DB</span>
                      <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                        {activeStore.embeddingDim}-d CloudKit Synced
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate">
                      {activeStore.zoneName} · {documents.length} docs · {activeStore.chunks.length} vectors
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    data-haptic="medium"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => vaultFileInputRef.current?.click()}
                    disabled={isUploadingDocs}
                    className="min-h-[40px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-full liquid-accent-glass text-xs font-semibold transition-opacity hover:opacity-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingDocs ? 'Indexing...' : 'Upload PDF / TXT / EPUB'}</span>
                  </motion.button>
                </div>

                {vaultUploadNotice && (
                  <div className="px-3 py-2 rounded-xl liquid-glass-subtle text-[11px] font-mono text-emerald-300 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{vaultUploadNotice}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
                <AnimatePresence initial={false}>
                  {documents.map((doc, idx) => (
                    <motion.div
                      key={doc.id}
                      layout="position"
                      custom={idx}
                      variants={listItemVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="p-4 rounded-2xl liquid-glass flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1.5 tabular-nums">
                          <span>
                            {doc.format} ·{' '}
                            {doc.sizeKB >= 1024
                              ? `${(doc.sizeKB / 1024).toFixed(1)} MB`
                              : `${doc.sizeKB} KB`}
                          </span>
                          <span>
                            {doc.chunkCount} {doc.chunkCount === 1 ? 'chunk' : 'chunks'} · {doc.embeddingDim || 128}-d
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-zinc-100 leading-snug">
                          {doc.title}
                        </h4>
                        <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{doc.summary}</p>
                        {doc.coreDataRecordId && (
                          <div className="text-[10px] font-mono text-zinc-500 truncate mt-1.5">
                            {doc.coreDataRecordId}
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-zinc-400 truncate">
                          {doc.tags.slice(0, 2).join(' · ')}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <motion.button
                            type="button"
                            data-haptic="selection"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() => {
                              setRagFilterDocId(doc.id);
                              setActiveTab('rag-qa');
                            }}
                            className="min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 font-medium whitespace-nowrap shrink-0"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-[#54B0FF]" />
                            <span>Ask RAG</span>
                          </motion.button>

                          <motion.button
                            type="button"
                            data-haptic="off"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() => handleGenerateNewPodcast(doc)}
                            className="min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 font-medium whitespace-nowrap shrink-0"
                          >
                            <Headphones className="w-3.5 h-3.5 text-[#2B98FF]" />
                            <span>Audio</span>
                          </motion.button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteVaultDoc(doc.id)}
                            aria-label={`Remove ${doc.title} from CoreData`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-full liquid-glass-subtle hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AudioFormatDownloadModal
        source={downloadSource}
        onClose={() => setDownloadSource(null)}
      />

      <TranscriptFormatDownloadModal
        episode={transcriptDownloadTarget?.episode ?? null}
        engineLabel={resolvedVoice.engineLabel}
        filteredTurnIndices={transcriptDownloadTarget?.filteredTurnIndices}
        onClose={() => setTranscriptDownloadTarget(null)}
      />
    </div>
  );
};
