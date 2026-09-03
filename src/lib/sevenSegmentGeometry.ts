/**
 * Single source of truth for the 7-segment layout, shared by the SVG renderer
 * (SevenSegmentDisplay) and the pixel decoder (imageDecoder). Coordinates are
 * "logical units" within one digit cell; multiply by a scale factor to reach
 * actual pixels in a rendered raster.
 */

export const SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

// Reverse lookup: sorted segment-name key -> digit character.
export const SEGMENTS_TO_DIGIT: Record<string, string> = Object.fromEntries(
  Object.entries(SEGMENTS).map(([digit, segs]) => [[...segs].sort().join(""), digit])
);

// x, y, width, height for each bar within a 40x70 digit cell.
export const BARS: Record<string, [number, number, number, number]> = {
  a: [6, 2, 28, 6],
  f: [2, 6, 6, 28],
  b: [32, 6, 6, 28],
  g: [6, 32, 28, 6],
  e: [2, 36, 6, 28],
  c: [32, 36, 6, 28],
  d: [6, 62, 28, 6],
};

// Center point of each segment, as a fraction of the fixed cell box -- used
// by the decoder to sample the right pixel regardless of raster resolution.
export const SEGMENT_CENTERS: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(BARS).map(([name, [x, y, w, h]]) => [name, [x + w / 2, y + h / 2]])
);

export const CELL_WIDTH = 40;
export const DOT_WIDTH = 16;
export const CELL_HEIGHT = 70;
export const VIEWPORT_HEIGHT = CELL_HEIGHT + 8; // matches the SVG's fixed viewBox height
export const LEFT_MARGIN = 4;

export const DOT_CENTER: [number, number] = [4 + 3, CELL_HEIGHT - 8 + 3];
