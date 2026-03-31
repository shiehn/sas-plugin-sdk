/**
 * PanSlider Component
 *
 * Compact horizontal pan slider for track stereo positioning.
 * Range: -1 (left) to +1 (right), 0 = center.
 * No text label - tooltip only.
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';

interface PanSliderProps {
  /** Pan value from -1 (left) to 1 (right), 0 = center */
  value: number;
  /** Called when pan changes (debounced) */
  onChange: (value: number) => void;
  /** Disable the slider */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Convert pan value (-1 to 1) to display string
 */
function toPanDisplay(value: number): string {
  if (Math.abs(value) < 0.02) {
    return 'Center';
  }
  const percent = Math.abs(Math.round(value * 100));
  return value < 0 ? `L${percent}` : `R${percent}`;
}

/**
 * Debounce helper for pan changes
 */
function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

export const PanSlider: React.FC<PanSliderProps> = ({
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

  // Double-click to reset to center
  const handleDoubleClick = useCallback(() => {
    setLocalValue(0);
    onChange(0);
  }, [onChange]);

  return (
    <div
      className={`flex items-center ${className}`}
      title={`Pan: ${toPanDisplay(localValue)}`}
    >
      <input
        type="range"
        min="-1"
        max="1"
        step="0.01"
        value={localValue}
        onChange={handleChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        onDoubleClick={handleDoubleClick}
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

export default PanSlider;
