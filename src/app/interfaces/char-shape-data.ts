import { Vec3 } from '@jscad/modeling/src/maths/vec3';

export interface CharShapeData {
  shape: Vec3[];
  holes: Vec3[][];
  character: string;
  index: number;
}
