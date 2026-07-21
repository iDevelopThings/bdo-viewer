/**
 * map-config.ts — world-map geometry for the BDO radar-tile pyramid.
 *
 * Tiles are 128px at 100 game-units/pixel → 12,800 units per native tile, indexed
 * straight off the game coordinate with origin at world (0,0): tileX = floor(X/12800),
 * tileY = floor(Z/12800) (+Z is north, so we render flipY:false = north-up). The
 * extractor writes a zoom pyramid; per-layer geometry (grid, max zoom, ocean color)
 * comes from worldmap/<layer>/meta.json — see WorldMeta / fetchWorldMeta.
 */

import type {MaybeReadonly} from "@/types.ts";

/** Native (finest-level) tile geometry. */
export const TILE_PX = 128;
export const UNITS_PER_PIXEL = 100;
/** Game units covered by one native tile: 128 * 100 = 12,800. */
export const TILE_WORLD_SIZE = TILE_PX * UNITS_PER_PIXEL;

// Only show labels once zoomed in past this pyramid level; zoomed further out they just
// stack into an unreadable blob, so we hide them there.
export const MAP_LABEL_MIN_Z = 7;

// A fixed coarse level kept always-resident under the detail level. Because pinning the
// detail level recreates its tileset on every zoom change (losing cross-level history),
// this is what covers the view during a transition — a blurry base rather than bare
// background — in a handful of cheap, cached tiles.
export const MAP_WORLD_BASE_Z = 4;

// The main data layer used for the world map
export const WORLD_LAYER = "world";

/** Per-layer pyramid descriptor the extractor writes to worldmap/<layer>/meta.json. */
export interface WorldMeta {
  tilePx: number;
  unitsPerPixel: number;
  unitsPerTile: number;
  minZoom: number;
  maxZoom: number;
  /** World-unit size of a z=0 tile; deck's TileLayer tileSize. */
  tileWorldSizeZ0: number;
  grid: {xmin: number; xmax: number; ymin: number; ymax: number};
  /** Fill-tile mean RGB; paint the backdrop this so the sea reads continuous. */
  oceanColor: [number, number, number];
}

/** Load a layer's pyramid descriptor. */
export async function fetchWorldMeta(layer = "world"): Promise<WorldMeta> {
  const res = await fetch(`/icons/worldmap/${layer}/meta.json`);
  if (!res.ok) throw new Error(`worldmap meta ${layer}: ${res.status}`);
  return (await res.json()) as WorldMeta;
}

/** deck.gl tile URL for (z,x,y) in a layer — served from the layer's tiles.pack. */
export function tileURL(layer: string, z: number, x: number, y: number): string {
  return `/icons/worldmap/${layer}/${z}/${x}/${y}.webp`;
}

/** [minX, minY, maxX, maxY] in game units, from a layer's grid — keeps deck from
 *  requesting tiles outside the extracted region. */
export function worldExtent(m: MaybeReadonly<WorldMeta>): [number, number, number, number] {
  return [
    m.grid.xmin * m.unitsPerTile,
    m.grid.ymin * m.unitsPerTile,
    (m.grid.xmax + 1) * m.unitsPerTile,
    (m.grid.ymax + 1) * m.unitsPerTile,
  ];
}

/** World rectangle of tile (x,y) at pyramid level z: {left,right} in X, {bottom,top} in Z
 *  (image top row → north edge, consumed with flipY:false). */
export function tileWorldBounds(m: MaybeReadonly<WorldMeta>, z: number, x: number, y: number) {
  const size = m.tileWorldSizeZ0 / Math.pow(2, z);
  return {left: x * size, right: (x + 1) * size, bottom: y * size, top: (y + 1) * size};
}


// ------------------------------------------------------------------
// game <-> world/tile helpers (independent of the pyramid)
// ------------------------------------------------------------------

/** Engine coordinate → map. BDO stores [X, Y, Z] with Y = height; the ground plane is
 *  (X, Z) and we keep +Z north (flipY:false). */
export function gameToWorld(
  game: [number, number, number],
): {position: [number, number]; elevation: number} {
  const [x, height, z] = game;
  return {position: [x, z], elevation: height};
}

/** Native tile index (finest level) containing a world/game coordinate. */
export function worldToTile(worldX: number, worldZ: number): [number, number] {
  return [Math.floor(worldX / TILE_WORLD_SIZE), Math.floor(worldZ / TILE_WORLD_SIZE)];
}

export interface ViewState2D {
  target: [number, number];
  zoom: number;
  width: number;
  height: number;
}

/** World point → screen pixels (flipY:false, so +Z/north points UP the screen). */
export function worldToScreen(worldX: number, worldZ: number, v: ViewState2D): [number, number] {
  const scale = Math.pow(2, v.zoom);
  return [
    v.width / 2 + (worldX - v.target[0]) * scale,
    v.height / 2 - (worldZ - v.target[1]) * scale,
  ];
}

/** Screen pixels → world point (inverse of worldToScreen). */
export function screenToWorld(screenX: number, screenY: number, v: ViewState2D): [number, number] {
  const scale = Math.pow(2, v.zoom);
  return [
    v.target[0] + (screenX - v.width / 2) / scale,
    v.target[1] - (screenY - v.height / 2) / scale,
  ];
}

// ------------------------------------------------------------------
// view constants
// ------------------------------------------------------------------

/** OrthographicView zoom = log2(pixels per world unit). Negative: 1 unit << 1px. */
export const INITIAL_ZOOM = -6;
export const MIN_ZOOM = -12; // whole map
export const MAX_ZOOM = -3; // very close
/** Start over Velia (game X, Z). */
export const INITIAL_TARGET: [number, number] = [13800, 76996];
/** Zoom used when something outside the map (a vendor, a grind spot) sends us to a place. */
export const FOCUS_ZOOM = -4;
/** Flight time, in ms, for such a jump. */
export const FOCUS_TRANSITION_MS = 900;
