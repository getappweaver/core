type WidgetIconPathProps = {
  icon: string | undefined;
  pluginAlias: string | null;
};

export function isRemoteWidgetIcon(icon: string): boolean {
  const lower = icon.toLowerCase();

  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:')
  );
}

export function normalizeRelativeIconPath(value: string): string {
  return value.replace(/^(?:\.[\\/])+/, '');
}

export function flattenIconPath(value: string): string {
  return normalizeRelativeIconPath(value).replace(/[\\/]/g, '__');
}

export function localWidgetIconSourceReference({
  icon,
  pluginAlias,
}: WidgetIconPathProps): string | null {
  const raw = icon?.trim();

  if (!raw || isRemoteWidgetIcon(raw)) {
    return null;
  }

  if (raw.startsWith('/')) {
    return raw;
  }

  return pluginAlias
    ? `/plugins/${pluginAlias}/${normalizeRelativeIconPath(raw)}`
    : null;
}

export function publishedWidgetIconPath({
  icon,
  pluginAlias,
}: WidgetIconPathProps): string | null {
  const raw = icon?.trim();

  if (!raw || isRemoteWidgetIcon(raw)) {
    return null;
  }

  if (raw.startsWith('/plugins/')) {
    const rel = raw.slice('/plugins/'.length);
    const slashIdx = rel.indexOf('/');

    if (slashIdx <= 0) {
      return pluginAlias
        ? `plugin-icons/${pluginAlias}/${flattenIconPath(rel)}`
        : null;
    }

    const alias = rel.slice(0, slashIdx);
    const iconRel = rel.slice(slashIdx + 1);

    return `plugin-icons/${alias}/${flattenIconPath(iconRel)}`;
  }

  if (pluginAlias) {
    const rel = raw.startsWith('/') ? raw.slice(1) : raw;

    return `plugin-icons/${pluginAlias}/${flattenIconPath(rel)}`;
  }

  return raw.startsWith('/')
    ? `builtin-icons/${flattenIconPath(raw.slice(1))}`
    : null;
}
