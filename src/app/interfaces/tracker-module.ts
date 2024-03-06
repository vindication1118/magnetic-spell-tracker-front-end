export interface TrackerModule {
  type: number;
  data: (string | number)[];
}

export interface TextModule extends TrackerModule {
  meshJSON: object;
}
