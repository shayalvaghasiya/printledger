// Sliced-file import parsers.
//
// `.gcode` and `.3mf` carry no universally-standardized metadata: each slicer
// writes its own comment conventions. These parsers are deliberately tolerant —
// they look for the common patterns from PrusaSlicer, Cura, Simplify3D and
// OrcaSlicer and return *best-effort* results with `warnings` describing what was
// or wasn't found. Manual entry is always the ultimate fallback: the import only
// *pre-fills* the form.

export interface ParsedSlice {
  /** total print time in seconds, or null when not found */
  timeSeconds: number | null;
  /** filament budget in grams, or null when not found */
  grams: number | null;
  /** filament length in metres, or null when not found */
  meters: number | null;
  warnings: string[];
}

// --- duration parsing -------------------------------------------------------

/** Parse "1h 23m 45s", "2d 5h", "17m 30s", "120s", "1.5h" → seconds, else null. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/^(about|approx|~)\s*/i, '');
  if (!s) return null;
  const re = /^\s*(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?\s*$/;
  const m = re.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  const [, d, h, min, sec] = m;
  const total =
    (d ? parseFloat(d) * 86400 : 0) +
    (h ? parseFloat(h) * 3600 : 0) +
    (min ? parseFloat(min) * 60 : 0) +
    (sec ? parseFloat(sec) : 0);
  return total > 0 ? total : null;
}

/**
 * Parse a seconds value that may carry a unit: "12840", "12840s", "1.5h",
 * "2d 3h 4m" → seconds.
 */
export function parseSeconds(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (/^[\d.,]+$/.test(s)) {
    const n = Number(s.replace(/\s/g, ''));
    return isFinite(n) ? n : null;
  }
  return parseDuration(s);
}

// --- main parser ------------------------------------------------------------

