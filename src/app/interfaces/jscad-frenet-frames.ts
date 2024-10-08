import { Vec3 } from '@jscad/modeling/src/maths/vec3';

export interface IJscadFrenetFrames {
  points: Vec3[];
  tangents: Vec3[];
  normals: Vec3[];
  binormals: Vec3[];
}
