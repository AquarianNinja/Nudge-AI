import type {
  ModelOption,
  WhisperModelOption,
  AppSettings,
  ActivityModelOption,
  ChatMessage,
  SparkpageData,
  LocalDocument,
  PodcastEpisode,
  LiveTranscriptionProviderOption,
  DictionaryEntry,
  OpenSourceVoiceMod,
  VoiceTrainingPrompt
} from '../types/index.ts';

export const WHISPER_MODELS: WhisperModelOption[] = [
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    sizeLabel: '547 MB',
    speedLabel: '18x RT',
    accuracyLabel: 'Highest',
    isDownloaded: true
  },
  {
    id: 'whisper-base-en',
    name: 'Whisper Base.en',
    sizeLabel: '142 MB',
    speedLabel: '42x RT',
    accuracyLabel: 'Balanced',
    isDownloaded: true
  },
  {
    id: 'whisper-tiny-en',
    name: 'Whisper Tiny.en',
    sizeLabel: '48 MB',
    speedLabel: '65x RT',
    accuracyLabel: 'Fastest',
    isDownloaded: false
  },
  {
    id: 'apple-neural-speech',
    name: 'Apple Neural Speech',
    sizeLabel: 'System',
    speedLabel: 'Real-time',
    accuracyLabel: 'Native iOS',
    isDownloaded: true
  }
];

export const ACTIVITY_MODELS: ActivityModelOption[] = [
  // Meeting Notes Generation
  {
    id: 'llama-3-8b-mlx-notes',
    activity: 'meetingNotes',
    provider: 'local',
    name: 'Llama 3 8B (MLX Local)',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    summary: 'On-device synthesis with zero network egress'
  },
  {
    id: 'claude-sonnet-4-notes',
    activity: 'meetingNotes',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'High-precision decision & risk extraction'
  },
  {
    id: 'gpt-4o-notes',
    activity: 'meetingNotes',
    provider: 'openai',
    name: 'GPT-4o',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Structured action item & diff synthesis'
  },
  {
    id: 'gemini-4-hydrogen-notes',
    activity: 'meetingNotes',
    provider: 'gemini',
    name: 'Gemini 4 Hydrogen',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Fast long-context session summarization'
  },
  {
    id: 'gemini-4-argon-notes',
    activity: 'meetingNotes',
    provider: 'gemini',
    name: 'Gemini 4 Argon',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Deep architectural & Gosu rule analysis'
  },
  {
    id: 'custom-notes-endpoint',
    activity: 'meetingNotes',
    provider: 'custom',
    name: 'Custom LLM Endpoint',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Self-hosted vLLM / Ollama / enterprise gateway'
  },

  // Audio Transcription + Speaker Identification
  {
    id: 'whisper-fluidaudio-local',
    activity: 'transcription',
    provider: 'local',
    name: 'WhisperKit + FluidAudio Speaker ID',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    speakerIdCapable: true,
    summary: 'On-device ASR with local speaker embeddings'
  },
  {
    id: 'deepgram-nova-3-diarize',
    activity: 'transcription',
    provider: 'deepgram',
    name: 'Deepgram Nova-3 (Diarize)',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Sub-second streaming ASR + speaker diarization'
  },
  {
    id: 'assemblyai-universal-2',
    activity: 'transcription',
    provider: 'assemblyai',
    name: 'AssemblyAI Universal-2 (Speaker ID)',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Multi-speaker identification & ClaimCenter keyterms'
  },
  {
    id: 'openai-gpt4o-transcribe-diarize',
    activity: 'transcription',
    provider: 'openai',
    name: 'OpenAI gpt-4o-transcribe-diarize',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Speaker-labeled transcription via OpenAI Audio API'
  },
  {
    id: 'gemini-3.5-transcribe',
    activity: 'transcription',
    provider: 'gemini',
    name: 'Gemini 3.5 Transcribe',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Multimodal audio transcription with speaker turns'
  },
  {
    id: 'custom-asr-endpoint',
    activity: 'transcription',
    provider: 'custom',
    name: 'Custom Whisper / Pyannote Server',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    speakerIdCapable: true,
    summary: 'Private WhisperX / Pyannote diarization endpoint'
  },

  // Slide Deck Preparation
  {
    id: 'llama-3-8b-slides',
    activity: 'slideDeck',
    provider: 'local',
    name: 'Llama 3 8B + Local Deck Builder',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Offline Markdown & 16:9 slide structuring'
  },
  {
    id: 'claude-sonnet-4-slides',
    activity: 'slideDeck',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Executive storytelling & crisp slide copy'
  },
  {
    id: 'gpt-4o-slides',
    activity: 'slideDeck',
    provider: 'openai',
    name: 'GPT-4o',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Structured KPI & comparison slide synthesis'
  },
  {
    id: 'gemini-4-argon-slides',
    activity: 'slideDeck',
    provider: 'gemini',
    name: 'Gemini 4 Argon',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Technical architecture & diagram deck prep'
  },
  {
    id: 'gemini-4-hydrogen-slides',
    activity: 'slideDeck',
    provider: 'gemini',
    name: 'Gemini 4 Hydrogen',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Rapid sprint & ClaimCenter readout decks'
  },
  {
    id: 'custom-slides-endpoint',
    activity: 'slideDeck',
    provider: 'custom',
    name: 'Custom Deck Endpoint',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Enterprise gateway or bespoke template pipeline'
  }
];

