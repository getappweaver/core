/** Data-only contract for plugin-owned website content. Import with `import type`. */
export type PluginDemoGifVariant = {
  view: 'desktop' | 'mobile';
  src: string;
  alt: string;
  durationMs: number;
};

export type PluginDemoStory = {
  id: string;
  label: string;
  variants: PluginDemoGifVariant[];
};

export type PluginFeatureGalleryItem = {
  id: string;
  title: string;
  description: string[];
  mediaSrc: string;
  mediaAlt: string;
  mediaLabel: string;
};

export type PluginFeatureGallery = {
  title: string;
  description: string;
  items: PluginFeatureGalleryItem[];
};

export type PluginPagePresentation = {
  title: string;
  description: string;
  featureGallery: PluginFeatureGallery | null;
};

export type PluginLandingDefinition = {
  route: string;
  name: string;
  shortName: string;
  description: string;
  features: string[];
  hasInteractiveDemo: boolean;
  /** Paths are relative to the plugin root, not the deployed website. */
  installScreenshot: string | null;
  /** Compatibility URLs for images already referenced by published articles. */
  assetAliases: { source: string; publicPath: string }[];
  demoStories: PluginDemoStory[];
  presentation: PluginPagePresentation | null;
  /** Null means this app has no public roadmap target. */
  roadmapRepoId: string | null;
};

export type LandingApp = PluginLandingDefinition & {
  alias: string;
  label: string;
  href: string;
  displayName: string;
  packageName: string;
  repo: string;
  iconSrc: string | null;
};
