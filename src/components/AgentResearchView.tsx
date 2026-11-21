import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Layers,
  FileText
} from 'lucide-react';
import {
  AgentStep,
  SparkpageData,
  SparkpageCitation,
  TimelineStage,
  TimelineStageId,
  TimelineStageStatus,
  TimelineStageTelemetry
} from '../types/index.ts';
import { SAMPLE_SPARKPAGES } from '../data/mockData.ts';
import {
  generateResearchPlan,
  initializeAgentSteps,
  mapAgentStepsToTimelineStages,
  formatStageDuration
} from '../utils/agentOrchestration.ts';

interface AgentResearchViewProps {
  onIngestToNotebook?: (sparkpage: SparkpageData) => void;
  embedded?: boolean;
  offlineOnly?: boolean;
  onEnableHybrid?: () => void;
}

type StageTelemetryMap = Record<TimelineStageId, TimelineStageTelemetry>;

const INITIAL_COMPLETED_TELEMETRY: StageTelemetryMap = {
  search: { elapsedMs: 1600, sourceCount: 24, sourceLabel: 'sources' },
  synthesis: { elapsedMs: 2100, sourceCount: 18, sourceLabel: 'verified' },
  drafting: { elapsedMs: 1100, sourceCount: 5, sourceLabel: 'citations' }
};

const EMPTY_TELEMETRY: StageTelemetryMap = {
  search: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'sources' },
  synthesis: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'verified' },
  drafting: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'citations' }
};

export interface AgentTaskTimelineProps {
  steps: AgentStep[];
  telemetry: StageTelemetryMap;
  isResearching: boolean;
  selectedStageId: TimelineStageId | null;
  onSelectStage: (stageId: TimelineStageId) => void;
}

const STAGE_ICONS: Record<TimelineStageId, React.FC<{ className?: string }>> = {
  search: Search,
  synthesis: Layers,
  drafting: FileText
};

const STATUS_META: Record<
  TimelineStageStatus,
  { label: string; textClass: string; nodeClass: string }
> = {
  pending: {
    label: 'Pending',
    textClass: 'text-zinc-500',
    nodeClass: 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
  },
  running: {
    label: 'Running',
    textClass: 'text-zinc-100',
    nodeClass: 'bg-zinc-900 border-zinc-500'
  },
  completed: {
    label: 'Done',
    textClass: 'text-emerald-400',
    nodeClass: 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
  },
  failed: {
    label: 'Failed',
    textClass: 'text-red-400',
    nodeClass: 'bg-red-950/20 border-red-900/60'
  }
};

function renderStatusIcon(status: TimelineStageStatus, sizeClass = 'w-3.5 h-3.5') {
  if (status === 'running') {
    return <Loader2 className={`${sizeClass} text-zinc-100 animate-spin shrink-0`} />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className={`${sizeClass} text-emerald-400 shrink-0`} />;
  }
  if (status === 'failed') {
    return <AlertCircle className={`${sizeClass} text-red-400 shrink-0`} />;
  }
  return <Clock className={`${sizeClass} text-zinc-500 shrink-0`} />;
}