export const LIVE_TRANSCRIPTION_PROVIDERS: LiveTranscriptionProviderOption[] = [
  {
    id: 'deepgram-live',
    provider: 'deepgram',
    companyName: 'Deepgram',
    modelName: 'Nova-3 Live',
    protocol: 'wss://api.deepgram.com/v1/listen',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid Pay-As-You-Go / Growth',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Sub-300ms WebSocket streaming with live diarization & keyterm boost'
  },
  {
    id: 'assemblyai-live',
    provider: 'assemblyai',
    companyName: 'AssemblyAI',
    modelName: 'Universal-2 Streaming',
    protocol: 'wss://api.assemblyai.com/v2/realtime/ws',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid Streaming API Plan',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Real-time WebSocket ASR with word_boost for ClaimCenter entities'
  },
  {
    id: 'openai-realtime',
    provider: 'openai',
    companyName: 'OpenAI',
    modelName: 'gpt-4o-transcribe Realtime',
    protocol: 'wss://api.openai.com/v1/realtime',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid API Tier 1+',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Low-latency Realtime WebSocket/WebRTC transcription with prompt bias'
  },
  {
    id: 'gemini-live',
    provider: 'gemini',
    companyName: 'Google Gemini',
    modelName: 'Gemini Live Audio',
    protocol: 'BidiGenerateContent WebSocket',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid Gemini API Billing',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Bidirectional live audio stream with inline dictionary grounding'
  },
  {
    id: 'anthropic-no-live',
    provider: 'anthropic',
    companyName: 'Anthropic',
    modelName: 'Claude (Text / Agent Only)',
    protocol: 'No native audio ASR stream',
    supportsLiveStreaming: false,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid API (No Live Audio ASR)',
    diarizationSupport: false,
    keytermBoostSupport: false,
    capabilityNote: 'Anthropic provides text/notes & agent reasoning only; pair with Deepgram/OpenAI/Local ASR for live audio'
  },
  {
    id: 'custom-live-ws',
    provider: 'custom',
    companyName: 'Custom Live WS',
    modelName: 'Self-Hosted WhisperX / Faster-Whisper',
    protocol: 'wss://asr.internal.carrier.local/ws',
    supportsLiveStreaming: true,
    requiresPaidKey: false,
    paidPlanLabel: 'Enterprise Private Cluster',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Private WebSocket ASR gateway inside carrier VPC'
  },
  {
    id: 'whisperkit-local',
    provider: 'local',
    companyName: 'On-Device',
    modelName: 'WhisperKit Chunked Stream',
    protocol: 'Local CoreML / Neural Engine',
    supportsLiveStreaming: true,
    requiresPaidKey: false,
    paidPlanLabel: 'Free · Zero Egress',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Offline on-device streaming chunked every 1.5s'
  }
];

