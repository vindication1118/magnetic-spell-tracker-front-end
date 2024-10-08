import { EditorData } from './editor-data';
export interface TrackerModule {
  type: number;
  data: (string | number)[];
  editorData: EditorData;
}

/*
Data array layout for Text Module from SVG Path:
  [
    rotation,
    translationX,
    testHeight,
    textGroupNode!,
    charPath.char,
    newPathData,
    index,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
  ]
*/

export interface TextModule extends TrackerModule {
  meshJSON: object;
}
