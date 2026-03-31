/**
 * SorceryProgressBar Component
 *
 * A progress bar for long, uncertain wait times (10-30s). Supports two modes:
 *
 * 1. **Time-based mode** (when `estimatedDurationMs` is provided):
 *    Uses elapsed time and an ease-out curve to pace progress realistically.
 *    Reaches ~90% at the estimated completion time, then asymptotically
 *    approaches 95% if the operation runs long.
 *
 * 2. **Phase-based mode** (legacy fallback, no `estimatedDurationMs`):
 *    "Zeno's Paradox" style - progress moves quickly at first, then
 *    asymptotically slows toward 95%.
 *
 * Visual style: Segmented "retro CLI" look with glowing teal accent,
 * diagonal stripes, and subtle pulse animation.
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * Props for SorceryProgressBar component
 */
interface SorceryProgressBarProps {
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Text shown during loading (default: "CONJURING...") */
  statusText?: string;
  /** Text shown on completion (default: "COMPLETE") */
  completeText?: string;
  /** Callback when loading completes */
  onComplete?: () => void;
  /** Height class override (default: "h-10") */
  heightClass?: string;
  /** Initial progress value (0-100) to resume from - persists across scene switches */
  initialProgress?: number;
  /** Callback when progress changes - use to persist progress in parent state */
  onProgressChange?: (progress: number) => void;
  /** Estimated total duration in ms - enables time-aware pacing */
  estimatedDurationMs?: number;
}

/**
 * Calculates target progress based on elapsed time and estimated duration.
 * Uses an ease-out power curve for natural-feeling progress:
 * - At 10% of estimated time: ~21%  (feels responsive early)
 * - At 30% of estimated time: ~53%  (good midpoint feel)
 * - At 50% of estimated time: ~74%  (past halfway visually)
 * - At 80% of estimated time: ~88%  (approaching completion)
 * - At 100% of estimated time: 90%  (leaves room for overshoot)
 * - Beyond estimate: asymptotically approaches 95%
 */
export function calculateTimeBasedTarget(elapsedMs: number, estimatedDurationMs: number): number {
  const t = elapsedMs / estimatedDurationMs;
  if (t <= 0) return 0;

  if (t <= 1.0) {
    // Ease-out power curve reaching 90% at t=1.0
    return 90 * (1 - Math.pow(1 - t, 2.5));
  }

  // Beyond estimate: asymptotically approach 95%
  const overshootRatio = (elapsedMs - estimatedDurationMs) / estimatedDurationMs;
  return 90 + 5 * (1 - Math.exp(-overshootRatio * 3));
}

/**
 * Calculates the next progress value using "Zeno's Paradox" algorithm (legacy fallback).
 * - Phase 1 (0-20%): Rapid progress (5-15% per tick)
 * - Phase 2 (20-60%): Steady progress (2-7% per tick)
 * - Phase 3 (60-95%): Asymptotic slowdown
 * - Caps at 95% until actual completion
 */
function calculateNextProgress(currentProgress: number): number {
  if (currentProgress < 20) {
    return currentProgress + Math.random() * 10 + 5;
  }
  if (currentProgress < 60) {
    return currentProgress + Math.random() * 5 + 2;
  }
  if (currentProgress < 95) {
    const remaining = 95 - currentProgress;
    const increment = remaining * (Math.random() * 0.2 + 0.1);
    return currentProgress + Math.max(increment, 0.1);
  }
  return 95;
}

/**
 * Calculates the next tick interval for phase-based mode (legacy fallback).
 */
function calculateNextTickInterval(progress: number): number {
  if (progress < 30) {
    return Math.random() * 200 + 150; // 150-350ms
  }
  if (progress < 70) {
    return Math.random() * 300 + 200; // 200-500ms
  }
  return Math.random() * 600 + 400; // 400-1000ms
}

/** Tick interval for time-based mode (ms) */
const TIME_BASED_TICK_MIN = 200;
const TIME_BASED_TICK_RANGE = 100;

/**
 * SorceryProgressBar - A mystical progress bar for uncertain wait times
 */