export const INITIAL_DICTIONARY_ENTRIES: DictionaryEntry[] = [
  {
    id: 'dict-claimcenter',
    term: 'ClaimCenter',
    category: 'ClaimCenter Entity',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 6,
    boostWeight: 4.5,
    aliases: ['CC', 'Guidewire ClaimCenter'],
    definition: 'Guidewire core claims administration and exposure lifecycle system.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-fnol',
    term: 'FNOL',
    category: 'Claims Operations',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 5,
    boostWeight: 4.2,
    aliases: ['First Notice of Loss', 'Draft Claim'],
    definition: 'Initial claim intake workflow capturing loss details, policy snapshot, and exposures.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-gosu',
    term: 'Gosu',
    category: 'Gosu & Rules',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 4,
    boostWeight: 4.0,
    aliases: ['Gosu Rules', 'Pre-Update'],
    definition: 'JVM-based statically typed rule and plugin language inside Guidewire.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-policycenter',
    term: 'PolicyCenter',
    category: 'API & Integration',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 3,
    boostWeight: 3.8,
    aliases: ['PC', 'IPolicySearchAdapter'],
    definition: 'Source of truth for policy effective dates, coverages, and deductible snapshots.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-subrogation',
    term: 'Subrogation',
    category: 'Claims Operations',
    source: 'seed',
    sourceFile: 'Baseline ClaimCenter Vocabulary',
    occurrences: 2,
    boostWeight: 3.5,
    aliases: ['SubrogationSummary', 'TC_THIRDPARTY'],
    definition: 'Third-party recovery workflow triggered when adverse fault is confirmed.',
    verifiedByAgent: true,
    learnedAt: '09:40'
  },
  {
    id: 'dict-siu',
    term: 'SIU',
    category: 'Claims Operations',
    source: 'seed',
    sourceFile: 'Baseline ClaimCenter Vocabulary',
    occurrences: 2,
    boostWeight: 3.4,
    aliases: ['Special Investigations Unit', 'SIU Score'],
    definition: 'Fraud and anomaly referral workflow scored during FNOL and reserve checks.',
    verifiedByAgent: true,
    learnedAt: '09:40'
  }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeLlmId: 'llama-3-8b-q4',
  activeWhisperId: 'whisper-large-v3-turbo',
  ttsEngine: 'on-device',
  offlineOnly: false,
  motionIntensity: 'standard',
  hapticFeedback: true,
  haptics: {
    enabled: true,
    profile: 'crisp',
    intensity: 'balanced',
    categories: {
      navigation: true,
      taps: true,
      outcomes: true,
      alerts: true
    }
  },
  diarization: true,
  autoPunctuation: true,
  language: 'English (US)',
  domainTerms: 'ClaimCenter, FNOL, Gosu, PolicyCenter, Subrogation, SIU',
  autoLearnDictionary: true,
  liveProviderId: 'whisperkit-local',
  speakerCount: 'auto',
  speakerLabels: 'Maya (Architect), Alex (Tech Lead), Priya (Claims Ops)',
  apiKeys: {
    openai: '',
    anthropic: '',
    gemini: '',
    deepgram: '',
    assemblyai: '',
    custom: ''
  },
  customEndpoint: {
    baseUrl: 'https://llm.internal.carrier.local/v1',
    modelId: 'claimcenter-llama-70b',
    transcriptionUrl: 'https://asr.internal.carrier.local/v1/transcribe',
    transcriptionModelId: 'whisperx-large-v3-diarize',
    pipelineNote: 'Local VAD + private vLLM / WhisperX cluster'
  },
  activityRoutes: {
    meetingNotes: {
      approach: 'local',
      modelId: 'llama-3-8b-mlx-notes'
    },
    transcription: {
      approach: 'local',
      modelId: 'whisper-fluidaudio-local'
    },
    slideDeck: {
      approach: 'cloud',
      modelId: 'claude-sonnet-4-slides'
    }
  },
  voiceProfile: {
    activeMode: 'open-source-mod',
    openSourceModId: 'dia-16b',
    cloudInferenceHost: 'modal-serverless',
    customVoiceEndpoint: 'https://tts.internal.carrier.local/v1/synthesize',
    saveSamplesToDrive: true,
    personalProfile: {
      name: 'My Studio Voice',
      samplesCompleted: 0,
      totalSamples: 3,
      sampleDurationsSec: [],
      sampleUrls: [],
      status: 'untrained',
      pitchMultiplier: 1.0,
      rateMultiplier: 1.0
    }
  }
};

