import { For, Show } from 'solid-js';

import type { OfficialApp } from './landing-data';

const pluginRouteIcons: Record<string, string> = {
  'bookmark-manager': 'bm/commands__list__renderers__list.svg',
  'captains-log': 'journal/commands__today__renderers__captains-log.svg',
  'file-manager': 'file/commands__tree__renderers__tree.svg',
  'job-scheduler': 'job/commands__list__renderers__clock.svg',
  'todo-app': 'todo/commands__list__renderers__list.svg',
};

type OfficialAppGridProps = {
  apps: OfficialApp[];
};

export function pluginIconSrcForSlug(slug: string): string | null {
  const iconPath = pluginRouteIcons[slug];

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
            <a class="official-app-link" href={app.href}>
              Interactive Demo
            </a>
          </article>
        )}
      </For>
    </div>
  );
}
