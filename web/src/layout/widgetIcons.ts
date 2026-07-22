import {
  isRemoteWidgetIcon,
  publishedWidgetIconPath,
} from '@src/web/widget-icon-path';

export type WidgetIconSource = {
  source: 'builtin' | 'plugin';
  pluginAlias?: string;
  icon?: string;
};

export function resolveWidgetIconUrl(widget: WidgetIconSource): string | null {
  const raw = widget.icon?.trim();

  if (!raw) {
    return null;
  }

  if (isRemoteWidgetIcon(raw)) {
    return raw;
  }

  const asset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

  const path = publishedWidgetIconPath({
    icon: raw,
    pluginAlias:
      widget.source === 'plugin' ? (widget.pluginAlias?.trim() ?? null) : null,
  });

  return path ? asset(path) : null;
}
