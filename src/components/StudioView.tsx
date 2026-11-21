import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Copy,
  FileCheck2,
  FileDown,
  FileText,
  Key,
  Layers,
  Presentation,
  Sparkles,
  Upload
} from 'lucide-react';
import {
  AnnotatedTranscriptEntry,
  AnnotationTagType,
  AppSettings,
  ClientPdfReport,
  DictionaryEntry,
  GwtCriterion,
  MeetingSession,
  PaidProviderId,
  StudioDeliverableTab,
  StudioProviderId
} from '../types/index.ts';
import { INITIAL_MEETING_SESSION } from '../utils/meetingNotes.ts';
import { extractTextFromPdfBytesOrString } from '../utils/dictionaryLearning.ts';
import {
  SIMULATED_REQUIREMENTS_PDF_TEXT,
  STUDIO_CLOUD_PROVIDERS,
  buildClientReportPdfBytes,
  checkStudioCloudReadiness,
  exportAnnotatedTranscriptToMarkdown,
  exportGwtCriteriaToMarkdown,
  generateAnnotatedTranscript,
  generateClientPdfReport,
  generateGwtCriteriaFromPdfText
} from '../utils/studioEngine.ts';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  buildListItemVariants,
  buildTabVariants,
  getTabTransitionDirection
} from '../utils/motion.ts';
import { AnimatedCheckmark, MotionAlertBanner } from './MotionPrimitives.tsx';
import { SlideDeckView } from './SlideDeckView.tsx';

interface StudioViewProps {
  settings: AppSettings;
  meetingSessions: MeetingSession[];
  dictionaryEntries: DictionaryEntry[];
  seedSession?: MeetingSession | null;
  onOpenSettings: () => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
}

const DELIVERABLE_TABS: Array<{
  id: StudioDeliverableTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'slides', label: 'Slide Deck', icon: Presentation },
  { id: 'gwt', label: 'GWT Criteria', icon: FileCheck2 },
  { id: 'pdf-report', label: 'Client PDF Report', icon: FileDown },
  { id: 'annotated-transcript', label: 'Annotated Transcript', icon: Layers }
];

const TAG_STYLE: Record<AnnotationTagType, string> = {
  DECISION: 'text-emerald-300 border-emerald-800/60 bg-emerald-950/30',
  ACTION: 'text-sky-300 border-sky-800/60 bg-sky-950/30',
  RISK: 'text-amber-300 border-amber-800/60 bg-amber-950/30',
  RULE: 'text-zinc-200 border-zinc-700 bg-zinc-900',
  ENTITY: 'text-zinc-300 border-zinc-800 bg-zinc-950'
};

const TAB_ORDER: readonly StudioDeliverableTab[] = [
  'slides',
  'gwt',
  'pdf-report',
  'annotated-transcript'
];

