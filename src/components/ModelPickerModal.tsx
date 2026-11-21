import React from 'react';
import { Download, X, Cpu, Mic } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ModelOption, WhisperModelOption } from '../types/index.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  buildTabVariants,
  getStaggerDelay,
  MOTION_TRANSITIONS
} from '../utils/motion.ts';
import { AnimatedCheckmark, MotionSheet } from './MotionPrimitives.tsx';

interface ModelPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  llmModels: ModelOption[];
  whisperModels: WhisperModelOption[];
  activeLlmId: string;
  activeWhisperId: string;
  initialSection?: 'llm' | 'whisper';
  downloadingModelId: string | null;
  onSelectLlm: (id: string) => void;
  onSelectWhisper: (id: string) => void;
  onDownloadLlm: (id: string) => void;
  onDownloadWhisper: (id: string) => void;
}

export const ModelPickerModal: React.FC<ModelPickerModalProps> = ({
  isOpen,
  onClose,
  llmModels,
  whisperModels,
  activeLlmId,
  activeWhisperId,
  initialSection = 'llm',
  downloadingModelId,
  onSelectLlm,
  onSelectWhisper,
  onDownloadLlm,
  onDownloadWhisper
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const tabVariants = buildTabVariants(prefersReduced);
  const [section, setSection] = React.useState<'llm' | 'whisper'>(initialSection);

  React.useEffect(() => {
    if (isOpen) setSection(initialSection);
  }, [isOpen, initialSection]);

  const direction = section === 'whisper' ? 1 : -1;

  return (
    <MotionSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Choose models"
      maxWidthClass="max-w-md"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-100">Models</h3>
        <motion.button
          type="button"
          data-haptic="selection"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={onClose}
          aria-label="Close model picker"
          className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>

      <div className="p-3 border-b border-white/10 shrink-0">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-full liquid-glass-subtle">
          <motion.button
            type="button"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              triggerHaptic('selection');
              setSection('llm');
            }}
            className={`relative flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              section === 'llm' ? 'text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {section === 'llm' && (
              <motion.span
                layoutId="model-picker-section-pill"
                transition={MOTION_SPRINGS.pill}
                aria-hidden="true"
                className="absolute inset-0 rounded-full liquid-lens-active"
              />
            )}
            <Cpu className="relative z-10 w-3.5 h-3.5" />
            <span className="relative z-10">Local LLM</span>
          </motion.button>
          <motion.button
            type="button"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              triggerHaptic('selection');
              setSection('whisper');
            }}
            className={`relative flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              section === 'whisper' ? 'text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {section === 'whisper' && (
              <motion.span
                layoutId="model-picker-section-pill"
                transition={MOTION_SPRINGS.pill}
                aria-hidden="true"
                className="absolute inset-0 rounded-full liquid-lens-active"
              />
            )}
            <Mic className="relative z-10 w-3.5 h-3.5" />
            <span className="relative z-10">Whisper Speech</span>
          </motion.button>
        </div>
      </div>

      <div className="p-3 max-h-[60vh] overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={section}
            custom={direction}
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-2"
          >
            {section === 'llm'
              ? llmModels.map((model, idx) => {
                  const isActive = model.id === activeLlmId;
                  const isDownloaded = model.isDownloaded !== false;
                  const isDownloading = downloadingModelId === model.id;

                  return (
                    <motion.div
                      key={model.id}
                      initial={{ opacity: 0, y: prefersReduced ? 0 : MOTION_OFFSETS.listItemSlidePx }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: {
                          ...MOTION_TRANSITIONS.elementEnter,
                          delay: prefersReduced ? 0 : getStaggerDelay(idx)
                        }
                      }}
                      className={`p-3 rounded-2xl transition-colors flex items-center justify-between gap-3 ${
                        isActive
                          ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/12'
                          : 'liquid-glass-subtle'
                      }`}
                    >
                      <motion.button
                        type="button"
                        data-haptic="selection"
                        whileTap={!prefersReduced && isDownloaded ? { scale: MOTION_OFFSETS.cardTapScale } : undefined}
                        transition={MOTION_SPRINGS.interactive}
                        disabled={!isDownloaded}
                        onClick={() => {
                          onSelectLlm(model.id);
                          onClose();
                        }}
                        className="flex-1 text-left min-w-0 disabled:opacity-60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-100 truncate">{model.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400">{model.quantization}</span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                          {(model.ramUsageMB / 1024).toFixed(1)} GB · {model.tokensPerSec} tok/s · {model.engine}
                        </div>
                      </motion.button>

                      {isDownloaded ? (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => {
                            onSelectLlm(model.id);
                            onClose();
                          }}
                          aria-label={`Use ${model.name}`}
                          className={`p-1.5 rounded-full text-xs shrink-0 ${
                            isActive
                              ? 'liquid-lens-active'
                              : 'liquid-glass-subtle text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          <AnimatedCheckmark
                            className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`}
                          />
                        </motion.button>
                      ) : (
                        <motion.button
                          type="button"
                          data-haptic="medium"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => onDownloadLlm(model.id)}
                          disabled={isDownloading}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-100 shrink-0 whitespace-nowrap"
                        >
                          <Download className="w-3 h-3 text-[#2B98FF]" />
                          <span>{isDownloading ? 'Getting...' : 'Get'}</span>
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })
              : whisperModels.map((model, idx) => {
                  const isActive = model.id === activeWhisperId;
                  const isDownloading = downloadingModelId === model.id;

                  return (
                    <motion.div
                      key={model.id}
                      initial={{ opacity: 0, y: prefersReduced ? 0 : MOTION_OFFSETS.listItemSlidePx }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: {
                          ...MOTION_TRANSITIONS.elementEnter,
                          delay: prefersReduced ? 0 : getStaggerDelay(idx)
                        }
                      }}
                      className={`p-3 rounded-2xl transition-colors flex items-center justify-between gap-3 ${
                        isActive
                          ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/12'
                          : 'liquid-glass-subtle'
                      }`}
                    >
                      <motion.button
                        type="button"
                        data-haptic="selection"
                        whileTap={!prefersReduced && model.isDownloaded ? { scale: MOTION_OFFSETS.cardTapScale } : undefined}
                        transition={MOTION_SPRINGS.interactive}
                        disabled={!model.isDownloaded}
                        onClick={() => {
                          onSelectWhisper(model.id);
                          onClose();
                        }}
                        className="flex-1 text-left min-w-0 disabled:opacity-60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-100 truncate">{model.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400">{model.accuracyLabel}</span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                          {model.sizeLabel} · {model.speedLabel}
                        </div>
                      </motion.button>

                      {model.isDownloaded ? (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => {
                            onSelectWhisper(model.id);
                            onClose();
                          }}
                          aria-label={`Use ${model.name}`}
                          className={`p-1.5 rounded-full text-xs shrink-0 ${
                            isActive
                              ? 'liquid-lens-active'
                              : 'liquid-glass-subtle text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          <AnimatedCheckmark
                            className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`}
                          />
                        </motion.button>
                      ) : (
                        <motion.button
                          type="button"
                          data-haptic="medium"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => onDownloadWhisper(model.id)}
                          disabled={isDownloading}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-100 shrink-0 whitespace-nowrap"
                        >
                          <Download className="w-3 h-3 text-[#2B98FF]" />
                          <span>{isDownloading ? 'Getting...' : 'Get'}</span>
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionSheet>
  );
};
