import type { LandingApp, PluginLandingDefinition } from '../content-types';

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

export function createLandingApp(
  definition: PluginLandingDefinition,
  identity: PluginIdentity,
): LandingApp {
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
    demoStories: definition.demoStories.map((story) => ({
      ...story,
      variants: story.variants.map((variant) => ({ ...variant, src: asset(variant.src) })),
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
