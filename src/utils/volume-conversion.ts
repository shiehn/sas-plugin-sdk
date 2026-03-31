/**
 * Volume Conversion Utilities
 *
 * Converts between UI slider position (0-1) and engine dB values using a power
 * curve with +6 dB headroom. The curve places unity gain (0 dB) at slider 0.75,
 * giving the top 25% of the slider a meaningful 6 dB boost range instead of the
 * previous perceptual dead zone.
 *
 * Mapping:
 *   slider 0.00 → -60 dB (silence)
 *   slider 0.75 →   0 dB (unity gain)
 *   slider 1.00 →  +6 dB (max boost)
 */

/** Slider position that maps to 0 dB (unity gain) */
export const SLIDER_UNITY = 0.75;

/** Maximum dB value at slider = 1.0 */
export const DB_MAX = 6;

/** Minimum dB value (silence floor) */
export const DB_MIN = -60;

/**
 * Exponent derived so that slider=1.0 yields exactly DB_MAX dB.
 *
 * gain_at_1 = (1 / SLIDER_UNITY) ^ EXPONENT = 10^(DB_MAX/20)
 * EXPONENT  = log(10^(DB_MAX/20)) / log(1/SLIDER_UNITY)
 */
const EXPONENT: number =
  Math.log(Math.pow(10, DB_MAX / 20)) / Math.log(1 / SLIDER_UNITY);

/**
 * Convert a UI slider position (0-1) to engine dB.
 *
 * @param slider - Slider value in [0, 1]
 * @returns dB value in [DB_MIN, DB_MAX]
 */
export function sliderToDb(slider: number): number {
  if (slider <= 0) return DB_MIN;
  const gain = Math.pow(slider / SLIDER_UNITY, EXPONENT);
  const db = 20 * Math.log10(gain);
  return Math.max(DB_MIN, Math.min(DB_MAX, db));
}

/**
 * Convert an engine dB value back to a UI slider position (0-1).
 * Inverse of sliderToDb().
 *
 * @param db - Volume in dB
 * @returns Slider value in [0, 1]
 */
export function dbToSlider(db: number): number {
  if (db <= DB_MIN) return 0;
  if (db >= DB_MAX) return 1;
  const gain = Math.pow(10, db / 20);
  const slider = SLIDER_UNITY * Math.pow(gain, 1 / EXPONENT);
  return Math.min(1, Math.max(0, slider));
}