export function SorceryProgressBar({
  isLoading,
  statusText = 'CONJURING...',
  completeText = 'COMPLETE',
  onComplete,
  heightClass = 'h-10',
  initialProgress = 0,
  onProgressChange,
  estimatedDurationMs,
}: SorceryProgressBarProps): React.ReactElement | null {
  const [progress, setProgress] = useState<number>(initialProgress);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Initialize to false so first render with isLoading=true triggers animation start
  const isLoadingRef = useRef<boolean>(false);
  const hasStartedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);

  // Store callbacks in refs to avoid dependency issues
  const onProgressChangeRef = useRef(onProgressChange);
  const onCompleteRef = useRef(onComplete);
  onProgressChangeRef.current = onProgressChange;
  onCompleteRef.current = onComplete;

  // Store props in refs - only used when loading starts, not as dependencies
  const initialProgressRef = useRef(initialProgress);
  initialProgressRef.current = initialProgress;
  const estimatedDurationMsRef = useRef(estimatedDurationMs);
  estimatedDurationMsRef.current = estimatedDurationMs;

  // Effect to handle loading state changes - ONLY depends on isLoading
  useEffect(() => {
    const wasLoading = isLoadingRef.current;
    isLoadingRef.current = isLoading;

    if (isLoading && !wasLoading) {
      // Loading just started
      hasStartedRef.current = true;
      startTimeRef.current = Date.now();

      // Start fresh or resume from initial progress (read from ref)
      const startProgress = initialProgressRef.current > 0 ? initialProgressRef.current : 0;
      setProgress(startProgress);

      const duration = estimatedDurationMsRef.current;

      if (duration && duration > 0) {
        // Time-based mode: pace progress using elapsed time
        const tick = (): void => {
          setProgress((prev) => {
            const elapsed = Date.now() - startTimeRef.current;
            const target = calculateTimeBasedTarget(elapsed, duration);

            // Add subtle jitter for organic feel (±0.5%)
            const jitter = (Math.random() - 0.5) * 1.0;
            // Move toward target, ensure monotonically increasing, cap at 95%
            const next = Math.min(Math.max(target + jitter, prev + 0.05), 95);

            onProgressChangeRef.current?.(next);
            timerRef.current = setTimeout(tick, TIME_BASED_TICK_MIN + Math.random() * TIME_BASED_TICK_RANGE);
            return next;
          });
        };

        timerRef.current = setTimeout(tick, TIME_BASED_TICK_MIN);
      } else {
        // Phase-based mode (legacy fallback)
        const tick = (): void => {
          setProgress((prev) => {
            if (prev >= 95) {
              timerRef.current = setTimeout(tick, 1000);
              return 95;
            }

            const next = Math.min(calculateNextProgress(prev), 95);
            onProgressChangeRef.current?.(next);

            const interval = calculateNextTickInterval(next);
            timerRef.current = setTimeout(tick, interval);

            return next;
          });
        };

        const firstInterval = calculateNextTickInterval(startProgress);
        timerRef.current = setTimeout(tick, firstInterval);
      }
    } else if (!isLoading && wasLoading && hasStartedRef.current) {
      // Loading just finished - jump to 100%
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setProgress(100);
      onProgressChangeRef.current?.(100);
      onCompleteRef.current?.();
      hasStartedRef.current = false;
    }

    // Cleanup on unmount only
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // ONLY depend on isLoading - other props are read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Don't render if not loading and progress is 0
  if (!isLoading && progress === 0) {
    return null;
  }

  const displayProgress = Math.floor(progress);
  const isComplete = !isLoading && progress === 100;

  // Calculate transition duration based on progress phase
  const transitionDuration = progress < 50 ? '300ms' : progress < 80 ? '500ms' : '700ms';

  return (
    <div
      className={`relative w-full ${heightClass} bg-sas-panel-alt border border-sas-border rounded-sm overflow-hidden shadow-inner`}
    >
      {/* Progress fill with stripes and glow */}
      <div
        className={`
          h-full
          bg-gradient-to-r from-sas-accent/70 to-sas-accent
          shadow-glow-soft
          sorcery-progress-fill
          animate-progress-stripes
          ${progress > 70 ? 'animate-progress-pulse' : ''}
          transition-all ease-out
        `}
        style={{
          width: `${progress}%`,
          transitionDuration,
        }}
      />

      {/* Text overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isLoading && progress < 100 ? (
          <span className="font-mono text-xs text-sas-accent font-bold drop-shadow-md tracking-wider">
            {statusText} {displayProgress}%
          </span>
        ) : isComplete ? (
          <span className="font-mono text-xs text-sas-text font-bold drop-shadow-md tracking-wider">
            {completeText}
          </span>
        ) : null}
      </div>

      {/* Scanline overlay for retro CRT effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.3) 2px,
            rgba(0, 0, 0, 0.3) 4px
          )`,
        }}
      />
    </div>
  );
}

export default SorceryProgressBar;
