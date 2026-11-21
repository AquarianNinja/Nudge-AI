import express from 'express';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inflateRawSync, inflateSync } from 'node:zlib';
import {
  AUDIO_EXPORT_FORMATS,
  buildConvertedFileName,
  getAudioExportFormatSpec,
  sanitizeAudioSourceExtension
} from './src/utils/audioConversion.ts';
import { parseDocumentBytes } from './src/utils/documentParsers.ts';
import {
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  upsertCoreDataDocument
} from './src/utils/coreDataVectorDb.ts';
import {
  buildDynamicCloudSearchSparkpage,
  executeRagRetrieval,
  generateDynamicCloudCitations
} from './src/utils/ragEngine.ts';
import {
  computeNextRunIso,
  createBackgroundAgentTask,
  createDiaryEntry,
  executeBackgroundAgentTaskCycle,
  formatDiaryDateLabel,
  getCloudSchedulerModelSpec
} from './src/utils/workspaceScheduler.ts';
import {
  createCallsignItem,
  createUserIdentity,
  deleteCallsignItem,
  setActiveCallsign,
  updateCallsignItem
} from './src/utils/identityCallsigns.ts';
import {
  computeNextNanobotRunIso,
  executeNanobotRunRecord,
  getModelsForEngine
} from './src/utils/nanobotCatalog.ts';
import {
  SandboxPolicyError,
  appendBotSandboxMemory,
  buildSandboxId,
  provisionBotSandbox,
  readBotSandbox,
  wipeBotSandbox
} from './src/utils/nanobotSandbox.ts';
import type {
  BackgroundAgentTask,
  Callsign,
  CloudSchedulerModelId,
  CoreDataChunkEmbedding,
  CoreDataDocumentFormat,
  CoreDataVectorStoreState,
  Nanobot,
  NanobotEngineId,
  NanobotRun,
  NanobotSchedule,
  NanobotStatus,
  NanobotStyleId,
  OfficeDiaryCategory,
  OfficeDiaryEntry,
  RagStrategyId,
  SchedulerIntervalId,
  SparkpageCitation,
  UploadedAssetKind,
  UserIdentity
} from './src/types/index.ts';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
let activeCoreDataPath = path.resolve(__dirname, '.coredata-vector-store.json');
let activeWorkspacePath = path.resolve(__dirname, '.workspace-diary-scheduler.json');
let activeNanoRuntimePath = path.resolve(__dirname, '.nanobot-runtime-state.json');
let activeSandboxRootDir = path.resolve(__dirname, '.nanobot-sandboxes');

interface WorkspacePersistedState {
  diaryEntries: OfficeDiaryEntry[];
  schedulerTasks: BackgroundAgentTask[];
}

interface NanoRuntimePersistedState {
  identitiesByKey: Record<string, UserIdentity>;
  callsigns: Callsign[];
  nanobots: Nanobot[];
  runs: NanobotRun[];
}

let memoryCoreDataStore: CoreDataVectorStoreState | null = null;
let memoryWorkspaceState: WorkspacePersistedState | null = null;
let memoryNanoRuntimeState: NanoRuntimePersistedState | null = null;
let schedulerTickInFlight = false;

async function writeJsonAtomicWithFallback(
  primaryPath: string,
  fallbackFileName: string,
  payload: unknown
): Promise<string> {
  const serialized = JSON.stringify(payload);
  try {
    const tmpPath = `${primaryPath}.tmp`;
    await fs.writeFile(tmpPath, serialized, 'utf-8');
    await fs.rename(tmpPath, primaryPath);
    return primaryPath;
  } catch {
    const fallbackPath = path.join(os.tmpdir(), fallbackFileName);
    try {
      const tmpFallback = `${fallbackPath}.tmp`;
      await fs.writeFile(tmpFallback, serialized, 'utf-8');
      await fs.rename(tmpFallback, fallbackPath);
      return fallbackPath;
    } catch {
      return primaryPath;
    }
  }
}

