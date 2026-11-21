import React from 'react';
import { Key, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ActivityType,
  AppSettings,
  ExecutionApproach,
  PaidProviderId
} from '../types/index.ts';
import {
  APPROACH_LABELS,
  checkActivityReadiness,
  getDefaultModelForApproach,
  getModelsForActivity
} from '../utils/providerRouting.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { AnimatedCheckmark, MotionAlertBanner } from './MotionPrimitives.tsx';

interface ActivityPipelineBarProps {
  activity: ActivityType;
  label: string;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
}

const APPROACHES: ExecutionApproach[] = ['local', 'cloud', 'hybrid', 'custom'];

export const ActivityPipelineBar: React.FC<ActivityPipelineBarProps> = ({
  activity,
  label,
  settings,
  onUpdateSettings,
  onOpenApiKeys
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const currentRoute = settings.activityRoutes[activity];
  const models = getModelsForActivity(activity, currentRoute.approach);
  const readiness = checkActivityReadiness(activity, settings);

  const handleApproachChange = (nextApproach: ExecutionApproach) => {
    triggerHaptic('selection');
    const defaultModel = getDefaultModelForApproach(activity, nextApproach);
    onUpdateSettings({
      activityRoutes: {
        ...settings.activityRoutes,
        [activity]: {
          approach: nextApproach,
          modelId: defaultModel.id
        }
      }
    });
  };

  const handleModelChange = (modelId: string) => {
    triggerHaptic('selection');
    onUpdateSettings({
      activityRoutes: {
        ...settings.activityRoutes,
        [activity]: {
          ...currentRoute,
          modelId
        }
      }
    });
  };

  return (
    <div className="p-3 rounded-2xl liquid-glass space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-zinc-100 whitespace-nowrap">
            {label}
          </span>
          <span className="text-zinc-500">·</span>
          {readiness.ready ? (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 truncate">
              <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
              <span className="truncate">{readiness.pipelineSummary}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-mono text-amber-300 truncate">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{readiness.pipelineSummary}</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label={`${label} execution approach`}
            className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px]"
          >
            {APPROACHES.map((app) => {
              const active = currentRoute.approach === app;
              return (
                <motion.button
                  key={app}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => handleApproachChange(app)}
                  className={`relative px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                    active ? 'text-zinc-950' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`activity-approach-pill-${activity}`}
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{APPROACH_LABELS[app]}</span>
                </motion.button>
              );
            })}
          </div>

          <select
            aria-label={`${label} model`}
            value={readiness.model.id}
            onChange={(e) => handleModelChange(e.target.value)}
            className="liquid-glass-subtle rounded-lg px-2.5 py-1 text-[11px] text-zinc-100 max-w-[260px] focus:outline-hidden focus:border-[#0F7FFF]"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.requiresPaidKey ? '(Paid API)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!readiness.ready && (
          <MotionAlertBanner
            shakeKey={`${activity}-${currentRoute.approach}-${readiness.reason || 'blocked'}`}
            className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px]"
          >
            <span className="text-amber-300/95">{readiness.reason}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {readiness.missingProvider && (
                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => onOpenApiKeys(readiness.missingProvider)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-lens-active font-medium transition-opacity hover:opacity-95"
                >
                  <Key className="w-3 h-3" />
                  <span>Add Key</span>
                </motion.button>
              )}
              {settings.offlineOnly && (
                <motion.button
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => onUpdateSettings({ offlineOnly: false })}
                  className="px-2.5 py-1 rounded-full liquid-lens-active font-medium"
                >
                  Enable Hybrid
                </motion.button>
              )}
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => handleApproachChange('local')}
                className="px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-200 font-medium transition-colors"
              >
                Use Local
              </motion.button>
            </div>
          </MotionAlertBanner>
        )}
      </AnimatePresence>
    </div>
  );
};
