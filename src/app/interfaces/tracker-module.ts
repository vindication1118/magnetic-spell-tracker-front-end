import { EditorData } from './editor-data';
export interface TrackerModule {
  type: number;
  data: (string | number)[];
  editorData: EditorData;
}

export interface TextModule extends TrackerModule {
  meshJSON: object;
}
