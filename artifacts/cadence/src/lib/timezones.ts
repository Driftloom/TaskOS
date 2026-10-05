/**
 * IANA Timezone definitions, resolution, and formatting utilities for Cadence.
 */

export interface TimezoneOption {
  id: string; // Canonical IANA identifier, e.g. "Asia/Kolkata"
  city: string; // e.g. "Kolkata"
  region: string; // e.g. "Asia"
  offset: string; // e.g. "UTC+05:30"
  abbr: string; // e.g. "IST"
  currentTime: string; // e.g. "07:30 PM"
  isPopular?: boolean;
}

/** Curated popular timezones for quick selection */
export const POPULAR_TIMEZONES: readonly string[] = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
] as const;

/** Mapping from common abbreviations and country/city aliases to canonical IANA timezone identifiers */
export const TIMEZONE_ALIASES: Record<string, string> = {
  // India
  ist: 'Asia/Kolkata',
  india: 'Asia/Kolkata',
  calcutta: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  'asia/calcutta': 'Asia/Kolkata',

  // US & Canada
  est: 'America/New_York',
  edt: 'America/New_York',
  eastern: 'America/New_York',
  nyc: 'America/New_York',
  'new york': 'America/New_York',

  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  central: 'America/Chicago',
  chicago: 'America/Chicago',

  mst: 'America/Denver',
  mdt: 'America/Denver',
  mountain: 'America/Denver',
  denver: 'America/Denver',

  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  pacific: 'America/Los_Angeles',
  california: 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',

  // Europe
  gmt: 'Europe/London',
  bst: 'Europe/London',
  london: 'Europe/London',
  uk: 'Europe/London',

  cet: 'Europe/Paris',
  cest: 'Europe/Paris',
  paris: 'Europe/Paris',
  france: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  germany: 'Europe/Berlin',
  amsterdam: 'Europe/Amsterdam',

  // Asia / Middle East
  gst: 'Asia/Dubai',
  dubai: 'Asia/Dubai',
  uae: 'Asia/Dubai',

  sgt: 'Asia/Singapore',
  singapore: 'Asia/Singapore',

  jst: 'Asia/Tokyo',
  tokyo: 'Asia/Tokyo',
  japan: 'Asia/Tokyo',

  hkt: 'Asia/Hong_Kong',
  'hong kong': 'Asia/Hong_Kong',

  cst_china: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  china: 'Asia/Shanghai',

  kst: 'Asia/Seoul',
  seoul: 'Asia/Seoul',
  korea: 'Asia/Seoul',

  // Australia & Pacific
  aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  australia: 'Australia/Sydney',

  nzst: 'Pacific/Auckland',
  nzdt: 'Pacific/Auckland',
  auckland: 'Pacific/Auckland',
  'new zealand': 'Pacific/Auckland',

  // Standard UTC
  utc: 'UTC',
  zulu: 'UTC',
};

/**
 * Returns formatted UTC offset for a given timezone, e.g. "UTC+05:30" or "UTC-04:00"
 */
export function getTimezoneOffset(tz: string, date = new Date()): string {
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT') return 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'UTC';
    const formatted = offsetPart.replace(/^GMT/, 'UTC');
    if (formatted === 'UTC+0' || formatted === 'UTC-0') return 'UTC';
    return formatted;
  } catch {
    return 'UTC';
  }
}

/**
 * Returns formatted abbreviation or short name for a given timezone, e.g. "IST", "EDT"
 */
export function getTimezoneAbbr(tz: string, date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const part = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (part && !part.startsWith('GMT') && !part.startsWith('UTC')) {
      return part;
    }
  } catch {
    // fallback
  }

  // Common known shortcodes
  if (tz === 'Asia/Kolkata') return 'IST';
  if (tz === 'America/New_York') return 'ET';
  if (tz === 'America/Chicago') return 'CT';
  if (tz === 'America/Denver') return 'MT';
  if (tz === 'America/Los_Angeles') return 'PT';
  if (tz === 'Europe/London') return 'GMT';
  if (tz === 'Europe/Paris' || tz === 'Europe/Berlin') return 'CET';
  if (tz === 'Asia/Tokyo') return 'JST';
  if (tz === 'Asia/Singapore') return 'SGT';
  if (tz === 'Australia/Sydney') return 'AET';
  if (tz === 'UTC') return 'UTC';

  return '';
}