function toNumber(s: string): number | null {
  const cleaned = s.replace(/[^\d.+\-eE]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

/**
 * Parse .gcode text. Returns best-effort time/grams/meters plus warnings.
 * Recognizes (case-insensitive, any order):
 *   PrusaSlicer: `; TIME:12840`, `; estimated printing time (normal mode) = 3h 34m 8s`,
 *                `; filament used [g] = 8.7`, `; filament used [mm] = 2922.3`
 *   Cura:        `;TIME:7200`, `; Filament used: 8.7m / 29.2g`, `; Filament length: 8.7m`
 *   OrcaSlicer:  `; TIME:...`, `; filament used [g] = 8.7`
 *   Simplify3D:  `;   Print Time:      = 3h 34m 8s`, `;   Filament:        = 2922.3 mm`
 */
export function parseGcode(text: string): ParsedSlice {
  const warnings: string[] = [];
  let timeSeconds: number | null = null;
  let grams: number | null = null;
  let meters: number | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().toLowerCase().replace(/^;+\s*/, '');

    if (timeSeconds === null) {
      // `;TIME:12345` (seconds) / `; time: 12345`
      const secMatch = line.match(/^\s*time\s*[:=]\s*(\d+(?:\.\d+)?)\s*$/);
      // `estimated printing time (normal mode) = 3h 34m 8s` — Prusa/Cura/Orca
      const estMatch = line.match(/estimated\s+printing\s*time[^=]*=\s*([0-9dhms.\s]+)\s*$/);
      // `print time: = 3h 34m 8s` — Simplify3D
      const s3dMatch = line.match(/print\s*time\s*[:=]\s*=\s*([0-9dhms.\s]+)\s*$/);
      if (secMatch) {
        const v = parseSeconds(secMatch[1]);
        if (v !== null) timeSeconds = v;
      } else if (estMatch) {
        const v = parseDuration(estMatch[1]);
        if (v !== null) timeSeconds = v;
      } else if (s3dMatch) {
        const v = parseDuration(s3dMatch[1]);
        if (v !== null) timeSeconds = v;
      }
    }

    if (grams === null) {
      // `; filament used [g] = 8.7` — Prusa/Orca
      const gMatch = line.match(/filament\s+used\s*\[g\]\s*=\s*([\d.,]+)/);
      // `; Filament used: 8.7m / 29.2g` — Cura
      const lgMatch = line.match(/filament\s+used\s*:\s*([\d.,]+)\s*m\s*\/\s*([\d.,]+)\s*g\b/);
      if (gMatch) {
        const v = toNumber(gMatch[1]);
        if (v !== null) grams = v;
      } else if (lgMatch) {
        const g = toNumber(lgMatch[2]);
        const m = toNumber(lgMatch[1]);
        if (g !== null) grams = g;
        if (m !== null && meters === null && m > 0) meters = m;
      }
    }

    if (meters === null) {
      // `; Filament used: 8.7m / 29.2g` (already captured grams; also gives meters)
      const lgMatch = line.match(/filament\s+used\s*:\s*([\d.,]+)\s*m\b/);
      // `; Filament length: 8.7m` — Cura
      const lengthMatch = line.match(/filament\s+length\s*:\s*([\d.,]+)\s*m\b/);
      // `; filament used [mm] = 2922.3` — Prusa/Orca (length in mm)
      const usedMm = line.match(/filament\s+used\s*\[mm\]\s*=\s*([\d.,]+)/);
      // `;   Filament:        = 2922.3 mm` — Simplify3D
      const s3dFil = line.match(/^\s*filament\s*[:=]\s*=\s*([\d.,]+)\s*mm\b/);
      if (lgMatch) {
        const v = toNumber(lgMatch[1]);
        if (v !== null && v > 0) meters = v;
      } else if (lengthMatch) {
        const v = toNumber(lengthMatch[1]);
        if (v !== null && v > 0) meters = v;
      } else if (usedMm) {
        const v = toNumber(usedMm[1]);
        if (v !== null && v > 0) meters = v / 1000;
      } else if (s3dFil) {
        const v = toNumber(s3dFil[1]);
        if (v !== null && v > 0) meters = v / 1000;
      }
    }
  }

  if (timeSeconds === null)
    warnings.push('No print time found in this file (looked for Cura/Prusa/Orca/Simplify3D headers).');
  if (grams === null && meters === null)
    warnings.push('No filament usage found — enter grams manually, or import a spool to convert metres → grams.');

  return { timeSeconds, grams, meters, warnings };
}

/**
 * Parse the metadata (XML) of a `.3mf` container. Cura & PrusaSlicer write
 * `<metadata name="cura:print_time" ...>7234</metadata>`, `cura:material_weight`,
 * `cura:extrusion_weight`, `slic3r ...` fields. Values may carry units.
 */
export function parse3mfMetadata(xml: string): ParsedSlice {
  const warnings: string[] = [];
  let timeSeconds: number | null = null;
  let grams: number | null = null;
  let meters: number | null = null;

  const metaRe = /<metadata\s+name=["']([^"']+)["'][^>]*>([^<]*)<\/metadata>/g;
  let match: RegExpExecArray | null;

  const grabNumber = (m: RegExpExecArray): number | null => {
    const v = parseSeconds(m[2].trim());
    return v;
  };

  while ((match = metaRe.exec(xml)) !== null) {
    const name = match[1].toLowerCase();
    if (!match[2].trim()) continue;

    if (timeSeconds === null && /print[_\-:.]*time/.test(name)) {
      const v = grabNumber(match);
      if (v !== null && v > 0) timeSeconds = v;
    }
    if (grams === null && /(filament|material|extrusion).*(weight|used|grams?)/.test(name)) {
      let v = toNumber(match[2]);
      if (v === null) v = grabNumber(match);
      if (v !== null && v > 0) grams = v;
    }
    if (meters === null && /(filament|material|extrusion).*(length|used)/.test(name) && /mm/.test(match[2])) {
      let v = toNumber(match[2]);
      if (v === null) v = grabNumber(match);
      if (v !== null && v > 0) meters = v / 1000;
    }
  }

  if (timeSeconds === null) warnings.push('No print time metadata found in this .3mf.');
  if (grams === null && meters === null)
    warnings.push('No filament usage metadata found in this .3mf.');

  return { timeSeconds, grams, meters, warnings };
}