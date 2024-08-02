import { TextBoundingBox } from './text-bounding-box';
export interface CharPath {
  char: string; //length 1
  data: string; //length 0 or more
  tbbox?: TextBoundingBox;
}
