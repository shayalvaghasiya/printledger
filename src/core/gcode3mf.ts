// .3mf container parser.
//
// A `.3mf` file is a ZIP archive. We only need two entries: `3D/3dmodel.model`
// (the 3DModel.xml, which carries `<metadata>` fields) and `Metadata/` (rarely).
// We use `fflate`, a tiny dependency-free ZIP implementation that runs in
// browsers, Node, Electron and Capacitor alike.

import { unzipSync, strFromU8 } from 'fflate';
import { parse3mfMetadata, type ParsedSlice } from './gcode';

function decodeU8(bytes: Uint8Array): string {
  // Strip a UTF-8 BOM if present.
  return strFromU8(bytes).replace(/^﻿/, '');
}

/**
 * Parse a `.3mf` file's bytes. Returns the same `ParsedSlice` as the gcode
 * parser. Throws `Error` on malformed archives (so UIs can show a message).
 */
export function parse3mf(bytes: Uint8Array): ParsedSlice {
  if (bytes.length === 0) throw new Error('Empty file.');
  if (!(bytes instanceof Uint8Array) || bytes[0] !== 0x50) {
    throw new Error('Not a .3mf file (expected a ZIP archive).');
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('Could not unzip this .3mf file — it may be corrupted.');
  }

  const keys = Object.keys(entries);
  const modelKey =
    keys.find((k) => k.endsWith('3dmodel.model')) ??
    keys.find((k) => k.toLowerCase().endsWith('.model'));

  if (!modelKey) {
    throw new Error('This .3mf has no 3D model metadata to read.');
  }

  const xml = decodeU8(entries[modelKey]);
  const parsed = parse3mfMetadata(xml);

  // If the primary model XML had nothing, some slicers stash a separate
  // `Metadata/*.model` (e.g. OrcaSlicer writes per-part metadata files).
  if (parsed.timeSeconds === null && parsed.grams === null && parsed.meters === null) {
    for (const k of keys) {
      if (k.toLowerCase().startsWith('metadata/')) {
        const extra = parse3mfMetadata(decodeU8(entries[k]));
        if (extra.timeSeconds !== null) parsed.timeSeconds = extra.timeSeconds;
        if (extra.grams !== null) parsed.grams = extra.grams;
        if (extra.meters !== null) parsed.meters = extra.meters;
        if (extra.timeSeconds !== null && extra.grams !== null) break;
      }
    }
  }

  return parsed;
}