export const StudioView: React.FC<StudioViewProps> = ({
  settings,
  meetingSessions,
  dictionaryEntries,
  seedSession,
  onOpenSettings,
  onOpenApiKeys
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const tabVariants = buildTabVariants(prefersReduced);
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [[activeTab, tabDirection], setTabState] = useState<[StudioDeliverableTab, 1 | -1]>([
    'slides',
    1
  ]);
  const setActiveTab = (next: StudioDeliverableTab) => {
    setTabState(([prev]) => {
      if (prev === next) return [prev, 1];
      return [next, getTabTransitionDirection(TAB_ORDER, prev, next)];
    });
  };
  const [preferredProvider, setPreferredProvider] = useState<StudioProviderId>('anthropic');

  const readiness = useMemo(
    () => checkStudioCloudReadiness(settings, preferredProvider),
    [settings, preferredProvider]
  );

  // GWT Acceptance Criteria state
  const reqFileRef = useRef<HTMLInputElement>(null);
  const [reqFileName, setReqFileName] = useState('ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf');
  const [reqText, setReqText] = useState(SIMULATED_REQUIREMENTS_PDF_TEXT);
  const [gwtCriteria, setGwtCriteria] = useState<GwtCriterion[]>(() =>
    generateGwtCriteriaFromPdfText(
      SIMULATED_REQUIREMENTS_PDF_TEXT,
      'ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf',
      'Anthropic'
    )
  );
  const [copiedGwt, setCopiedGwt] = useState(false);

  // Client Shareable PDF Report state
  const activeSession = seedSession || meetingSessions[0] || INITIAL_MEETING_SESSION;
  const [selectedSessionId, setSelectedSessionId] = useState<string>(activeSession.id);
  const [clientName, setClientName] = useState('Apex Mutual Insurance');
  const [preparedFor, setPreparedFor] = useState('Claims Architecture Steering Committee');
  const [reportTone, setReportTone] = useState<'Executive' | 'Technical' | 'Client Brief'>('Executive');
  const [clientReport, setClientReport] = useState<ClientPdfReport>(() =>
    generateClientPdfReport({
      clientName: 'Apex Mutual Insurance',
      preparedFor: 'Claims Architecture Steering Committee',
      tone: 'Executive',
      session: activeSession,
      gwtCount: 5,
      providerLabel: 'Cloud Studio'
    })
  );
  const [pdfDownloadedName, setPdfDownloadedName] = useState<string | null>(null);

  // Annotated Structured Transcript state
  const [tagFilter, setTagFilter] = useState<'ALL' | AnnotationTagType>('ALL');
  const [annotatedEntries, setAnnotatedEntries] = useState<AnnotatedTranscriptEntry[]>(() =>
    generateAnnotatedTranscript(activeSession, dictionaryEntries, 'Cloud Studio')
  );
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const selectedSession =
    meetingSessions.find(s => s.id === selectedSessionId) || activeSession;

  const handleUploadRequirementsPdf = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const extracted = extractTextFromPdfBytesOrString(new Uint8Array(buffer), file.name);
    const nextText = extracted.trim() || SIMULATED_REQUIREMENTS_PDF_TEXT;
    setReqFileName(file.name);
    setReqText(nextText);
    if (readiness.ready) {
      setGwtCriteria(generateGwtCriteriaFromPdfText(nextText, file.name, readiness.providerLabel));
    }
  };

  const handleSimulateRequirementsPdf = () => {
    const fileName = 'ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf';
    setReqFileName(fileName);
    setReqText(SIMULATED_REQUIREMENTS_PDF_TEXT);
    if (readiness.ready) {
      setGwtCriteria(
        generateGwtCriteriaFromPdfText(SIMULATED_REQUIREMENTS_PDF_TEXT, fileName, readiness.providerLabel)
      );
    }
  };

  const handleGenerateGwt = () => {
    if (!readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setGwtCriteria(generateGwtCriteriaFromPdfText(reqText, reqFileName, readiness.providerLabel));
    triggerHaptic('success');
  };

  const handleCopyGwt = async () => {
    const md = exportGwtCriteriaToMarkdown(gwtCriteria, reqFileName, readiness.providerLabel);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard fallback in headless environments
    }
    setCopiedGwt(true);
    triggerHaptic('success');
    setTimeout(() => setCopiedGwt(false), 1800);
  };

  const handleGenerateReport = () => {
    if (!readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setClientReport(
      generateClientPdfReport({
        clientName,
        preparedFor,
        tone: reportTone,
        session: selectedSession,
        gwtCount: gwtCriteria.length,
        providerLabel: readiness.providerLabel
      })
    );
    triggerHaptic('success');
  };

  const handleDownloadPdf = () => {
    if (!readiness.ready) return;
    const freshReport = generateClientPdfReport({
      clientName,
      preparedFor,
      tone: reportTone,
      session: selectedSession,
      gwtCount: gwtCriteria.length,
      providerLabel: readiness.providerLabel
    });
    setClientReport(freshReport);

    const bytes = buildClientReportPdfBytes(freshReport);
    const fileSlug = `${freshReport.clientName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_claimcenter_report.pdf`;
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileSlug;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setPdfDownloadedName(fileSlug);
    triggerHaptic('success');
    setTimeout(() => setPdfDownloadedName(null), 2600);
  };

  const handleGenerateAnnotated = () => {
    if (!readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setAnnotatedEntries(
      generateAnnotatedTranscript(selectedSession, dictionaryEntries, readiness.providerLabel)
    );
    triggerHaptic('success');
  };

  const handleCopyAnnotated = async () => {
    const md = exportAnnotatedTranscriptToMarkdown(
      annotatedEntries,
      selectedSession.title,
      readiness.providerLabel
    );
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard fallback
    }
    setCopiedTranscript(true);
    triggerHaptic('success');
    setTimeout(() => setCopiedTranscript(false), 1800);
  };

  const filteredTranscript =
    tagFilter === 'ALL'
      ? annotatedEntries
      : annotatedEntries.filter(e => e.annotations.some(a => a.type === tagFilter));

  return (
    <div className="@container flex flex-col h-full max-w-6xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto space-y-3">
      {/* Studio Cloud-Only Top Header & Deliverable Navigation */}
      <div className="p-3.5 rounded-2xl liquid-glass space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <h2 className="text-sm font-semibold text-zinc-100">Cloud Studio</h2>
          </div>

          {/* Cloud LLM Provider Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Studio Cloud API provider"
              value={readiness.activeProvider || preferredProvider}
              onChange={(e) => setPreferredProvider(e.target.value as StudioProviderId)}
              className="liquid-glass-subtle rounded-full px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
            >
              {STUDIO_CLOUD_PROVIDERS.map(p => {
                const isConfigured = readiness.configuredProviders.includes(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.modelLabel} {isConfigured ? '✓' : '(Key Required)'}
                  </option>
                );
              })}
            </select>

            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => onOpenApiKeys(preferredProvider)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
            >
              <Key className="w-3.5 h-3.5 text-[#2B98FF]" />
              <span>Cloud Keys</span>
            </motion.button>
          </div>
        </div>

        {/* Strict Cloud Key Gating Banner */}
        {readiness.ready ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-200">
            <div className="flex items-center gap-2 min-w-0">
              <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate text-[11px]">
                Active Cloud Pipeline: {readiness.providerLabel} · {readiness.modelLabel}
              </span>
            </div>
          </div>
        ) : (
          <MotionAlertBanner
            shakeKey={`${preferredProvider}-${readiness.reason || 'gate'}`}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs bg-amber-500/12 border-amber-400/35 text-amber-200 backdrop-blur-md"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
              <span className="text-[11px] leading-snug">{readiness.reason}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {settings.offlineOnly ? (
                <motion.button
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={onOpenSettings}
                  className="px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold whitespace-nowrap shrink-0"
                >
                  Open Settings
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => onOpenApiKeys(preferredProvider)}
                  className="px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold whitespace-nowrap shrink-0"
                >
                  Add Cloud API Key
                </motion.button>
              )}
            </div>
          </MotionAlertBanner>
        )}

        {/* Studio Deliverable Sub-Tabs */}
        <div
          role="tablist"
          aria-label="Studio deliverables"
          className="flex flex-wrap items-center gap-1 p-1 rounded-2xl liquid-glass-subtle"
        >
          {DELIVERABLE_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                role="tab"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="studio-tab-pill"
                    transition={MOTION_SPRINGS.pill}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl liquid-lens-active"
                  />
                )}
                <Icon className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            );
          })}
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
      {/* DELIVERABLE 1: Slide Deck (Cloud-Only Enforced) */}
      {activeTab === 'slides' && (
        <SlideDeckView
          settings={settings}
          seedSession={seedSession}
          cloudOnly
          studioProviderLabel={readiness.providerLabel}
          studioModelLabel={readiness.modelLabel}
          studioCloudReady={readiness.ready}
          studioGateReason={readiness.reason}
          onOpenSettings={onOpenSettings}
          onOpenApiKeys={() => onOpenApiKeys(preferredProvider)}
        />
      )}

      {/* DELIVERABLE 2: GWT Business Acceptance Criteria from Requirements PDF */}
      {activeTab === 'gwt' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl liquid-glass space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-zinc-100">
                  GWT Criteria
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono truncate">
                  {reqFileName} · {gwtCriteria.length} stories
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={reqFileRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadRequirementsPdf(file);
                    e.target.value = '';
                  }}
                />
                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => reqFileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>Upload Requirements PDF</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleSimulateRequirementsPdf}
                  className="px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 whitespace-nowrap shrink-0"
                >
                  Simulate ClaimCenter PRD
                </motion.button>
                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced || !readiness.ready ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleGenerateGwt}
                  disabled={!readiness.ready}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate GWT</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleCopyGwt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                >
                  {copiedGwt ? <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-300" />}
                  <span>{copiedGwt ? 'Copied' : 'Export MD'}</span>
                </motion.button>
              </div>
            </div>

            <textarea
              aria-label="Requirements source text"
              rows={3}
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-hidden focus:border-white/30 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3">
            <AnimatePresence initial={false}>
              {gwtCriteria.map((item, idx) => (
                <motion.div
                  key={item.id}
                  layout="position"
                  custom={idx}
                  variants={listItemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="p-4 rounded-2xl liquid-glass space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-zinc-400">{item.storyCode}</span>
                      <span className="text-zinc-600">·</span>
                      <h4 className="text-xs font-semibold text-zinc-100 truncate">{item.title}</h4>
                    </div>
                    <span
                      className={`text-[10px] font-mono shrink-0 ${
                        item.priority === 'Must' ? 'text-emerald-300' : 'text-zinc-400'
                      }`}
                    >
                      {item.priority}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs leading-relaxed">
                    <div>
                      <span className="font-mono text-[10px] uppercase text-zinc-400 mr-2">Given</span>
                      <span className="text-zinc-300">{item.given}</span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase text-zinc-400 mr-2">When</span>
                      <span className="text-zinc-200">{item.when}</span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase text-emerald-400 mr-2">Then</span>
                      <span className="text-zinc-100">{item.then}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>Edge: {item.edgeCase}</span>
                    <span className="font-mono">{item.sourceRef}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* DELIVERABLE 3: Client Shareable High-Quality PDF Report */}
      {activeTab === 'pdf-report' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl liquid-glass space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-zinc-100">
                Client PDF Report
              </h3>

              <div className="flex flex-wrap items-center gap-1.5">
                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced || !readiness.ready ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleGenerateReport}
                  disabled={!readiness.ready}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 disabled:opacity-40 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>Refresh Preview</span>
                </motion.button>
                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced || !readiness.ready ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleDownloadPdf}
                  disabled={!readiness.ready}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download Shareable PDF</span>
                </motion.button>
              </div>
            </div>

            <div className="grid grid-cols-1 @xl:grid-cols-4 gap-2">
              <input
                type="text"
                aria-label="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client Name..."
                className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
              <input
                type="text"
                aria-label="Prepared for recipient"
                value={preparedFor}
                onChange={(e) => setPreparedFor(e.target.value)}
                placeholder="Prepared For..."
                className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
              <select
                aria-label="Report tone"
                value={reportTone}
                onChange={(e) =>
                  setReportTone(e.target.value as 'Executive' | 'Technical' | 'Client Brief')
                }
                className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
              >
                <option value="Executive">Executive Tone</option>
                <option value="Technical">Technical Architecture</option>
                <option value="Client Brief">Client Brief</option>
              </select>
              <select
                aria-label="Source meeting session"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
              >
                {meetingSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    Session {s.sessionNumber}: {s.title}
                  </option>
                ))}
              </select>
            </div>

            {pdfDownloadedName && (
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exported {pdfDownloadedName}</span>
              </div>
            )}
          </div>

          {/* High-Contrast Print-Grade Client Report Sheet Preview inside Liquid Glass Frame */}
          <div className="p-2 rounded-[22px] liquid-glass">
            <article
              aria-label="Client PDF Report Preview"
              className="rounded-2xl bg-zinc-50 text-zinc-950 p-6 sm:p-8 border border-zinc-300 space-y-5 shadow-lg"
            >
              <header className="border-b border-zinc-300 pb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    {clientReport.tone} Deliverable · {clientReport.generatedDate}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-950 mt-1">
                    {clientReport.title}
                  </h3>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    Prepared for {clientReport.preparedFor}
                  </p>
                </div>
                <div className="text-right text-[10px] font-mono text-zinc-500">
                  <div>Verified Cloud Output</div>
                  <div>{clientReport.providerLabel}</div>
                </div>
              </header>

              <section className="space-y-1.5">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Executive Summary
                </h4>
                <p className="text-xs sm:text-sm leading-relaxed text-zinc-800">
                  {clientReport.executiveSummary}
                </p>
              </section>

              <section className="grid grid-cols-2 @xl:grid-cols-4 gap-2.5">
                {clientReport.keyMetrics.map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-zinc-100 border border-zinc-200">
                    <div className="text-[10px] text-zinc-500">{m.label}</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-zinc-950 mt-0.5">
                      {m.value}
                    </div>
                  </div>
                ))}
              </section>

              <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5">
                <section className="space-y-2">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                    Key Decisions
                  </h4>
                  <ul className="space-y-1.5 text-xs text-zinc-800">
                    {clientReport.decisions.map((d, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-mono text-zinc-400">0{idx + 1}</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="space-y-2">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                    Action Ownership Matrix
                  </h4>
                  <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg text-xs">
                    {clientReport.actionMatrix.map((row, idx) => (
                      <div key={idx} className="p-2 flex items-start justify-between gap-2">
                        <div>
                          <span className="font-semibold text-zinc-900">{row.owner}: </span>
                          <span className="text-zinc-700">{row.deliverable}</span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                          {row.target}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="space-y-1.5 pt-2 border-t border-zinc-200">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Risk & Mitigation Register
                </h4>
                {clientReport.risks.map((r, i) => (
                  <div key={i} className="text-xs text-zinc-800">
                    <span className="font-semibold">Risk: </span>
                    <span>{r.risk}</span>
                    <span className="text-zinc-500"> — Mitigation: {r.mitigation}</span>
                  </div>
                ))}
              </section>
            </article>
          </div>
        </div>
      )}

      {/* DELIVERABLE 4: Annotated Structured Transcript */}
      {activeTab === 'annotated-transcript' && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl liquid-glass flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2B98FF] shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100">
                Annotated Transcript
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Transcript source session"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="liquid-glass-subtle rounded-full px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
              >
                {meetingSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    Session {s.sessionNumber}: {s.title}
                  </option>
                ))}
              </select>

              <motion.button
                type="button"
                data-haptic="off"
                whileTap={prefersReduced || !readiness.ready ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleGenerateAnnotated}
                disabled={!readiness.ready}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Annotate Transcript</span>
              </motion.button>

              <motion.button
                type="button"
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleCopyAnnotated}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
              >
                {copiedTranscript ? (
                  <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-zinc-300" />
                )}
                <span>{copiedTranscript ? 'Copied' : 'Export MD'}</span>
              </motion.button>
            </div>
          </div>

          {/* Tag Filter Bar */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-full liquid-glass-subtle w-fit">
            {(['ALL', 'DECISION', 'ACTION', 'RISK', 'RULE', 'ENTITY'] as const).map(tag => {
              const active = tagFilter === tag;
              return (
                <motion.button
                  key={tag}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setTagFilter(tag)}
                  className={`relative px-2.5 py-1 rounded-full text-[10px] font-mono transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="studio-tag-filter-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{tag}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="rounded-2xl liquid-glass divide-y divide-white/10">
            <AnimatePresence initial={false}>
              {filteredTranscript.map((entry, idx) => (
                <motion.div
                  key={entry.id}
                  layout="position"
                  custom={idx}
                  variants={listItemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-[11px] text-[#2B98FF]">
                        {entry.timestamp}
                      </span>
                      {entry.speakerTag && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {entry.speakerTag}
                          </span>
                        </>
                      )}
                      <span className="text-zinc-600">·</span>
                      <span className="font-medium text-zinc-100">{entry.speaker}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-400">
                      {entry.annotations.map((ann, i) => (
                        <span key={i} className={TAG_STYLE[ann.type].split(' ')[0]}>
                          {ann.type}: {ann.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">{entry.text}</p>

                  {entry.linkedDictionaryTerms.length > 0 && (
                    <div className="text-[10px] font-mono text-zinc-400">
                      Dictionary links: {entry.linkedDictionaryTerms.join(' · ')}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
