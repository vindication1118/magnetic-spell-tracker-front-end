import { Vec3 } from '@jscad/modeling/src/maths/vec3';

export interface CharShapeGeometry {
  shapeAndHoles: Vec3[][][];
  character: string;
  index: number;
}