async function loadCoreDataStore(): Promise<CoreDataVectorStoreState> {
  if (memoryCoreDataStore) return memoryCoreDataStore;
  for (const candidatePath of [
    activeCoreDataPath,
    path.join(os.tmpdir(), 'locally-nexus-coredata-store.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as CoreDataVectorStoreState;
      if (
        parsed &&
        Array.isArray(parsed.documents) &&
        Array.isArray(parsed.chunks) &&
        typeof parsed.embeddingDim === 'number'
      ) {
        activeCoreDataPath = candidatePath;
        memoryCoreDataStore = parsed;
        return memoryCoreDataStore;
      }
    } catch {
      // Try next candidate or initialize fresh store
    }
  }
  memoryCoreDataStore = createInitialCoreDataStore();
  await saveCoreDataStore(memoryCoreDataStore);
  return memoryCoreDataStore;
}

async function saveCoreDataStore(store: CoreDataVectorStoreState): Promise<void> {
  memoryCoreDataStore = store;
  activeCoreDataPath = await writeJsonAtomicWithFallback(
    activeCoreDataPath,
    'locally-nexus-coredata-store.json',
    store
  );
}

function summarizeStore(store: CoreDataVectorStoreState) {
  return {
    containerId: store.containerId,
    zoneName: store.zoneName,
    embeddingDim: store.embeddingDim,
    lastSyncedIso: store.lastSyncedIso,
    documentCount: store.documents.length,
    chunkCount: store.chunks.length,
    documents: store.documents
  };
}

async function loadWorkspaceState(): Promise<WorkspacePersistedState> {
  if (memoryWorkspaceState) return memoryWorkspaceState;
  for (const candidatePath of [
    activeWorkspacePath,
    path.join(os.tmpdir(), 'locally-nexus-workspace-state.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as WorkspacePersistedState;
      if (
        parsed &&
        Array.isArray(parsed.diaryEntries) &&
        Array.isArray(parsed.schedulerTasks)
      ) {
        activeWorkspacePath = candidatePath;
        memoryWorkspaceState = parsed;
        return memoryWorkspaceState;
      }
    } catch {
      // Try next candidate or initialize empty cleanly
    }
  }
  memoryWorkspaceState = { diaryEntries: [], schedulerTasks: [] };
  await saveWorkspaceState(memoryWorkspaceState);
  return memoryWorkspaceState;
}

async function saveWorkspaceState(state: WorkspacePersistedState): Promise<void> {
  memoryWorkspaceState = state;
  activeWorkspacePath = await writeJsonAtomicWithFallback(
    activeWorkspacePath,
    'locally-nexus-workspace-state.json',
    state
  );
}

async function loadNanoRuntimeState(): Promise<NanoRuntimePersistedState> {
  if (memoryNanoRuntimeState) return memoryNanoRuntimeState;
  for (const candidatePath of [
    activeNanoRuntimePath,
    path.join(os.tmpdir(), 'nudge-ai-nanobot-runtime.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as NanoRuntimePersistedState;
      if (
        parsed &&
        parsed.identitiesByKey &&
        Array.isArray(parsed.callsigns) &&
        Array.isArray(parsed.nanobots) &&
        Array.isArray(parsed.runs)
      ) {
        activeNanoRuntimePath = candidatePath;
        memoryNanoRuntimeState = parsed;
        return memoryNanoRuntimeState;
      }
    } catch {
      // Try next candidate
    }
  }
  memoryNanoRuntimeState = {
    identitiesByKey: {},
    callsigns: [],
    nanobots: [],
    runs: []
  };
  await saveNanoRuntimeState(memoryNanoRuntimeState);
  return memoryNanoRuntimeState;
}

async function saveNanoRuntimeState(state: NanoRuntimePersistedState): Promise<void> {
  memoryNanoRuntimeState = state;
  activeNanoRuntimePath = await writeJsonAtomicWithFallback(
    activeNanoRuntimePath,
    'nudge-ai-nanobot-runtime.json',
    state
  );
}

async function runNanobotSchedulerCycleIfDue(): Promise<boolean> {
  const state = await loadNanoRuntimeState();
  const now = new Date();
  const nowMs = now.getTime();
  let changed = false;
  const nextRuns = [...state.runs];
  const nextBots: Nanobot[] = [];

  for (const bot of state.nanobots) {
    if (
      bot.status === 'scheduled' &&
      bot.schedule.nextRunIso &&
      nowMs >= new Date(bot.schedule.nextRunIso).getTime()
    ) {
      const { updatedBot, run } = executeNanobotRunRecord(bot, now);
      nextBots.push(updatedBot);
      nextRuns.unshift(run);
      await appendBotSandboxMemory(
        activeSandboxRootDir,
        updatedBot,
        updatedBot.userId,
        updatedBot.id,
        `Scheduled run (${run.status}): ${updatedBot.taskPrompt.slice(0, 120)}`
      ).catch(() => undefined);
      changed = true;
    } else {
      nextBots.push(bot);
    }
  }

  if (changed) {
    await saveNanoRuntimeState({
      ...state,
      nanobots: nextBots,
      runs: nextRuns.slice(0, 500)
    });
  }
  return changed;
}

async function runSchedulerCycleIfDue(forceTaskId?: string): Promise<boolean> {
  if (schedulerTickInFlight && !forceTaskId) return false;
  schedulerTickInFlight = true;
  try {
    const state = await loadWorkspaceState();
    const store = await loadCoreDataStore();
    const now = new Date();
    const nowMs = now.getTime();
    let changed = false;

    const updatedTasks: BackgroundAgentTask[] = [];
    for (const task of state.schedulerTasks) {
      const isForced = Boolean(forceTaskId && task.id === forceTaskId);
      const isDue =
        task.status === 'running' && nowMs >= new Date(task.nextRunIso).getTime();

      if (isForced || isDue) {
        const liveCitations = await fetchLiveCloudWebCitations(task.prompt);
        const updated = executeBackgroundAgentTaskCycle({
          task,
          store,
          liveCitations,
          now
        });
        updatedTasks.push(updated);
        changed = true;
      } else {
        updatedTasks.push(task);
      }
    }

    if (changed) {
      await saveWorkspaceState({
        ...state,
        schedulerTasks: updatedTasks
      });
    }
    return changed;
  } finally {
    schedulerTickInFlight = false;
  }
}

async function fetchLiveCloudWebCitations(query: string): Promise<SparkpageCitation[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      cleanQuery
    )}&limit=3&namespace=0&format=json`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LocallyNexus/1.0' }
    });
    if (!resp.ok) return [];
    const payload = (await resp.json()) as [string, string[], string[], string[]];
    const titles = Array.isArray(payload[1]) ? payload[1] : [];
    const descriptions = Array.isArray(payload[2]) ? payload[2] : [];
    const links = Array.isArray(payload[3]) ? payload[3] : [];

    const citations: SparkpageCitation[] = [];
    for (let i = 0; i < Math.min(3, titles.length); i++) {
      const title = titles[i];
      const href = links[i];
      if (!title || !href) continue;
      citations.push({
        id: i + 1,
        title,
        url: href,
        snippet:
          descriptions[i]?.trim() ||
          `Cloud reference entry for ${title} retrieved in response to "${cleanQuery}".`,
        domain: 'en.wikipedia.org',
        crawlTimestamp: new Date().toISOString(),
        reliabilityScore: 94 - i * 2,
        authorOrSource: 'Wikipedia Live Index'
      });
    }
    return citations;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function convertAudioBufferWithFfmpeg(params: {
  inputBuffer: Buffer;
  sourceExt: string;
  targetFormat: string;
}): Promise<Buffer> {
  const spec = getAudioExportFormatSpec(params.targetFormat);
  if (!spec) {
    throw new Error(`Unsupported target format: ${params.targetFormat}`);
  }

  const safeExt = sanitizeAudioSourceExtension(params.sourceExt);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'locally-nexus-audio-'));
  const inputPath = path.join(workDir, `source.${safeExt}`);
  const outputPath = path.join(workDir, `converted.${spec.extension}`);

  try {
    await fs.writeFile(inputPath, params.inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      ...spec.ffmpegArgs,
      outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function startServer() {
  const app = express();
  const jsonParser = express.json({ limit: '25mb' });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/vector-db/status', async (_req, res) => {
    try {
      const store = await loadCoreDataStore();
      res.json(summarizeStore(store));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load CoreData store' });
    }
  });

  app.post('/api/documents/parse', jsonParser, async (req, res) => {
    try {
      const { fileName, mimeType = '', base64Data } = (req.body || {}) as {
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
      };
      if (!fileName || typeof base64Data !== 'string') {
        res.status(400).json({ error: 'fileName and base64Data are required.' });
        return;
      }
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const bytes = new Uint8Array(Buffer.from(cleanBase64, 'base64'));
      const parsed = parseDocumentBytes(bytes, fileName, mimeType, {
        inflate: (data) => new Uint8Array(inflateSync(data)),
        inflateRaw: (data) => new Uint8Array(inflateRawSync(data))
      });
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Document parsing failed' });
    }
  });

  app.post('/api/vector-db/ingest', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        id?: string;
        title?: string;
        format?: CoreDataDocumentFormat;
        assetKind?: UploadedAssetKind;
        sizeKB?: number;
        summary?: string;
        text?: string;
        sections?: Array<{ label: string; text: string }>;
        tags?: string[];
        dateAdded?: string;
      };
      if (!body.title || typeof body.text !== 'string') {
        res.status(400).json({ error: 'title and text are required to ingest into CoreData Vector DB.' });
        return;
      }
      const store = await loadCoreDataStore();
      const { nextStore, document, chunks } = upsertCoreDataDocument(store, {
        id: body.id,
        title: body.title,
        format: body.format || 'TXT',
        assetKind: body.assetKind || 'document',
        sizeKB: Number(body.sizeKB) || Math.max(1, Math.round(body.text.length / 1024)),
        summary: body.summary,
        text: body.text,
        sections: body.sections,
        tags: body.tags,
        dateAdded: body.dateAdded || 'Just now'
      });
      await saveCoreDataStore(nextStore);
      res.json({
        document,
        chunksIndexed: chunks.length,
        storeSummary: summarizeStore(nextStore)
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'CoreData vector ingest failed' });
    }
  });

  app.delete('/api/vector-db/documents/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const store = await loadCoreDataStore();
      const nextStore = deleteCoreDataDocument(store, targetId);
      await saveCoreDataStore(nextStore);
      res.json({
        removedId: targetId,
        storeSummary: summarizeStore(nextStore)
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  app.post('/api/vector-db/query', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        query?: string;
        strategyId?: RagStrategyId;
        topK?: number;
        filterDocumentId?: string | null;
        attachmentChunks?: CoreDataChunkEmbedding[];
        offlineOnly?: boolean;
      };
      const query = (body.query || '').trim();
      if (!query) {
        res.status(400).json({ error: 'query is required.' });
        return;
      }
      const store = await loadCoreDataStore();
      const retrieval = executeRagRetrieval(store, query, {
        strategyId: body.strategyId || 'hybrid-rrf',
        topK: body.topK ?? 4,
        filterDocumentId: body.filterDocumentId ?? null,
        attachmentChunks: body.attachmentChunks || [],
        offlineOnly: Boolean(body.offlineOnly)
      });

      let cloudCitations: SparkpageCitation[] = [];
      if (retrieval.shouldTriggerCloudFallback && !body.offlineOnly) {
        const live = await fetchLiveCloudWebCitations(query);
        cloudCitations = generateDynamicCloudCitations(query, live);
      }

      res.json({
        ...retrieval,
        cloudCitations
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'CoreData RAG query failed' });
    }
  });

  app.post('/api/search/cloud', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        query?: string;
        strategyId?: RagStrategyId;
        attachmentChunks?: CoreDataChunkEmbedding[];
      };
      const query = (body.query || '').trim();
      if (!query) {
        res.status(400).json({ error: 'query is required for Cloud Search.' });
        return;
      }

      const store = await loadCoreDataStore();
      const retrieval = executeRagRetrieval(store, query, {
        strategyId: body.strategyId || 'hybrid-rrf',
        topK: 4,
        attachmentChunks: body.attachmentChunks || [],
        offlineOnly: false
      });

      const live = await fetchLiveCloudWebCitations(query);
      const citations = generateDynamicCloudCitations(query, live);
      const sparkpage = buildDynamicCloudSearchSparkpage({
        query,
        strategyId: body.strategyId || 'hybrid-rrf',
        retrievedChunks: retrieval.retrieved,
        citations,
        executionTimeSec: 1.9
      });

      res.json({
        citations,
        sparkpage,
        retrievedChunks: retrieval.retrieved,
        pipelineSteps: retrieval.pipelineSteps
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Cloud search failed' });
    }
  });

  app.get('/api/audio/formats', (_req, res) => {
    res.json({
      formats: AUDIO_EXPORT_FORMATS.map((f) => ({
        id: f.id,
        label: f.label,
        extension: f.extension,
        mimeType: f.mimeType,
        codecLabel: f.codecLabel
      }))
    });
  });

  app.post(
    '/api/audio/convert',
    express.raw({
      type: ['application/octet-stream', 'audio/*'],
      limit: '50mb'
    }),
    express.json({ limit: '50mb' }),
    async (req, res) => {
      try {
        const isRawBuffer = Buffer.isBuffer(req.body);
        const targetFormatRaw = isRawBuffer
          ? String(req.query.format || '')
          : String((req.body as { targetFormat?: string })?.targetFormat || req.query.format || '');

        const spec = getAudioExportFormatSpec(targetFormatRaw);
        if (!spec) {
          res.status(400).json({
            error: `Unsupported target audio format "${targetFormatRaw}". Supported: ${AUDIO_EXPORT_FORMATS.map((f) => f.id).join(', ')}`
          });
          return;
        }

        let inputBuffer: Buffer;
        if (isRawBuffer) {
          inputBuffer = req.body;
        } else {
          const base64Data = (req.body as { audioBase64?: string })?.audioBase64;
          if (!base64Data || typeof base64Data !== 'string') {
            res.status(400).json({ error: 'Missing audio payload for conversion.' });
            return;
          }
          const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
          inputBuffer = Buffer.from(cleanBase64, 'base64');
        }

        if (!inputBuffer || inputBuffer.length === 0) {
          res.status(400).json({ error: 'Empty audio payload received.' });
          return;
        }

        const sourceExtRaw = isRawBuffer
          ? String(req.query.sourceExt || 'wav')
          : String((req.body as { sourceExt?: string })?.sourceExt || req.query.sourceExt || 'wav');
        const requestedName = isRawBuffer
          ? String(req.query.filename || 'Locally_Nexus_Audio')
          : String((req.body as { fileName?: string })?.fileName || req.query.filename || 'Locally_Nexus_Audio');

        const converted = await convertAudioBufferWithFfmpeg({
          inputBuffer,
          sourceExt: sourceExtRaw,
          targetFormat: spec.id
        });

        const outputName = buildConvertedFileName(requestedName, spec.id);

        res.setHeader('Content-Type', spec.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.setHeader('X-Audio-Format', spec.id);
        res.setHeader('X-Audio-Output-Filename', outputName);
        res.send(converted);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Audio conversion failed';
        res.status(500).json({ error: message });
      }
    }
  );

  // Daily Office Diary endpoints
  app.get('/api/diary', async (_req, res) => {
    try {
      const state = await loadWorkspaceState();
      res.json({ entries: state.diaryEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load diary' });
    }
  });

  app.post('/api/diary', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        dateIso?: string;
        title?: string;
        content?: string;
        category?: OfficeDiaryCategory;
        tags?: string[];
        attachmentNames?: string[];
      };
      if (!body.content?.trim() && !body.title?.trim()) {
        res.status(400).json({ error: 'Title or content is required for an office diary entry.' });
        return;
      }
      const state = await loadWorkspaceState();
      const entry = createDiaryEntry({
        dateIso: body.dateIso,
        title: body.title || 'Office Log',
        content: body.content || '',
        category: body.category || 'Focus',
        tags: body.tags || [],
        attachmentNames: body.attachmentNames || []
      });
      const nextState: WorkspacePersistedState = {
        ...state,
        diaryEntries: [entry, ...state.diaryEntries]
      };
      await saveWorkspaceState(nextState);
      res.status(201).json({ entry, entries: nextState.diaryEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create diary entry' });
    }
  });

  app.patch('/api/diary/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as Partial<OfficeDiaryEntry>;
      const state = await loadWorkspaceState();
      const existing = state.diaryEntries.find((e) => e.id === targetId);
      if (!existing) {
        res.status(404).json({ error: 'Diary entry not found' });
        return;
      }
      const nextDateIso = body.dateIso ? body.dateIso.trim() : existing.dateIso;
      const updated: OfficeDiaryEntry = {
        ...existing,
        ...(body.title !== undefined ? { title: body.title.trim() || existing.title } : {}),
        ...(body.content !== undefined ? { content: body.content.trim() } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        dateIso: nextDateIso,
        dateLabel: formatDiaryDateLabel(nextDateIso),
        updatedIso: new Date().toISOString()
      };
      const nextEntries = state.diaryEntries.map((e) => (e.id === targetId ? updated : e));
      await saveWorkspaceState({ ...state, diaryEntries: nextEntries });
      res.json({ entry: updated, entries: nextEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update diary entry' });
    }
  });

  app.delete('/api/diary/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      const nextEntries = state.diaryEntries.filter((e) => e.id !== targetId);
      await saveWorkspaceState({ ...state, diaryEntries: nextEntries });
      res.json({ removedId: targetId, entries: nextEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete diary entry' });
    }
  });

  // Continuous Background Agentic Task Scheduler endpoints
  app.get('/api/scheduler/tasks', async (_req, res) => {
    try {
      await runSchedulerCycleIfDue();
      const state = await loadWorkspaceState();
      res.json({ tasks: state.schedulerTasks, serverNowIso: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load scheduler tasks' });
    }
  });

  app.post('/api/scheduler/tasks', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        title?: string;
        prompt?: string;
        cloudModelId?: CloudSchedulerModelId;
        intervalId?: SchedulerIntervalId;
        ragEnabled?: boolean;
        ragStrategyId?: RagStrategyId;
        attachmentNames?: string[];
        assignedAgentId?: string;
        scheduledSlotIso?: string;
      };
      if (!body.prompt?.trim()) {
        res.status(400).json({ error: 'Task objective prompt is required.' });
        return;
      }
      const state = await loadWorkspaceState();
      const created = createBackgroundAgentTask({
        title: body.title || '',
        prompt: body.prompt,
        cloudModelId: body.cloudModelId || 'claude-3-7-sonnet',
        intervalId: body.intervalId || '1m',
        ragEnabled: body.ragEnabled ?? true,
        ragStrategyId: body.ragStrategyId || 'hybrid-rrf',
        attachmentNames: body.attachmentNames || [],
        assignedAgentId: body.assignedAgentId,
        scheduledSlotIso: body.scheduledSlotIso
      });

      const store = await loadCoreDataStore();
      const liveCitations = await fetchLiveCloudWebCitations(created.prompt);
      const firstRunTask = executeBackgroundAgentTaskCycle({
        task: created,
        store,
        liveCitations,
        now: new Date()
      });

      const nextTasks = [firstRunTask, ...state.schedulerTasks];
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.status(201).json({ task: firstRunTask, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to schedule task' });
    }
  });

  app.patch('/api/scheduler/tasks/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as {
        status?: 'running' | 'paused';
        cloudModelId?: CloudSchedulerModelId;
        intervalId?: SchedulerIntervalId;
        ragEnabled?: boolean;
        ragStrategyId?: RagStrategyId;
        assignedAgentId?: string;
        scheduledSlotIso?: string;
      };
      const state = await loadWorkspaceState();
      const existing = state.schedulerTasks.find((t) => t.id === targetId);
      if (!existing) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      const nextStatus = body.status ?? existing.status;
      const nextModelSpec = body.cloudModelId
        ? getCloudSchedulerModelSpec(body.cloudModelId)
        : null;
      const updated: BackgroundAgentTask = {
        ...existing,
        ...(body.ragEnabled !== undefined ? { ragEnabled: body.ragEnabled } : {}),
        ...(body.ragStrategyId !== undefined ? { ragStrategyId: body.ragStrategyId } : {}),
        ...(body.assignedAgentId !== undefined ? { assignedAgentId: body.assignedAgentId } : {}),
        ...(body.scheduledSlotIso !== undefined ? { scheduledSlotIso: body.scheduledSlotIso } : {}),
        ...(nextModelSpec
          ? {
              cloudModelId: nextModelSpec.id,
              cloudModelLabel: nextModelSpec.label,
              cloudProviderLabel: nextModelSpec.provider
            }
          : {}),
        status: nextStatus,
        nextRunIso:
          nextStatus === 'running' && existing.status === 'paused'
            ? computeNextRunIso(existing.intervalMs, Date.now())
            : existing.nextRunIso
      };

      const nextTasks = state.schedulerTasks.map((t) => (t.id === targetId ? updated : t));
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.json({ task: updated, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update task' });
    }
  });

  app.post('/api/scheduler/tasks/:id/run', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      if (!state.schedulerTasks.some((t) => t.id === targetId)) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }
      await runSchedulerCycleIfDue(targetId);
      const refreshed = await loadWorkspaceState();
      const task = refreshed.schedulerTasks.find((t) => t.id === targetId);
      res.json({ task, tasks: refreshed.schedulerTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Manual task run failed' });
    }
  });

  app.delete('/api/scheduler/tasks/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      const nextTasks = state.schedulerTasks.filter((t) => t.id !== targetId);
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.json({ removedId: targetId, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete task' });
    }
  });

  // ==================== USER IDENTITY, CALLSIGNS & NANOBOT SANDBOX API ====================
  app.post('/api/identity/init', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        scopeKey?: string;
        authUid?: string;
        linkedProvider?: 'google' | 'guest';
        preferredExistingUserId?: string;
        guestScopeKey?: string;
      };
      const scopeKey = (body.scopeKey || 'default').trim().slice(0, 140);
      const state = await loadNanoRuntimeState();

      let identity = state.identitiesByKey[scopeKey];
      if (!identity && body.guestScopeKey && state.identitiesByKey[body.guestScopeKey]) {
        // Promote existing guest userId seamlessly on first Google link
        const guestIdentity = state.identitiesByKey[body.guestScopeKey];
        identity = createUserIdentity({
          existingUserId: guestIdentity.userId,
          createdAt: guestIdentity.createdAt,
          authUid: body.authUid,
          linkedProvider: body.linkedProvider ?? (body.authUid ? 'google' : 'guest')
        });
      }

      if (!identity) {
        identity = createUserIdentity({
          existingUserId: body.preferredExistingUserId,
          authUid: body.authUid,
          linkedProvider: body.linkedProvider ?? (body.authUid ? 'google' : 'guest')
        });
      } else if (body.authUid && !identity.authUid) {
        identity = {
          ...identity,
          authUid: body.authUid,
          linkedProvider: 'google'
        };
      }

      if (
        !state.identitiesByKey[scopeKey] ||
        state.identitiesByKey[scopeKey].authUid !== identity.authUid
      ) {
        await saveNanoRuntimeState({
          ...state,
          identitiesByKey: {
            ...state.identitiesByKey,
            [scopeKey]: identity
          }
        });
      }

      const callsigns = state.callsigns.filter((c) => c.userId === identity.userId);
      res.json({ identity, callsigns });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to initialize identity' });
    }
  });

  app.get('/api/callsigns', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      res.json({ callsigns: state.callsigns.filter((c) => c.userId === userId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list callsigns' });
    }
  });

  app.post('/api/callsigns', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        userId?: string;
        displayName?: string;
        avatar?: string;
        isActive?: boolean;
      };
      const userId = (body.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      const userCallsigns = state.callsigns.filter((c) => c.userId === userId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== userId);
      const { created, callsigns: nextUserCallsigns } = createCallsignItem({
        userId,
        displayName: body.displayName || '',
        avatar: body.avatar,
        isActive: body.isActive,
        existingCallsigns: userCallsigns
      });

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextUserCallsigns, ...otherCallsigns]
      });
      res.status(201).json({ callsign: created, callsigns: nextUserCallsigns });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create callsign' });
    }
  });

  app.patch('/api/callsigns/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as {
        userId?: string;
        displayName?: string;
        avatar?: string;
        isActive?: boolean;
      };
      const userId = (body.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.callsigns.find((c) => c.id === targetId && (!userId || c.userId === userId));
      if (!existing) {
        res.status(404).json({ error: 'Callsign not found' });
        return;
      }

      const ownerId = existing.userId;
      const ownerCallsigns = state.callsigns.filter((c) => c.userId === ownerId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== ownerId);

      const nextOwnerCallsigns =
        body.isActive && body.displayName === undefined && body.avatar === undefined
          ? setActiveCallsign(ownerCallsigns, targetId)
          : updateCallsignItem(ownerCallsigns, targetId, {
              displayName: body.displayName,
              avatar: body.avatar,
              isActive: body.isActive
            });

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextOwnerCallsigns, ...otherCallsigns]
      });
      res.json({ callsigns: nextOwnerCallsigns });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update callsign' });
    }
  });

  app.delete('/api/callsigns/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const userId = String(req.query.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.callsigns.find((c) => c.id === targetId && (!userId || c.userId === userId));
      if (!existing) {
        res.status(404).json({ error: 'Callsign not found' });
        return;
      }

      const ownerId = existing.userId;
      const ownerCallsigns = state.callsigns.filter((c) => c.userId === ownerId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== ownerId);
      const nextOwnerCallsigns = deleteCallsignItem(ownerCallsigns, targetId);

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextOwnerCallsigns, ...otherCallsigns]
      });
      res.json({ removedId: targetId, callsigns: nextOwnerCallsigns });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete callsign' });
    }
  });

  app.get('/api/nanobots', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      const nanobots = state.nanobots.filter((b) => b.userId === userId);
      const botIds = new Set(nanobots.map((b) => b.id));
      const runs = state.runs.filter((r) => r.userId === userId && botIds.has(r.botId));
      res.json({ nanobots, runs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load nanobots' });
    }
  });

  app.post('/api/nanobots', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        userId?: string;
        name?: string;
        engine?: NanobotEngineId;
        styleId?: NanobotStyleId;
        modelId?: string;
        taskPrompt?: string;
        schedule?: NanobotSchedule;
        consentTimestampIso?: string;
        runImmediately?: boolean;
      };
      const userId = (body.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      if (!body.consentTimestampIso) {
        res.status(400).json({ error: 'AI & Data Disclosure consent timestamp is required.' });
        return;
      }
      const engine: NanobotEngineId = body.engine || 'atlas';
      const allowedModels = getModelsForEngine(engine);
      const modelId = allowedModels.some((m) => m.id === body.modelId)
        ? (body.modelId as string)
        : allowedModels[0].id;
      const taskPrompt = (body.taskPrompt || '').trim();
      if (!taskPrompt) {
        res.status(400).json({ error: 'Task prompt is required.' });
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const schedule: NanobotSchedule = {
        cadence: body.schedule?.cadence || 'daily',
        startTime: body.schedule?.startTime || '09:00',
        customIntervalMinutes: body.schedule?.customIntervalMinutes,
        notificationsEnabled: body.schedule?.notificationsEnabled ?? true,
        nextRunIso: computeNextNanobotRunIso(
          {
            cadence: body.schedule?.cadence || 'daily',
            startTime: body.schedule?.startTime || '09:00',
            customIntervalMinutes: body.schedule?.customIntervalMinutes,
            notificationsEnabled: body.schedule?.notificationsEnabled ?? true
          },
          now
        )
      };

      const draftBot: Nanobot = {
        id: botId,
        userId,
        name: (body.name || 'Nanobot').trim().slice(0, 60) || 'Nanobot',
        engine,
        styleId: body.styleId || 'researcher',
        modelId,
        taskPrompt,
        schedule,
        status: 'scheduled',
        sandboxId: buildSandboxId(botId),
        consentTimestampIso: body.consentTimestampIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await provisionBotSandbox(activeSandboxRootDir, draftBot);

      const state = await loadNanoRuntimeState();
      let finalBot = draftBot;
      const newRuns: NanobotRun[] = [];
      if (body.runImmediately ?? true) {
        const execResult = executeNanobotRunRecord(draftBot, now);
        finalBot = execResult.updatedBot;
        newRuns.push(execResult.run);
        await appendBotSandboxMemory(
          activeSandboxRootDir,
          finalBot,
          userId,
          finalBot.id,
          `Initial release run (${execResult.run.status}): ${finalBot.taskPrompt.slice(0, 140)}`
        );
      }

      const nextBots = [finalBot, ...state.nanobots];
      const nextRuns = [...newRuns, ...state.runs];
      await saveNanoRuntimeState({
        ...state,
        nanobots: nextBots,
        runs: nextRuns.slice(0, 500)
      });

      res.status(201).json({
        nanobot: finalBot,
        runs: newRuns,
        nanobots: nextBots.filter((b) => b.userId === userId)
      });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to release nanobot' });
    }
  });

  app.patch('/api/nanobots/:botId', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as {
        userId?: string;
        name?: string;
        modelId?: string;
        taskPrompt?: string;
        schedule?: NanobotSchedule;
        status?: NanobotStatus;
      };
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (body.userId && existing.userId !== body.userId) {
        res.status(403).json({ error: 'Forbidden: Nanobot belongs to a different User ID.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const nextSchedule = body.schedule
        ? {
            ...body.schedule,
            nextRunIso: computeNextNanobotRunIso(body.schedule, new Date())
          }
        : existing.schedule;

      const allowedModels = getModelsForEngine(existing.engine);
      const nextModelId =
        body.modelId && allowedModels.some((m) => m.id === body.modelId)
          ? body.modelId
          : existing.modelId;

      const updated: Nanobot = {
        ...existing,
        ...(body.name !== undefined ? { name: body.name.trim().slice(0, 60) || existing.name } : {}),
        modelId: nextModelId,
        ...(body.taskPrompt !== undefined ? { taskPrompt: body.taskPrompt.trim() || existing.taskPrompt } : {}),
        schedule: nextSchedule,
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: nowIso
      };

      const nextBots = state.nanobots.map((b) => (b.id === botId ? updated : b));
      await saveNanoRuntimeState({ ...state, nanobots: nextBots });
      res.json({ nanobot: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update nanobot' });
    }
  });

  app.post('/api/nanobots/:botId/rerun', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as { userId?: string };
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (body.userId && existing.userId !== body.userId) {
        res.status(403).json({ error: 'Forbidden: Nanobot belongs to a different User ID.' });
        return;
      }

      const { updatedBot, run } = executeNanobotRunRecord(existing, new Date());
      await appendBotSandboxMemory(
        activeSandboxRootDir,
        updatedBot,
        updatedBot.userId,
        updatedBot.id,
        `Manual rerun (${run.status}): ${updatedBot.taskPrompt.slice(0, 140)}`
      );

      const nextBots = state.nanobots.map((b) => (b.id === botId ? updatedBot : b));
      const nextRuns = [run, ...state.runs].slice(0, 500);
      await saveNanoRuntimeState({ ...state, nanobots: nextBots, runs: nextRuns });
      res.json({ nanobot: updatedBot, run });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to rerun nanobot' });
    }
  });

  app.delete('/api/nanobots/:botId', async (req, res) => {
    try {
      const botId = req.params.botId;
      const userId = String(req.query.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (userId && existing.userId !== userId) {
        res.status(403).json({ error: 'Forbidden: Cannot delete another user’s Nanobot.' });
        return;
      }

      await wipeBotSandbox(activeSandboxRootDir, existing.userId, existing.id);
      const nextBots = state.nanobots.filter((b) => b.id !== botId);
      const nextRuns = state.runs.filter((r) => r.botId !== botId);
      await saveNanoRuntimeState({ ...state, nanobots: nextBots, runs: nextRuns });
      res.json({ removedId: botId, sandboxWiped: true });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete nanobot' });
    }
  });

  app.get('/api/nanobots/:botId/sandbox', async (req, res) => {
    try {
      const botId = req.params.botId;
      const userId = String(req.query.userId || '').trim();
      const actorBotId = String(req.query.actorBotId || botId).trim();
      const state = await loadNanoRuntimeState();
      const bot = state.nanobots.find((b) => b.id === botId);
      if (!bot) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      const sandbox = await readBotSandbox(activeSandboxRootDir, bot, userId || bot.userId, actorBotId);
      res.json({ sandbox });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sandbox access error' });
    }
  });

  app.post('/api/nanobots/:botId/sandbox/memory', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as {
        userId?: string;
        actorBotId?: string;
        summary?: string;
      };
      const state = await loadNanoRuntimeState();
      const bot = state.nanobots.find((b) => b.id === botId);
      if (!bot) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      const sandbox = await appendBotSandboxMemory(
        activeSandboxRootDir,
        bot,
        body.userId || bot.userId,
        body.actorBotId || botId,
        body.summary || ''
      );
      res.json({ sandbox });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sandbox write error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Real continuous background scheduler loop (checks every 5s)
  const backgroundSchedulerTimer = setInterval(() => {
    void runSchedulerCycleIfDue().catch(() => undefined);
    void runNanobotSchedulerCycleIfDue().catch(() => undefined);
  }, 5_000);
  backgroundSchedulerTimer.unref?.();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nudge AI Notes server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
