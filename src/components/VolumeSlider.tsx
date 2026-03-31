/**
 * VolumeSlider Component
 *
 * Compact horizontal volume slider for track volume control.
 * Uses native HTML range input with custom styling.
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { sliderToDb } from '../utils/volume-conversion';

interface VolumeSliderProps {
  /** Volume value from 0 to 1 */
  value: number;
  /** Called when volume changes (debounced) */
  onChange: (value: number) => void;
  /** Disable the slider */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format slider value as dB for tooltip display
 */
function formatDb(value: number): string {
  const db = sliderToDb(value);
  if (db <= -60) return '-∞ dB';
  const sign = db >= 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

/**
 * Debounce helper for volume changes
 */
function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  // Local state for immediate visual feedback
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  // Sync local value with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  // Debounced onChange to prevent IPC spam
  const debouncedOnChange = useDebouncedCallback(onChange, 50);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      setLocalValue(newValue);
      debouncedOnChange(newValue);
    },
    [debouncedOnChange]
  );

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Send final value immediately on release
    onChange(localValue);
  }, [localValue, onChange]);

  return (
    <div
      className={`flex items-center ${className}`}
      title={`Volume: ${formatDb(localValue)}`}
    >
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={localValue}
        onChange={handleChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        disabled={disabled}
        className={`
          w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-gray-700
          disabled:opacity-50 disabled:cursor-not-allowed
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-sas-accent
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-sas-accent
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:cursor-pointer
        `}
      />
    </div>
  );
};

export default VolumeSlider;
