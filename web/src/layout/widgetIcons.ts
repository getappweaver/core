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

  const lower = raw.toLowerCase();

  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:')
  ) {
    return raw;
  }

  const flatten = (value: string): string => value.replace(/[\\/]/g, '__');

  if (widget.source === 'plugin') {
    const alias = widget.pluginAlias?.trim();

    if (!alias) {
      return null;
    }

    if (raw.startsWith('/plugins/')) {
      const rel = raw.slice('/plugins/'.length);
      const slashIdx = rel.indexOf('/');

      if (slashIdx <= 0) {
        return `/plugin-icons/${alias}/${flatten(rel)}`;
      }

      const relAlias = rel.slice(0, slashIdx);
      const relIcon = rel.slice(slashIdx + 1);

      if (relAlias.length === 0) {
        return null;
      }

      return `/plugin-icons/${relAlias}/${flatten(relIcon)}`;
    }

    const rel = raw.startsWith('/') ? raw.slice(1) : raw;

    return `/plugin-icons/${alias}/${flatten(rel)}`;
  }

  if (!raw.startsWith('/')) {
    return null;
  }

  return `/builtin-icons/${flatten(raw.slice(1))}`;
}
