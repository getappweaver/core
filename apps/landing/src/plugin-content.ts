import type { LandingApp, PluginCatalogFeature, PluginLandingDefinition } from '../content-types';

export type PluginIdentity = {
  alias: string;
  packageName: string;
  repo: string;
  icon: string | null;
};

/** Matches the generator's namespaced copy destination without filesystem imports. */
export function pluginAssetUrl(alias: string, path: string): string {
  const clean = path.replace(/^\.\//, '');

  return `/plugin-assets/${alias}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

export type CreateLandingAppProps = {
  definition: PluginLandingDefinition;
  identity: PluginIdentity;
  catalogFeatures: PluginCatalogFeature[];
};

export function createLandingApp({
  definition,
  identity,
  catalogFeatures,
}: CreateLandingAppProps): LandingApp {
  const asset = (path: string) => pluginAssetUrl(identity.alias, path);
  const presentation = definition.presentation;

  return {
    ...definition,
    ...identity,
    href: definition.route,
    label: `/${identity.alias}`,
    displayName: definition.name,
    iconSrc: identity.icon ? asset(identity.icon) : null,
    installScreenshot: definition.installScreenshot ? asset(definition.installScreenshot) : null,
    catalogFeatures: catalogFeatures.map((f) => ({
      ...f,
      media: {
        poster: f.media.poster ? asset(f.media.poster) : null,
        video: f.media.video ? asset(f.media.video) : null,
      },
    })),
    demoStories: definition.demoStories.map((story) => ({
      ...story,
      variants: story.variants.map((variant) => ({
        ...variant,
        src: asset(variant.src),
        poster: variant.poster ? asset(variant.poster) : null,
      })),
    })),
    presentation: presentation ? {
      ...presentation,
      featureGallery: presentation.featureGallery ? {
        ...presentation.featureGallery,
        items: presentation.featureGallery.items.map((item) => ({ ...item, mediaSrc: asset(item.mediaSrc) })),
      } : null,
    } : null,
  };
}
