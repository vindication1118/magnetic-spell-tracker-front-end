export type Vec2 = [number, number];

export interface Path2 {
  points: Vec2[]; // open polyline (first !== last)
  closed: boolean;
}

export interface Polygon2 {
  outer: Vec2[];
  holes?: Vec2[][];
}

export interface MeshData {
  positions: Float32Array; // xyzxyz…
  indices: Uint32Array; // triangle indices
  normals?: Float32Array; // optional
}