export const OPEN_SOURCE_VOICE_MODS: OpenSourceVoiceMod[] = [
  {
    id: 'dia-16b',
    name: 'Dia 1.6B (Nari Labs)',
    license: 'Apache 2.0',
    params: '1.6B',
    architecture: 'Multi-speaker dialogue transformer',
    bestFor: 'Two-host podcast conversations with natural turn-taking & laughs',
    coHostPair: 'Alex (Host A) · Maya (Host B)',
    defaultRate: 1.04,
    defaultPitch: 0.98,
    endpointHint: 'modal.run/nari-labs/dia-1.6b'
  },
  {
    id: 'chatterbox-zero',
    name: 'Chatterbox (Resemble AI)',
    license: 'MIT',
    params: '500M',
    architecture: 'Zero-shot voice cloning + emotion exaggeration',
    bestFor: 'Instant personal voice cloning from 5–10s calibration samples',
    coHostPair: 'Cloned Primary · Neutral Architect',
    defaultRate: 1.0,
    defaultPitch: 1.0,
    endpointHint: 'fal.run/resemble-ai/chatterbox'
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro-82M',
    license: 'Apache 2.0',
    params: '82M',
    architecture: 'StyleTTS2 compact acoustic decoder',
    bestFor: 'Ultra-low-latency CPU/serverless podcast narration (50+ presets)',
    coHostPair: 'af_bella · am_michael',
    defaultRate: 1.08,
    defaultPitch: 0.96,
    endpointHint: 'modal.run/hexgrad/kokoro-82m'
  },
  {
    id: 'fish-speech-v15',
    name: 'Fish Speech v1.5',
    license: 'BSD-3-Clause',
    params: '500M',
    architecture: 'Dual-AR acoustic LLM + VQGAN vocoder',
    bestFor: 'Expressive technical reads & multilingual ClaimCenter glossaries',
    coHostPair: 'Studio Narrator · Technical Co-Host',
    defaultRate: 1.02,
    defaultPitch: 1.02,
    endpointHint: 'runpod.io/fishaudio/fish-speech-1.5'
  },
  {
    id: 'orpheus-3b',
    name: 'Orpheus 3B',
    license: 'Apache 2.0',
    params: '3.0B',
    architecture: 'Llama-3B speech token autoregressive LLM',
    bestFor: 'Richly modulated executive briefings ([calm], [excited], [emphatic])',
    coHostPair: 'Tara · Leo',
    defaultRate: 0.98,
    defaultPitch: 0.94,
    endpointHint: 'modal.run/canopylabs/orpheus-3b'
  }
];

export const VOICE_TRAINING_PROMPTS: VoiceTrainingPrompt[] = [
  {
    id: 'vp-1',
    stepLabel: 'Card 1 of 3',
    title: 'Baseline Cadence & Vowel Range',
    script:
      'ClaimCenter processes each First Notice of Loss cleanly, verifying policy coverages before posting initial reserves.',
    focusPhonetics: 'Fricatives, nasals & crisp plosives'
  },
  {
    id: 'vp-2',
    stepLabel: 'Card 2 of 3',
    title: 'Technical Terms & Pause Timing',
    script:
      'When Gosu pre-update rules evaluate TransactionSet authority limits, PolicyCenter snapshots keep latency under four hundred milliseconds.',
    focusPhonetics: 'Acronyms, compound nouns & mid-sentence pacing'
  },
  {
    id: 'vp-3',
    stepLabel: 'Card 3 of 3',
    title: 'Conversational Podcast Intonation',
    script:
      'Wait—so if third-party FaultRating is confirmed at intake, SubrogationSummary routes the recovery referral automatically?',
    focusPhonetics: 'Upward inflection, rhetorical pause & warmth'
  }
];

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B',
    family: 'Meta Llama',
    params: '3.2B',
    quantization: 'Q4_K_M',
    ramUsageMB: 1820,
    engine: 'MLX Swift',
    tokensPerSec: 36.4,
    contextWindow: 8192,
    recommendedDevice: 'iPhone 15 / 16',
    isDownloaded: true
  },
  {
    id: 'llama-3-8b-q4',
    name: 'Llama 3 8B',
    family: 'Meta Llama',
    params: '8.0B',
    quantization: 'Q4_K_M',
    ramUsageMB: 3950,
    engine: 'MLX Swift',
    tokensPerSec: 24.8,
    contextWindow: 4096,
    recommendedDevice: 'iPhone 15 Pro / 16 Pro',
    isDownloaded: true
  },
  {
    id: 'mistral-7b-v03-q4',
    name: 'Mistral 7B v0.3',
    family: 'Mistral AI',
    params: '7.3B',
    quantization: 'Q4_K_M',
    ramUsageMB: 3650,
    engine: 'Metal MPS',
    tokensPerSec: 26.1,
    contextWindow: 4096,
    recommendedDevice: 'iPhone 15 Pro / 16 Pro',
    isDownloaded: true
  },
  {
    id: 'phi-3.5-mini-q4',
    name: 'Phi-3.5 Mini',
    family: 'Microsoft',
    params: '3.8B',
    quantization: 'Q4_K_M',
    ramUsageMB: 2150,
    engine: 'CoreML Neural Engine',
    tokensPerSec: 38.2,
    contextWindow: 12288,
    recommendedDevice: 'iPhone 15 / 16 & iPad',
    isDownloaded: false
  }
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-sys',
    role: 'system',
    content: 'Local engine ready · mmap active · zero egress',
    timestamp: '09:40'
  },
  {
    id: 'msg-1',
    role: 'user',
    content: 'Summarize the Guidewire ClaimCenter FNOL to Reserve workflow.',
    timestamp: '09:41'
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content:
      'Guidewire ClaimCenter processes First Notice of Loss (FNOL) in three stages:\n\n' +
      '1. Intake & Policy Sync: Validates policy number and effective dates against PolicyCenter to snapshot coverages.\n' +
      '2. Exposure Creation: Maps loss cause and coverage subtypes into structured Vehicle, Injury, or Property exposures.\n' +
      '3. Initial Reserves: Runs Gosu segmentation and authority rules to post initial indemnity and expense reserves before assignment.',
    timestamp: '09:41',
    metadata: {
      tokensPerSec: 24.8,
      ramMB: 3910,
      latencyMs: 138,
      isPrivate: true
    }
  }
];

