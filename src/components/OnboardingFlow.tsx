import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Cpu,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { AnimatePresence, motion, PanInfo, useReducedMotion } from 'motion/react';
import { useFirebaseAuth } from './FirebaseProvider.tsx';
import { MotionAlertBanner, MotionSheet } from './MotionPrimitives.tsx';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

interface OnboardingSlide {
  id: string;
  eyebrow: string;
  headline: string;
  supporting: string;
  accentClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 'welcome',
    eyebrow: '01 · Welcome',
    headline: 'Welcome to Nudge AI Notes',
    supporting: 'Your private, high-craft workspace for research, meetings, and autonomous execution.',
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#54B0FF]/35',
    Icon: Sparkles
  },
  {
    id: 'nanoteam',
    eyebrow: '02 · NanoTeam',
    headline: 'Meet NanoTeam',
    supporting: 'Coordinate focused AI teammates, shared channels, and structured deliverables in one view.',
    accentClass: 'bg-cyan-500/18 text-cyan-300 border-cyan-400/35',
    Icon: Users
  },
  {
    id: 'nanobots',
    eyebrow: '03 · Nanobots',
    headline: 'Nanobots That Research & Schedule',
    supporting: 'Release specialized bots that run once or on recurring schedules with live run history.',
    accentClass: 'bg-emerald-500/18 text-emerald-300 border-emerald-400/35',
    Icon: CalendarClock
  },
  {
    id: 'engine-style',
    eyebrow: '04 · Precision Tuning',
    headline: 'Choose Your Engine & Style',
    supporting: 'Pair Pulse, Atlas, or Nova engines with tailored office styles and compatible models.',
    accentClass: 'bg-violet-500/18 text-violet-300 border-violet-400/35',
    Icon: Cpu
  },
  {
    id: 'sandbox',
    eyebrow: '05 · Isolation',
    headline: 'Private Sandbox for Every Bot',
    supporting: 'Each Nanobot executes inside a strict bot-scoped sandbox with isolated memory and storage.',
    accentClass: 'bg-amber-500/18 text-amber-300 border-amber-400/35',
    Icon: Lock
  },
  {
    id: 'launch',
    eyebrow: '06 · Ready',
    headline: 'Ready to Launch',
    supporting: 'Link your Google account for cloud sync or jump straight into your NanoTeam workspace.',
    accentClass: 'bg-[#0F7FFF]/22 text-[#54B0FF] border-[#54B0FF]/45',
    Icon: Rocket
  }
];

interface OnboardingFlowProps {
  initialStage?: 'carousel' | 'link';
  onComplete: () => void;
}

const GoogleGIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76Z"
    />
  </svg>
);

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialStage = 'carousel',
  onComplete
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, isSigningIn, authError, signInWithGoogle, clearAuthError } = useFirebaseAuth();

  const [stage, setStage] = useState<'carousel' | 'link'>(initialStage);
  const [[slideIdx, slideDir], setSlideState] = useState<[number, 1 | -1]>([0, 1]);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const currentSlide = ONBOARDING_SLIDES[slideIdx];
  const isLastSlide = slideIdx === ONBOARDING_SLIDES.length - 1;
  const SlideIcon = currentSlide.Icon;

  const goToSlide = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, nextIdx));
    if (clamped === slideIdx) return;
    triggerHaptic('selection');
    setSlideState([clamped, clamped > slideIdx ? 1 : -1]);
  };

  const handleNext = () => {
    if (isLastSlide) {
      triggerHaptic('medium');
      setStage('link');
      return;
    }
    goToSlide(slideIdx + 1);
  };

  const handleSkipCarousel = () => {
    triggerHaptic('selection');
    setStage('link');
  };

  const handleSwipeEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -300) {
      if (!isLastSlide) goToSlide(slideIdx + 1);
    } else if (info.offset.x > 50 || info.velocity.x > 300) {
      if (slideIdx > 0) goToSlide(slideIdx - 1);
    }
  };

  useEffect(() => {
    if (stage !== 'carousel') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !isLastSlide) {
        goToSlide(slideIdx + 1);
      } else if (e.key === 'ArrowLeft' && slideIdx > 0) {
        goToSlide(slideIdx - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, slideIdx, isLastSlide]);

  const handleLinkGoogle = async () => {
    triggerHaptic('medium');
    clearAuthError();
    await signInWithGoogle();
  };

  const handleCompleteOnboarding = () => {
    triggerHaptic('success');
    onComplete();
  };

  return (
    <div
      role="region"
      aria-label="Onboarding and Account Setup"
      className="flex flex-col h-full w-full px-4 pt-3 pb-6 overflow-y-auto justify-between gap-4"
    >
      <AnimatePresence mode="wait">
        {stage === 'carousel' ? (
          <motion.div
            key="onboarding-carousel-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
            className="flex flex-col flex-1 min-h-0 justify-between gap-4"
          >
            {/* Top Bar: Step & Skip (slides 1-5 only) */}
            <div className="min-h-[44px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 tabular-nums">
                <Bot className="w-4 h-4 text-[#54B0FF]" />
                <span>
                  {slideIdx + 1} / {ONBOARDING_SLIDES.length}
                </span>
              </div>

              {!isLastSlide ? (
                <button
                  type="button"
                  data-haptic="selection"
                  onClick={handleSkipCarousel}
                  aria-label="Skip onboarding carousel"
                  className="min-h-[44px] px-3 rounded-xl liquid-glass-subtle text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Skip
                </button>
              ) : (
                <span className="min-h-[44px]" aria-hidden="true" />
              )}
            </div>

            {/* Swipeable Liquid Glass Card Carousel */}
            <div className="flex-1 min-h-0 flex items-center justify-center py-2 overflow-hidden">
              <AnimatePresence mode="wait" custom={slideDir}>
                <motion.div
                  key={currentSlide.id}
                  custom={slideDir}
                  drag={prefersReduced ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.22}
                  onDragEnd={handleSwipeEnd}
                  initial={
                    prefersReduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: slideDir * 36, scale: 0.98 }
                  }
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    transition: MOTION_SPRINGS.sheet
                  }}
                  exit={
                    prefersReduced
                      ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                      : {
                          opacity: 0,
                          x: slideDir * -36,
                          scale: 0.98,
                          transition: MOTION_TRANSITIONS.elementExit
                        }
                  }
                  className="w-full max-w-sm rounded-[32px] liquid-glass-elevated p-6 sm:p-7 flex flex-col items-center text-center gap-5 cursor-grab active:cursor-grabbing select-none"
                >
                  <div
                    className={`w-20 h-20 rounded-[26px] border flex items-center justify-center shadow-inner ${currentSlide.accentClass}`}
                  >
                    <SlideIcon className="w-10 h-10" />
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-[11px] font-mono tracking-wider uppercase text-[#54B0FF]">
                      {currentSlide.eyebrow}
                    </div>
                    <h1 className="text-xl font-semibold text-zinc-50 tracking-tight leading-snug">
                      {currentSlide.headline}
                    </h1>
                    <p className="text-[13px] text-zinc-300 leading-relaxed">
                      {currentSlide.supporting}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Glass Page Indicator + Primary Next / Get Started CTA */}
            <div className="space-y-4 shrink-0">
              <div
                role="tablist"
                aria-label="Onboarding slides"
                className="mx-auto w-fit flex items-center gap-1.5 px-3 py-2 rounded-full liquid-glass-subtle"
              >
                {ONBOARDING_SLIDES.map((slide, idx) => {
                  const active = idx === slideIdx;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Slide ${idx + 1}: ${slide.headline}`}
                      onClick={() => goToSlide(idx)}
                      className={`h-2 rounded-full transition-all duration-200 ${
                        active
                          ? 'w-6 bg-[#54B0FF]'
                          : 'w-2 bg-white/25 hover:bg-white/45'
                      }`}
                    />
                  );
                })}
              </div>

              <motion.button
                type="button"
                data-haptic="medium"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleNext}
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl liquid-accent-glass text-sm font-semibold flex items-center justify-center gap-2"
              >
                <span>{isLastSlide ? 'Get Started' : 'Next'}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="onboarding-link-stage"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.screenEnter }}
            exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
            className="flex flex-col flex-1 min-h-0 justify-between gap-5 max-w-sm mx-auto w-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                data-haptic="selection"
                onClick={() => setStage('carousel')}
                className="min-h-[44px] px-3 rounded-xl liquid-glass-subtle text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Back
              </button>

              <button
                type="button"
                data-haptic="selection"
                onClick={handleCompleteOnboarding}
                aria-label="Skip account linking for now"
                className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors"
              >
                Skip for now
              </button>
            </div>

            {/* Center Card */}
            <div className="rounded-[32px] liquid-glass-elevated p-6 space-y-5 my-auto">
              <div className="w-14 h-14 rounded-2xl bg-[#0F7FFF]/18 border border-[#54B0FF]/35 flex items-center justify-center text-[#54B0FF] mx-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>

              <div className="text-center space-y-1.5">
                <h1 className="text-lg font-semibold text-zinc-50 tracking-tight">
                  Link Your Account
                </h1>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Connect Google to sync your immutable User ID, Callsigns, and Nanobots across devices.
                </p>
              </div>

              {user ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-emerald-400/35 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {user.displayName || 'Google Account Linked'}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {user.email || 'Verified Firebase session'}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    data-haptic="medium"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={handleCompleteOnboarding}
                    className="w-full min-h-[50px] px-4 py-3 rounded-2xl liquid-accent-glass text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <span>Continue to NanoTeam</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-3">
                  <motion.button
                    type="button"
                    data-haptic="medium"
                    disabled={isSigningIn}
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => void handleLinkGoogle()}
                    aria-label="Link Google Account"
                    className="w-full min-h-[52px] px-4 py-3 rounded-2xl liquid-glass hover:bg-white/[0.12] border border-white/20 flex items-center justify-between gap-3 text-sm font-semibold text-zinc-50 transition-colors disabled:opacity-55"
                  >
                    <GoogleGIcon className="w-5 h-5 shrink-0" />
                    <span className="flex-1 text-center">
                      {isSigningIn ? 'Linking Google…' : 'Link Google'}
                    </span>
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  </motion.button>

                  {authError && (
                    <MotionAlertBanner
                      shakeKey={authError}
                      className="p-3 rounded-2xl bg-amber-500/12 border border-amber-400/35 text-xs text-amber-200 flex items-start justify-between gap-2"
                    >
                      <span className="leading-relaxed">{authError}</span>
                      <button
                        type="button"
                        onClick={clearAuthError}
                        className="text-[11px] font-semibold text-amber-300 hover:text-white shrink-0"
                      >
                        Dismiss
                      </button>
                    </MotionAlertBanner>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-white/10 text-center space-y-2">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Internal bot sandboxes and run logs are keyed strictly by your server-generated User ID, never your Callsign.
                </p>
                <div className="flex items-center justify-center gap-3 text-[11px] font-medium text-[#54B0FF]">
                  <button
                    type="button"
                    onClick={() => setLegalModal('terms')}
                    className="hover:underline"
                  >
                    Terms
                  </button>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={() => setLegalModal('privacy')}
                    className="hover:underline"
                  >
                    Privacy
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center pb-1">
              <button
                type="button"
                data-haptic="selection"
                onClick={handleCompleteOnboarding}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Continue without linking · Sync later in Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terms / Privacy Sheet */}
      <MotionSheet
        isOpen={legalModal !== null}
        onClose={() => setLegalModal(null)}
        ariaLabel={legalModal === 'terms' ? 'Terms of Use' : 'Privacy Policy'}
        maxWidthClass="max-w-md"
      >
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h2 className="text-sm font-semibold text-zinc-50">
              {legalModal === 'terms' ? 'Terms of Use' : 'Privacy & Sandbox Policy'}
            </h2>
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              aria-label="Close legal sheet"
              className="px-2.5 py-1 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-white/10"
            >
              Done
            </button>
          </div>
          {legalModal === 'terms' ? (
            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              <p>
                Nanobots execute automated research and scheduled workflows based on prompts and cadences you configure. Always verify critical outputs before sharing externally.
              </p>
              <p>
                Every Nanobot requires explicit AI & Data Disclosure consent before creation and logs your consent timestamp on release.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              <p>
                Account sessions are managed via Firebase Authentication. Your immutable backend User ID (NB-XXXX-XXXX) scopes all Nanobot sandboxes, Callsigns, and run records.
              </p>
              <p>
                Each Nanobot owns an isolated storage directory and scoped memory log. Deleting a Nanobot permanently wipes its sandbox directory.
              </p>
            </div>
          )}
        </div>
      </MotionSheet>
    </div>
  );
};