/**
 * Returns the current local time string for a given timezone, e.g. "07:30 PM"
 */
export function getTimezoneCurrentTime(tz: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * Resolves a potential user shorthand or alias (e.g. "IST", "India", "Calcutta")
 * to its standard canonical IANA identifier (e.g. "Asia/Kolkata").
 */
export function resolveTimezoneAlias(input: string): string | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (TIMEZONE_ALIASES[normalized]) {
    return TIMEZONE_ALIASES[normalized];
  }
  // Try direct IANA match case-insensitive
  const all = getAllSupportedTimezones();
  const direct = all.find((tz) => tz.toLowerCase() === normalized);
  if (direct) return direct;
  return null;
}

/**
 * Returns all IANA timezones supported by the runtime environment.
 */
const FALLBACK_TIMEZONES: readonly string[] = [
  ...POPULAR_TIMEZONES,
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Caracas',
  'America/Mexico_City',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Manila',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Atlantic/Reykjavik',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Brussels',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Honolulu',
  'Pacific/Fiji',
];

/**
 * Returns all IANA timezones supported by the runtime environment.
 */
export function getAllSupportedTimezones(): string[] {
  let runtimeValues: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      runtimeValues = Intl.supportedValuesOf('timeZone');
    }
  } catch {
    // Fallback if supportedValuesOf is not available
  }
  const set = new Set<string>([
    ...FALLBACK_TIMEZONES,
    'Asia/Kolkata',
    ...runtimeValues,
  ]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Formats a raw IANA string into a structured TimezoneOption object.
 */
export function parseTimezoneOption(tz: string, now = new Date()): TimezoneOption {
  const parts = tz.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  const region = parts.length > 1 ? parts[0] : 'Global';
  return {
    id: tz,
    city,
    region,
    offset: getTimezoneOffset(tz, now),
    abbr: getTimezoneAbbr(tz, now),
    currentTime: getTimezoneCurrentTime(tz, now),
    isPopular: POPULAR_TIMEZONES.includes(tz as (typeof POPULAR_TIMEZONES)[number]),
  };
}

/**
 * Searches and filters timezones against a query string.
 */
export function filterTimezones(query: string, allTimezones = getAllSupportedTimezones()): TimezoneOption[] {
  const trimmed = query.trim().toLowerCase();
  const now = new Date();

  // If empty query, return popular timezones first followed by common zones
  if (!trimmed) {
    const popularSet = new Set(POPULAR_TIMEZONES);
    const popularOptions = POPULAR_TIMEZONES.map((tz) => parseTimezoneOption(tz, now));
    const restOptions = allTimezones
      .filter((tz) => !popularSet.has(tz as (typeof POPULAR_TIMEZONES)[number]))
      .slice(0, 50)
      .map((tz) => parseTimezoneOption(tz, now));
    return [...popularOptions, ...restOptions];
  }

  // Check alias shortcut first
  const aliasTarget = TIMEZONE_ALIASES[trimmed];

  const scored: Array<{ option: TimezoneOption; score: number }> = [];

  for (const tz of allTimezones) {
    const opt = parseTimezoneOption(tz, now);
    let score = -1;

    // Exact alias target gets highest priority
    if (aliasTarget && tz === aliasTarget) {
      score = 100;
    } else if (tz.toLowerCase() === trimmed) {
      score = 90;
    } else if (opt.city.toLowerCase() === trimmed) {
      score = 80;
    } else if (opt.abbr.toLowerCase() === trimmed) {
      score = 75;
    } else if (opt.city.toLowerCase().startsWith(trimmed)) {
      score = 60;
    } else if (tz.toLowerCase().includes(trimmed)) {
      score = 50;
    } else if (opt.offset.toLowerCase().includes(trimmed)) {
      score = 40;
    } else {
      // Check alias keys that match
      for (const [aliasKey, targetTz] of Object.entries(TIMEZONE_ALIASES)) {
        if (targetTz === tz && aliasKey.includes(trimmed)) {
          score = Math.max(score, 30);
        }
      }
    }

    if (score >= 0) {
      // Boost popular timezones slightly
      if (opt.isPopular) score += 5;
      scored.push({ option: opt, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.option.id.localeCompare(b.option.id));
  return scored.slice(0, 60).map((s) => s.option);
}