export const SAMPLE_DOCUMENTS: LocalDocument[] = [
  {
    id: 'doc-cc-cloud-api',
    title: 'ClaimCenter_Cloud_API_v10_Spec.pdf',
    format: 'PDF',
    sizeKB: 3120,
    chunkCount: 148,
    dateAdded: '2026-11-04',
    summary: 'REST endpoints for FNOL intake, exposure patching, reserve transactions, and JWT scope mapping.',
    contentExcerpt:
      'POST /claim/v1/claims creates draft FNOL payloads with verified policy snapshots, incident vehicles, and exposure mappings...',
    tags: ['ClaimCenter', 'Cloud API']
  },
  {
    id: 'doc-cc-gosu-rules',
    title: 'Gosu_Subrogation_Rules_Guide.md',
    format: 'Markdown',
    sizeKB: 940,
    chunkCount: 64,
    dateAdded: '2026-11-02',
    summary: 'Pre-update Gosu rules for adverse party recovery, fault thresholds, and SIU referral scoring.',
    contentExcerpt:
      'When claim.FaultRating == FaultRating.TC_THIRDPARTY and SubrogationSummary.Status == TC_OPEN, auto-assign recovery owner...',
    tags: ['Gosu', 'Subrogation']
  },
  {
    id: 'doc-pc-cc-sync',
    title: 'PolicyCenter_ClaimCenter_Integration.pdf',
    format: 'PDF',
    sizeKB: 1840,
    chunkCount: 92,
    dateAdded: '2026-10-28',
    summary: 'Coverage verification contracts, unverified policy handling, and BillingCenter check reconciliation.',
    contentExcerpt:
      'ClaimCenter invokes IPolicySearchAdapter to retrieve point-in-time endorsements and deductible schedules on date of loss...',
    tags: ['PolicyCenter', 'Integration']
  }
];

