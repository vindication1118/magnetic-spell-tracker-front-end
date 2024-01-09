export interface EditorData {
  magnetDiameter: number;
  magnetHeight: number;
  partGapWidth: number;
  minWallWidth: number;
  textPrintOpt: number;
  bedDimensionX: number;
  bedDimensionY: number;
  derivedVals: {
    sliderRadius: number;
    segmentLength: number;
    knobWidth: number;
    plateWidth: number;
  };
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}
