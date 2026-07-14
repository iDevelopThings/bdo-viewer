import type {NPCSpawnType} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";

/** A connection between two nodes, referenced by node urn. */
export interface MapLink {
  source: string ;
  target: string ;
  color?: [number, number, number] | [number, number, number, number];
  /** Line width in screen pixels. */
  width?: number;
}

export interface MapLinkSegment {
  from: [number, number];
  to: [number, number];
  color?: [number, number, number] | [number, number, number, number];
  width?: number;
}

/** A region's world-space AABB projected to the (x,z) map plane, as a 4-corner polygon. */
export interface RegionBound {
  polygon: [number, number][];
  key: number;
  name?: string;
}

/** An NPC drawn on the map: a node's manager, a town's representative, or — for the every-NPC
 *  layer — one placement of any placed NPC. */
export interface NpcMarker {
  position: [number, number];
  name: string;
  title?: string;
  role: "Node manager" | "Representative" | "NPC";
  urn: string;
  id: number;
  /** The node they manage. Absent on the every-NPC layer, which isn't node-bound. */
  nodeURN?: string;
  nodeName?: string;
  /** Where this placement stands, and the NPC's client roles — the every-NPC layer filters on them. */
  regionName?: string;
  spawnTypes?: NPCSpawnType[];
}

/** A region point on the map: a spawn placement, the region's mark, or an extra mark. */
export interface RegionPoint {
  position: [number, number];
  kind: "spawn" | "mark" | "extra";
  name?: string;
}