export const SAMPLE_SPARKPAGES: SparkpageData[] = [
  {
    id: 'sp-cc-api-vs-gosu',
    query: 'ClaimCenter Cloud API vs Gosu',
    title: 'ClaimCenter Cloud API vs. Gosu Plugins',
    subtitle: 'FNOL intake, reserve automation, and upgrade isolation across 24 sources',
    generatedDate: 'Nov 5, 2026',
    consensusScore: 96,
    agentExecutionTimeSec: 4.8,
    sourcesScannedCount: 24,
    sections: [
      {
        id: 'sec-summary',
        title: 'Architecture & Trade-offs',
        summary:
          'Cloud API decouples digital FNOL portals and external microservices over JSON:API, while Gosu plugins remain essential for synchronous core entity validation and reserve authority checks.',
        content:
          'Modern Guidewire Cloud deployments isolate custom extensions outside the core monolith. Cloud API handles external intake (Jutro portals, mobile apps, partner webhooks) with schema versioning, whereas Gosu pre-update rules and Event Messaging execute in-transaction inside ClaimCenter.',
        citations: [1, 2, 4],
        metrics: [
          { label: 'API Format', value: 'JSON:API', badge: 'REST v1' },
          { label: 'Rule Latency', value: '< 12ms', badge: 'In-Tx Gosu' },
          { label: 'Upgrade Impact', value: 'Low', badge: 'Cloud API' },
          { label: 'Tx Atomicity', value: 'ACID', badge: 'Pre-Update' }
        ]
      },
      {
        id: 'sec-workflow',
        title: 'FNOL, Reserves & Subrogation Fit',
        summary:
          'Use Cloud API for external submission and document upload; keep statutory reserve calculation and authority limits inside Gosu.',
        content:
          'Attempting complex multi-exposure reserve splits exclusively from external REST callers creates partial-commit risk. Best practice pairs a single composite Cloud API FNOL call with internal ClaimCenter segmentation rules and App Events for downstream BillingCenter sync.',
        bullets: [
          'Composite Cloud API requests batch claim, incident, and exposure creation in one round-trip.',
          'Gosu TransactionSet pre-update rules enforce adjuster authority caps before DB commit.',
          'Guidewire App Events publish claim-closed and subrogation-recovery webhooks asynchronously.'
        ],
        citations: [1, 3, 5]
      }
    ],
    comparisonTable: {
      headers: ['Dimension', 'Cloud API (REST)', 'Gosu Plugins & Rules'],
      rows: [
        { entity: 'Primary Use Case', values: ['External FNOL & Jutro UI', 'Core validation & reserves'] },
        { entity: 'Upgrade Safety', values: ['Versioned & isolated', 'Requires studio regression'] },
        { entity: 'Execution Context', values: ['Stateless HTTP / OAuth2', 'In-transaction JVM bundle'] },
        { entity: 'PolicyCenter Sync', values: ['REST adapter + snapshot', 'IPolicySearchAdapter plugin'] },
        { entity: 'Event Dispatch', values: ['Webhook / App Events', 'Messaging Destination'] }
      ]
    },
    keyTakeaways: [
      'Route external FNOL portals and mobile uploads through ClaimCenter Cloud API.',
      'Keep reserve authority, segmentation, and SIU scoring in Gosu rules.',
      'Use Guidewire App Events instead of custom synchronous polling.'
    ],
    citations: [
      {
        id: 1,
        title: 'Guidewire ClaimCenter Cloud API Developer Guide',
        url: 'https://docs.guidewire.com/cloud/cc/latest/apiref/',
        snippet:
          'The Claim API exposes JSON:API endpoints for creating FNOL claims, exposures, notes, documents, and reserve checks with role-based scopes.',
        domain: 'docs.guidewire.com',
        crawlTimestamp: '2026-11-05T14:22:10Z',
        reliabilityScore: 99,
        authorOrSource: 'Guidewire Documentation'
      },
      {
        id: 2,
        title: 'Guidewire Cloud Integration Patterns: Cloud API & App Events',
        url: 'https://developer.guidewire.com/integration-patterns',
        snippet:
          'Decoupled integrations combine composite Cloud API mutations with asynchronous App Events to minimize upgrade remediation.',
        domain: 'developer.guidewire.com',
        crawlTimestamp: '2026-11-05T15:10:45Z',
        reliabilityScore: 97,
        authorOrSource: 'Guidewire Developer Portal'
      },
      {
        id: 3,
        title: 'ClaimCenter Gosu Rules & Transaction Authority Architecture',
        url: 'https://docs.guidewire.com/cloud/cc/latest/rules/',
        snippet:
          'Pre-update and validation rules inspect TransactionSet bundles atomically to verify reserve limits and subrogation eligibility.',
        domain: 'docs.guidewire.com',
        crawlTimestamp: '2026-11-05T16:04:12Z',
        reliabilityScore: 98,
        authorOrSource: 'Guidewire Core Engineering'
      },
      {
        id: 4,
        title: 'Jutro Digital Platform & ClaimCenter FNOL Orchestration',
        url: 'https://developer.guidewire.com/jutro-fnol',
        snippet:
          'Jutro micro-frontends submit structured FNOL steps to Cloud API while relying on ClaimCenter segmentation for adjuster assignment.',
        domain: 'developer.guidewire.com',
        crawlTimestamp: '2026-11-05T12:00:00Z',
        reliabilityScore: 95,
        authorOrSource: 'Guidewire Jutro Team'
      },
      {
        id: 5,
        title: 'Guidewire Community: Legacy Messaging vs. Cloud App Events',
        url: 'https://community.guidewire.com/events-migration',
        snippet:
          'Insurers migrating to Cloud replace custom Gosu transport plugins with webhook-backed App Events and dead-letter retries.',
        domain: 'community.guidewire.com',
        crawlTimestamp: '2026-11-05T18:30:00Z',
        reliabilityScore: 92,
        authorOrSource: 'Guidewire Architecture SIG'
      }
    ]
  }
];