export const AgentTaskTimeline: React.FC<AgentTaskTimelineProps> = ({
  steps,
  telemetry,
  isResearching,
  selectedStageId,
  onSelectStage
}) => {
  const stages: TimelineStage[] = mapAgentStepsToTimelineStages(steps, telemetry);
  const activeStage = stages.find(s => s.id === selectedStageId) || null;

  const totalElapsedMs = stages.reduce((sum, s) => sum + s.telemetry.elapsedMs, 0);
  const completedCount = stages.filter(s => s.status === 'completed').length;

  return (
    <section
      aria-label="Multi-agent research timeline"
      className="@container p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 mb-4"
    >
      {/* Timeline Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-200">Pipeline</span>
          <span className="text-[11px] font-mono tabular-nums text-zinc-500">
            {completedCount}/3 · {formatStageDuration(totalElapsedMs)}
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0">
          {isResearching ? 'Running' : 'Select stage'}
        </span>
      </div>

      {/* Horizontal 3-Stage Progress Stepper */}
      <div className="grid grid-cols-3 @md:flex @md:items-stretch gap-1.5 @md:gap-2">
        {stages.map((stage, idx) => {
          const StageIcon = STAGE_ICONS[stage.id];
          const meta = STATUS_META[stage.status];
          const isSelected = selectedStageId === stage.id;
          const prevCompleted = idx > 0 && stages[idx - 1].status === 'completed';

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && (
                <div
                  aria-hidden="true"
                  className="hidden @md:flex items-center shrink-0 w-4 md:w-6"
                >
                  <div
                    className={`h-px w-full transition-colors ${
                      stage.status === 'completed' || stage.status === 'running' || prevCompleted
                        ? 'bg-zinc-600'
                        : 'bg-zinc-800'
                    }`}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectStage(stage.id)}
                aria-expanded={isSelected}
                aria-controls="agent-stage-detail-panel"
                aria-label={`${stage.label} stage: ${meta.label}, ${formatStageDuration(stage.telemetry.elapsedMs)}, ${stage.telemetry.sourceCount} ${stage.telemetry.sourceLabel}`}
                className={`min-w-0 @md:flex-1 text-left p-2 @md:p-2.5 rounded-lg border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-zinc-400 overflow-hidden ${
                  meta.nodeClass
                } ${isSelected ? 'border-zinc-400 bg-zinc-900' : ''}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <StageIcon className={`w-3 h-3 @md:w-3.5 @md:h-3.5 shrink-0 ${meta.textClass}`} />
                    <span className="text-[11px] @md:text-xs font-medium text-zinc-100 truncate">
                      <span className="hidden @md:inline text-zinc-500">{stage.indexLabel} </span>
                      {stage.label}
                    </span>
                  </div>
                  {renderStatusIcon(stage.status, 'w-3 h-3 @md:w-3.5 @md:h-3.5')}
                </div>

                <div className="flex flex-col @md:flex-row @md:items-center @md:justify-between gap-0.5 text-[10px] @md:text-[11px]">
                  <div className="flex items-center gap-1 font-mono tabular-nums text-zinc-400 min-w-0">
                    <span className="shrink-0">{formatStageDuration(stage.telemetry.elapsedMs)}</span>
                    <span aria-hidden="true" className="text-zinc-600 shrink-0 hidden @md:inline">·</span>
                    <span className="truncate hidden @md:inline">
                      {stage.telemetry.sourceCount} {stage.telemetry.sourceLabel}
                    </span>
                    <span className="truncate @md:hidden text-zinc-500">
                      · {stage.telemetry.sourceCount}
                    </span>
                  </div>

                  <span className={`text-[10px] font-mono whitespace-nowrap shrink-0 ${meta.textClass}`}>
                    {meta.label}
                  </span>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Expandable Clickable Stage Details Panel */}
      {activeStage && (
        <div
          id="agent-stage-detail-panel"
          className="mt-3 pt-3 border-t border-zinc-800 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-zinc-100">
                {activeStage.indexLabel} {activeStage.label}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate">{activeStage.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectStage(activeStage.id)}
              className="text-[11px] text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeStage.subSteps.map((subStep) => {
              const subMeta = STATUS_META[subStep.status];
              return (
                <div
                  key={subStep.id}
                  className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {renderStatusIcon(subStep.status, 'w-3 h-3')}
                      <span className="font-medium text-[11px] text-zinc-100 truncate">
                        {subStep.title}
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono tabular-nums whitespace-nowrap shrink-0 ${subMeta.textClass}`}>
                      {subStep.latencyMs ? formatStageDuration(subStep.latencyMs) : subMeta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400">{subStep.detail}</p>

                  {subStep.dataOutput && subStep.dataOutput.length > 0 && (
                    <ul className="mt-1.5 pt-1.5 border-t border-zinc-800/80 space-y-0.5 text-[10px] text-zinc-400 font-mono">
                      {subStep.dataOutput.slice(0, 3).map((vec, vIdx) => (
                        <li key={vIdx} className="truncate">
                          {vIdx + 1}. {vec}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export const AgentResearchView: React.FC<AgentResearchViewProps> = ({
  onIngestToNotebook,
  embedded = false,
  offlineOnly = false,
  onEnableHybrid
}) => {
  const [activeSparkpage, setActiveSparkpage] = useState<SparkpageData>(SAMPLE_SPARKPAGES[0]);
  const [selectedCitation, setSelectedCitation] = useState<SparkpageCitation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>(() => {
    const plan = generateResearchPlan(SAMPLE_SPARKPAGES[0].query);
    return initializeAgentSteps(plan).map((s, idx) => ({
      ...s,
      status: 'completed' as const,
      latencyMs: [600, 1000, 1100, 1000, 1100][idx] ?? 900
    }));
  });
  const [stageTelemetry, setStageTelemetry] = useState<StageTelemetryMap>(INITIAL_COMPLETED_TELEMETRY);
  const [selectedStageId, setSelectedStageId] = useState<TimelineStageId | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'sec-summary': true,
    'sec-workflow': true
  });
  const [ingestedSuccess, setIngestedSuccess] = useState(false);

  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, []);

  const handleSelectStage = (stageId: TimelineStageId) => {
    setSelectedStageId(prev => (prev === stageId ? null : stageId));
  };

  const handleRunResearch = (customQuery?: string) => {
    const q = (customQuery || searchQuery).trim();
    if (!q || isResearching || offlineOnly) return;

    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);

    setIsResearching(true);
    setIngestedSuccess(false);
    setStageTelemetry(EMPTY_TELEMETRY);
    setSelectedStageId('search');

    const plan = generateResearchPlan(q);
    const initialSteps = initializeAgentSteps(plan);
    initialSteps[0].status = 'running';
    setAgentSteps(initialSteps);

    let currentStepIndex = 0;

    clockIntervalRef.current = setInterval(() => {
      const activeStage: TimelineStageId =
        currentStepIndex <= 1 ? 'search' : currentStepIndex <= 3 ? 'synthesis' : 'drafting';

      setStageTelemetry(prev => {
        const current = prev[activeStage];
        const nextSourceCount =
          activeStage === 'search'
            ? Math.min(24, current.sourceCount + 2)
            : activeStage === 'synthesis'
            ? Math.min(18, current.sourceCount + 1)
            : Math.min(5, current.sourceCount + 1);

        return {
          ...prev,
          [activeStage]: {
            ...current,
            elapsedMs: current.elapsedMs + 100,
            sourceCount: nextSourceCount
          }
        };
      });
    }, 100);

    stepIntervalRef.current = setInterval(() => {
      currentStepIndex++;

      if (currentStepIndex < initialSteps.length) {
        const nextStage: TimelineStageId =
          currentStepIndex <= 1 ? 'search' : currentStepIndex <= 3 ? 'synthesis' : 'drafting';
        setSelectedStageId(nextStage);

        setAgentSteps(prev =>
          prev.map((step, idx) => {
            if (idx < currentStepIndex) {
              return { ...step, status: 'completed', latencyMs: step.latencyMs || 700 };
            }
            if (idx === currentStepIndex) {
              return { ...step, status: 'running' };
            }
            return step;
          })
        );
      } else {
        if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
        if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);

        setAgentSteps(prev =>
          prev.map(s => ({ ...s, status: 'completed', latencyMs: s.latencyMs || 700 }))
        );
        setStageTelemetry(prev => ({
          search: { ...prev.search, sourceCount: 24 },
          synthesis: { ...prev.synthesis, sourceCount: 18 },
          drafting: { ...prev.drafting, sourceCount: 5 }
        }));

        const lower = q.toLowerCase();
        const isSubro = lower.includes('subrogation');
        const isSync = lower.includes('policycenter') || lower.includes('sync');

        const newSparkpage: SparkpageData = {
          id: `sp-${Date.now()}`,
          query: q,
          title: isSubro
            ? 'ClaimCenter Subrogation & Recovery Triage'
            : isSync
            ? 'ClaimCenter & PolicyCenter Sync Patterns'
            : q,
          subtitle: 'Multi-agent synthesis across 24 ClaimCenter sources',
          generatedDate: 'Just now',
          consensusScore: 95,
          agentExecutionTimeSec: 3.5,
          sourcesScannedCount: 24,
          sections: [
            {
              id: 'sec-dynamic-1',
              title: 'Summary',
              summary: isSubro
                ? 'Automated fault detection and Gosu referral rules cut recovery cycle time while preserving adjuster override controls.'
                : isSync
                ? 'Point-in-time coverage snapshots and asynchronous App Events prevent tight coupling between PolicyCenter and ClaimCenter.'
                : 'Guidewire Cloud deployments separate external REST orchestration from core transactional Gosu rules.',
              content: isSubro
                ? 'ClaimCenter evaluates fault rating, adverse carrier metadata, and deductible recovery thresholds during exposure updates, creating SubrogationSummary referrals automatically when recovery probability passes carrier rules.'
                : isSync
                ? 'At FNOL, ClaimCenter fetches a verified policy snapshot by loss date via IPolicySearchAdapter or Cloud API, caching endorsements locally so claim adjudication stays resilient if PolicyCenter undergoes maintenance.'
                : 'Combining composite Cloud API requests for intake with pre-update Gosu authority rules minimizes upgrade diffs while guaranteeing ACID reserve and check validation.',
              citations: [1, 2],
              metrics: [
                { label: 'Consensus', value: '95%' },
                { label: 'Sources', value: '24' },
                { label: 'Latency', value: '3.5s' }
              ]
            },
            {
              id: 'sec-dynamic-2',
              title: 'Implementation Notes',
              summary: 'Core patterns verified against Guidewire Cloud documentation.',
              content:
                'Prefer versioned Cloud API payloads for Jutro portals and external webhooks; reserve Gosu rules for entity lifecycle constraints and reserve authority.',
              bullets: [
                'Validate policy coverage against DateOfLoss before creating exposures.',
                'Enforce adjuster reserve authority inside TransactionSet pre-update rules.',
                'Emit recovery and check updates via App Events rather than polling.'
              ],
              citations: [1, 3, 5]
            }
          ],
          comparisonTable: SAMPLE_SPARKPAGES[0].comparisonTable,
          keyTakeaways: [
            'Use ClaimCenter Cloud API for external FNOL and document intake.',
            'Keep reserve limits and subrogation rules inside Gosu pre-update hooks.',
            'Ingest this synthesis into your local vault for offline RAG lookup.'
          ],
          citations: SAMPLE_SPARKPAGES[0].citations
        };

        setActiveSparkpage(newSparkpage);
        setIsResearching(false);
      }
    }, 700);
  };

  const handleIngest = () => {
    setIngestedSuccess(true);
    if (onIngestToNotebook) {
      onIngestToNotebook(activeSparkpage);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-col h-full w-full overflow-y-auto pr-0.5'
          : 'flex flex-col h-full max-w-4xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto'
      }
    >
      {offlineOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 mb-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Offline mode active — Research agents paused</span>
          </div>
          {onEnableHybrid && (
            <button
              type="button"
              onClick={onEnableHybrid}
              className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-medium transition-colors shrink-0"
            >
              Enable Hybrid
            </button>
          )}
        </div>
      )}

      {/* Query Bar */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              aria-label="Web research topic query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunResearch()}
              disabled={offlineOnly}
              placeholder={
                offlineOnly
                  ? 'Switch to Hybrid to dispatch research agents...'
                  : 'Search ClaimCenter workflows, Cloud API, or Gosu...'
              }
              className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-zinc-500 disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={() => handleRunResearch()}
            disabled={isResearching || offlineOnly}
            className="px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs sm:text-sm font-medium transition-colors shrink-0 disabled:opacity-40"
          >
            {isResearching ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {/* Horizontal 3-Stage Progress Stepper */}
      <AgentTaskTimeline
        steps={agentSteps}
        telemetry={stageTelemetry}
        isResearching={isResearching}
        selectedStageId={selectedStageId}
        onSelectStage={handleSelectStage}
      />

      {/* Sparkpage Output */}
      <article className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4 sm:p-5">
        <div className="border-b border-zinc-800 pb-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>Sparkpage</span>
              <span>·</span>
              <span>{activeSparkpage.generatedDate}</span>
            </div>

            <button
              type="button"
              onClick={handleIngest}
              disabled={ingestedSuccess}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                ingestedSuccess
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{ingestedSuccess ? 'Saved to Vault' : 'Save to Vault'}</span>
            </button>
          </div>

          <h2 className="text-base sm:text-xl font-semibold text-zinc-100 tracking-tight">
            {activeSparkpage.title}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {activeSparkpage.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] font-mono tabular-nums text-zinc-400">
            <span>
              Consensus <strong className="text-emerald-400 font-medium">{activeSparkpage.consensusScore}%</strong>
            </span>
            <span>·</span>
            <span>{activeSparkpage.sourcesScannedCount} sources</span>
            <span>·</span>
            <span>{activeSparkpage.agentExecutionTimeSec}s</span>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {activeSparkpage.sections.map((section) => {
            const isExpanded = expandedSections[section.id] !== false;

            return (
              <div
                key={section.id}
                className="rounded-lg bg-zinc-950/60 border border-zinc-800/90 p-3.5"
              >
                <div
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <h3 className="text-sm font-medium text-zinc-100">{section.title}</h3>
                  <button
                    type="button"
                    aria-label={`Toggle ${section.title}`}
                    className="text-zinc-500 hover:text-zinc-200 p-1"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-zinc-300 mt-1 leading-relaxed">
                  {section.summary}
                </p>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-3">
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
                      {section.content}
                    </p>

                    {section.bullets && (
                      <ul className="space-y-1 pl-4 list-disc text-xs sm:text-sm text-zinc-400">
                        {section.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}

                    {section.metrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {section.metrics.map((m, i) => (
                          <div key={i} className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="text-[10px] text-zinc-500">{m.label}</div>
                            <div className="text-sm font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
                              {m.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {section.citations.map(cId => {
                        const cit = activeSparkpage.citations.find(c => c.id === cId);
                        return (
                          <button
                            key={cId}
                            type="button"
                            onClick={() => setSelectedCitation(cit || null)}
                            className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
                          >
                            [{cId}] {cit?.domain}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {activeSparkpage.comparisonTable && (
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/90 p-3.5 overflow-x-auto">
              <h3 className="text-sm font-medium text-zinc-100 mb-2.5">Comparison</h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    {activeSparkpage.comparisonTable.headers.map((h, i) => (
                      <th key={i} className="py-2 px-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-zinc-300">
                  {activeSparkpage.comparisonTable.rows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-2.5 font-medium text-zinc-100">{row.entity}</td>
                      {row.values.map((val, vIdx) => (
                        <td key={vIdx} className="py-2 px-2.5 font-mono text-[11px] text-zinc-400">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/90 p-3.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">
              Takeaways
            </h3>
            <ul className="space-y-1.5">
              {activeSparkpage.keyTakeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-zinc-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      {/* Citation Modal */}
      {selectedCitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3 mb-3">
              <div>
                <span className="text-[11px] font-mono text-zinc-500">
                  Source #{selectedCitation.id}
                </span>
                <h4 className="text-sm font-semibold text-zinc-100 mt-0.5 leading-snug">
                  {selectedCitation.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCitation(null)}
                aria-label="Close citation"
                className="text-zinc-400 hover:text-zinc-100 px-1.5 py-0.5 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 leading-relaxed">
                "{selectedCitation.snippet}"
              </p>

              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                <span>{selectedCitation.domain}</span>
                <span className="text-emerald-400">{selectedCitation.reliabilityScore}% trust</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <span className="text-[10px] font-mono text-zinc-500">{selectedCitation.crawlTimestamp}</span>
                <a
                  href={selectedCitation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-zinc-200 hover:text-white font-medium"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
