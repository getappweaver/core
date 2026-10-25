export type TargetRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type StoryCaptureBeat = {
  stepIndex: number;
  targetId: string;
  title: string;
  description: string;
  targetRect: TargetRect;
  cropPath: string;
  beforeCardPath: string;
  afterCardPath: string;
  actionType: 'click' | 'focus';
};

export type StoryCaptureManifest = {
  storyId: string;
  pluginTag: string;
  title: string;
  description: string;
  cardWidth: number;
  cardHeight: number;
  dpr: number;
  beats: StoryCaptureBeat[];
};
