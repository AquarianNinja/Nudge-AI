import React, { useState } from 'react';
import { X, Key, Eye, EyeOff, AlertCircle, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AppSettings, PaidProviderId } from '../types/index.ts';
import {
  PAID_PROVIDERS,
  maskApiKey,
  validateApiKeyFormat
} from '../utils/providerRouting.ts';
import { getStaggerDelay, MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import { AnimatedCheckmark, MotionSheet } from './MotionPrimitives.tsx';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  focusProvider?: PaidProviderId | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export const ApiKeysModal: React.FC<ApiKeysModalProps> = ({
  isOpen,
  onClose,
  settings,
  focusProvider,
  onUpdateSettings
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const handleKeyChange = (provider: PaidProviderId, value: string) => {
    onUpdateSettings({
      apiKeys: {
        ...settings.apiKeys,
        [provider]: value
      }
    });
  };

  const handleCustomChange = (
    field: keyof AppSettings['customEndpoint'],
    value: string
  ) => {
    onUpdateSettings({
      customEndpoint: {
        ...settings.customEndpoint,
        [field]: value
      }
    });
  };

  return (
    <MotionSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Paid API Keys and Custom Endpoints"
      maxWidthClass="max-w-lg"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-[#2B98FF]" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Paid API Keys & Custom Endpoints
          </h3>
        </div>
        <motion.button
          type="button"
          data-haptic="selection"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={onClose}
          aria-label="Close API keys dialog"
          className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto">
        <p className="text-[11px] text-zinc-400">
          Stored locally in this session for Cloud, Hybrid, and Custom routing.
        </p>

        <div className="space-y-2.5">
          {PAID_PROVIDERS.map((provider, idx) => {
            const rawVal = settings.apiKeys[provider.id] || '';
            const hasValue = rawVal.trim().length > 0;
            const check = validateApiKeyFormat(provider.id, rawVal);
            const isRevealed = Boolean(revealed[provider.id]);
            const isFocused = focusProvider === provider.id;

            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: prefersReduced ? 0 : MOTION_OFFSETS.listItemSlidePx }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    ...MOTION_TRANSITIONS.elementEnter,
                    delay: prefersReduced ? 0 : getStaggerDelay(idx)
                  }
                }}
                className={`p-3 rounded-2xl transition-colors space-y-2 ${
                  isFocused
                    ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/12'
                    : 'liquid-glass-subtle'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-100">
                      {provider.name}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {provider.activities}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
                    {hasValue ? (
                      check.valid ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                          <span>{maskApiKey(rawVal)}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-300">
                          <AlertCircle className="w-3 h-3" />
                          <span>{check.message}</span>
                        </span>
                      )
                    ) : (
                      <span className="text-zinc-500">Not set</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type={isRevealed ? 'text' : 'password'}
                    aria-label={`${provider.name} API key`}
                    value={rawVal}
                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                    placeholder={provider.placeholder}
                    className="flex-1 liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
                  />
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() =>
                      setRevealed(prev => ({ ...prev, [provider.id]: !isRevealed }))
                    }
                    aria-label={isRevealed ? `Hide ${provider.name} key` : `Show ${provider.name} key`}
                    className="p-2 rounded-xl liquid-glass-subtle hover:bg-white/10 text-zinc-300 hover:text-white"
                  >
                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </motion.button>
                  {hasValue && (
                    <motion.button
                      type="button"
                      data-haptic="warning"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => handleKeyChange(provider.id, '')}
                      aria-label={`Clear ${provider.name} key`}
                      className="p-2 rounded-xl liquid-glass-subtle hover:bg-red-500/15 text-zinc-300 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Custom Endpoint Fields */}
        <div className="p-3.5 rounded-2xl liquid-glass-subtle space-y-2.5">
          <div className="text-xs font-medium text-zinc-100">Custom Endpoints</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                LLM / Slides Base URL
              </label>
              <input
                type="text"
                aria-label="Custom LLM base URL"
                value={settings.customEndpoint.baseUrl}
                onChange={(e) => handleCustomChange('baseUrl', e.target.value)}
                placeholder="https://llm.internal/v1"
                className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                Custom LLM Model ID
              </label>
              <input
                type="text"
                aria-label="Custom LLM model ID"
                value={settings.customEndpoint.modelId}
                onChange={(e) => handleCustomChange('modelId', e.target.value)}
                placeholder="claimcenter-llama-70b"
                className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                Custom ASR / Diarize URL
              </label>
              <input
                type="text"
                aria-label="Custom transcription URL"
                value={settings.customEndpoint.transcriptionUrl}
                onChange={(e) => handleCustomChange('transcriptionUrl', e.target.value)}
                placeholder="https://asr.internal/v1/transcribe"
                className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                Custom ASR Model ID
              </label>
              <input
                type="text"
                aria-label="Custom transcription model ID"
                value={settings.customEndpoint.transcriptionModelId}
                onChange={(e) => handleCustomChange('transcriptionModelId', e.target.value)}
                placeholder="whisperx-large-v3-diarize"
                className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end shrink-0">
        <motion.button
          type="button"
          data-haptic="selection"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={onClose}
          className="px-5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold transition-opacity hover:opacity-95 whitespace-nowrap"
        >
          Done
        </motion.button>
      </div>
    </MotionSheet>
  );
};
