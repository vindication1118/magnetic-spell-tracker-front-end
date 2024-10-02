import { Vec3 } from '@jscad/modeling/src/maths/vec3';

export interface SplitCorners {
  endCaps: Vec3[];
  nonLinear: Vec3[][];
  linear: Vec3[][];
}