export const SAMPLE_PODCAST_EPISODES: PodcastEpisode[] = [
  {
    id: 'ep-cc-deepdive',
    title: 'ClaimCenter FNOL & Subrogation Triage',
    subtitle: '3 local ClaimCenter specs',
    topic: 'Guidewire ClaimCenter',
    durationMinutes: 2.1,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-zinc-900',
    sourceDocumentIds: ['doc-cc-cloud-api', 'doc-cc-gosu-rules', 'doc-pc-cc-sync'],
    dialogue: [
      {
        id: 'turn-1',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Let us walk through how Guidewire ClaimCenter handles an auto FNOL from mobile intake all the way to initial reserves.',
        durationSec: 7.4,
        citations: [1]
      },
      {
        id: 'turn-2',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'First, the Jutro portal sends a composite Cloud API request to create the claim and snapshot coverages directly from PolicyCenter.',
        durationSec: 7.8,
        citations: [1, 3]
      },
      {
        id: 'turn-3',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Right, and once the exposures are mapped, Gosu pre-update rules verify adjuster authority and post the initial indemnity reserve.',
        durationSec: 8.1,
        citations: [2]
      },
      {
        id: 'turn-4',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'If third-party fault is flagged, the subrogation rule set opens a recovery referral automatically without manual triage.',
        durationSec: 7.2,
        citations: [2]
      },
      {
        id: 'turn-5',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Clean split: Cloud API for external submission, Gosu for transactional integrity, and zero data leaving this device.',
        durationSec: 6.9,
        citations: [1, 2]
      }
    ]
  },
  {
    id: 'ep-cloud-api-gosu',
    title: 'Cloud API vs. Gosu Plugin Boundaries',
    subtitle: 'Integration architecture briefing',
    topic: 'Cloud API & Gosu',
    durationMinutes: 1.8,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-slate-800 to-zinc-900',
    sourceDocumentIds: ['doc-cc-cloud-api', 'doc-cc-gosu-rules'],
    dialogue: [
      {
        id: 'api-turn-1',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'Teams often ask when to expose a new Cloud API endpoint versus keeping logic inside Gosu pre-update rules.',
        durationSec: 6.8,
        citations: [1]
      },
      {
        id: 'api-turn-2',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'External consumer orchestration belongs in Cloud API schemas and handlers, where JSON:API versioning protects upstream mobile and portal clients.',
        durationSec: 7.5,
        citations: [1, 2]
      },
      {
        id: 'api-turn-3',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'Meanwhile, invariant checks like exposure reserve limits and cross-entity bundle validation stay atomic inside Gosu transaction hooks.',
        durationSec: 7.2,
        citations: [2]
      },
      {
        id: 'api-turn-4',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Keeping that boundary crisp avoids brittle plugins during InsuranceSuite cloud upgrades.',
        durationSec: 5.9,
        citations: [1]
      }
    ]
  },
  {
    id: 'ep-reserve-authority',
    title: 'PolicyCenter Sync & Reserve Authority',
    subtitle: 'Coverage verification & limits',
    topic: 'Claims Operations',
    durationMinutes: 1.6,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-slate-900',
    sourceDocumentIds: ['doc-pc-cc-sync', 'doc-cc-gosu-rules'],
    dialogue: [
      {
        id: 'res-turn-1',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Before any adjuster approves an indemnity reserve, ClaimCenter reconciles policy effective dates and deductible overrides with PolicyCenter.',
        durationSec: 7.1,
        citations: [3]
      },
      {
        id: 'res-turn-2',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'If the verified exposure crosses the adjuster authority limit, the approval routing activity escalates straight to a claims supervisor queue.',
        durationSec: 7.4,
        citations: [2, 3]
      },
      {
        id: 'res-turn-3',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'And every coverage snapshot is persisted locally for auditability even when external gateway latency spikes.',
        durationSec: 6.4,
        citations: [3]
      }
    ]
  }
];
