import { For, Show } from 'solid-js';

import type { OfficialApp } from './landing-data';

const pluginRouteIconAliases: Record<string, string> = {
  'apps/bookmark-manager': 'bm',
  'apps/captains-log': 'journal',
  'apps/file-manager': 'file',
  'apps/job-scheduler': 'job',
  'apps/nostr-radar': 'nr',
  'apps/todo': 'todo',
};

const pluginRouteIcons: Record<string, string> = {
  bm: 'bm/commands__list__renderers__list.svg',
  file: 'file/commands__tree__renderers__tree.svg',
  job: 'job/commands__list__renderers__clock.svg',
  journal: 'journal/commands__today__renderers__captains-log.svg',
  nr: 'nr/commands__list__renderers__nostr-radar.svg',
  todo: 'todo/commands__list__renderers__list.svg',
};

// Note: HeaderChrome resolves plugin icons from /plugins/... paths differently.
// The icon in web/src/chrome/HeaderChrome.tsx uses the raw icon path from definition.
// For the official app grid, we use the landing public folder structure.

type OfficialAppGridProps = {
  apps: OfficialApp[];
};

export function pluginIconSrcForSlug(slug: string): string | null {
  const iconPath = pluginRouteIcons[pluginRouteIconAliases[slug] ?? slug];

  return iconPath ? `/plugin-icons/${iconPath}` : null;
}

export function OfficialAppGrid(props: OfficialAppGridProps) {
  return (
    <div class="official-app-grid">
      <For each={props.apps}>
        {(app) => (
          <article class="official-app-card">
            <a class="official-app-card-heading" href={app.href}>
              <Show when={pluginIconSrcForSlug(app.href.slice(1))}>
                {(iconSrc) => (
                  <img
                    class="official-app-icon"
                    src={iconSrc()}
                    alt=""
                    aria-hidden="true"
                  />
                )}
              </Show>
              <span class="official-app-heading-copy">
                <span class="official-app-label">{app.label}</span>
                <span class="official-app-name">{app.name}</span>
              </span>
            </a>
            <p class="official-app-description">{app.description}</p>
            <Show when={app.hasInteractiveDemo}>
              <a class="official-app-link" href={app.href}>
                Interactive Demo
              </a>
            </Show>
          </article>
        )}
      </For>
    </div>
  );
}
