/**
 * utils/context.js — Request-time context builder.
 *
 * Builds a plain context object that captures the temporal state at the moment
 * a recommendation request is made. This is the single source of truth for
 * time/day awareness in the scoring engine — no scoring rule should call
 * `new Date()` directly.
 *
 * Context schema:
 *   hour        {number}  — 0–23, current server hour
 *   timeOfDay   {string}  — "morning" | "afternoon" | "evening" | "night"
 *   isWeekend   {boolean} — true on Saturday (6) and Sunday (0)
 *   isLateNight {boolean} — true when hour is in the night band (23:00 – 04:59)
 *                           Convenience flag used by v7 late-night scoring rules.
 *   dayName     {string}  — e.g. "Monday", useful for debug / logging
 *
 * Time-of-day bands:
 *   morning    05:00 – 11:59
 *   afternoon  12:00 – 17:59
 *   evening    18:00 – 22:59
 *   night      23:00 – 04:59
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Derives the timeOfDay label from a 0–23 hour value.
 *
 * @param {number} hour
 * @returns {"morning"|"afternoon"|"evening"|"night"}
 */
export const hourToTimeOfDay = (hour) => {
  if (hour >= 5  && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  if (hour >= 18 && hour <= 22) return "evening";
  return "night";
};

/**
 * Builds the request-time context object from the current Date.
 * Optionally accepts a Date so tests can inject a fixed timestamp.
 *
 * @param {Date} [now=new Date()] — injectable for deterministic unit testing
 * @returns {{ hour: number, timeOfDay: string, isWeekend: boolean, dayName: string }}
 */
export const buildContext = (now = new Date()) => {
  const hour      = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  return {
    hour,
    timeOfDay:   hourToTimeOfDay(hour),
    isWeekend:   dayOfWeek === 0 || dayOfWeek === 6,
    isLateNight: hour >= 23 || hour < 5,
    dayName:     DAY_NAMES[dayOfWeek],
  };
};
