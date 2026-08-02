import type { WebElementNode, WebNode } from '@src/web/ui-schema';

import type { TreeTimeRange } from './contexts';

// ---------------------------------------------------------------------------
// Tree item utilities
// ---------------------------------------------------------------------------

export function childTreeItems(node: WebNode): WebElementNode[] {
  if (node.type !== 'element') {
    return [];
  }

  return (node.children ?? []).flatMap((child) => {
    if (child.type !== 'element') {
      return [];
    }

    if (child.tag === 'treeItem') {
      return [child];
    }

    return childTreeItems(child);
  });
}

export function isTreeBodyNodeExpandable(node: WebNode): boolean {
  if (node.type !== 'element') {
    return true;
  }

  return node.props?.hiddenUntilRevealed !== true;
}

// ---------------------------------------------------------------------------
// Filter query normalisation
// ---------------------------------------------------------------------------

export function normalizedFilterQuery(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Glob pattern support
// ---------------------------------------------------------------------------

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegex(pattern: string): RegExp {
  let source = '';

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    const next = pattern[i + 1];

    if (ch === '*' && next === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(ch);
    }
  }

  return new RegExp(`^${source}$`);
}

export function isGlobQuery(query: string): boolean {
  return /[*?]/.test(query);
}

// ---------------------------------------------------------------------------
// Filter index
// ---------------------------------------------------------------------------

type TreeFilterIndexEntry = {
  id: string;
  text: string;
  name: string;
  path: string;
  ancestorIds: string[];
  descendantIds: string[];
  timestamps: number[];
};

export type TreeFilterIndex = {
  entries: TreeFilterIndexEntry[];
  search: (query: string) => Set<string>;
  searchTimeRanges: (ranges: TreeTimeRange[]) => Set<string>;
};

const treeFilterIndexCache = new Map<string, TreeFilterIndex>();
const MAX_TREE_FILTER_INDEX_CACHE_SIZE = 20;

export const EMPTY_TREE_FILTER_INDEX: TreeFilterIndex = {
  entries: [],
  search: () => new Set(),
  searchTimeRanges: () => new Set(),
};

export function buildTreeFilterIndex(tree: WebElementNode): TreeFilterIndex {
  const entries: TreeFilterIndexEntry[] = [];

  function visit(item: WebElementNode, ancestorIds: string[]): string[] {
    const id = item.props?.id;

    if (typeof id !== 'string' || id.length === 0) {
      return [];
    }

    const text = item.props?.filterText ?? '';
    const name = item.props?.filterName ?? '';
    const path = item.props?.filterPath ?? '';
    const descendantIds: string[] = [];

    for (const child of childTreeItems(item)) {
      descendantIds.push(...visit(child, [...ancestorIds, id]));
    }

    entries.push({
      id,
      text: text.toLowerCase(),
      name: name.toLowerCase(),
      path: path.toLowerCase(),
      ancestorIds,
      descendantIds,
      timestamps: item.props?.filterTimestamps ?? [],
    });

    return [id, ...descendantIds];
  }

  for (const item of childTreeItems(tree)) {
    visit(item, []);
  }

  return {
    entries,
    search(query: string): Set<string> {
      const normalized = normalizedFilterQuery(query);
      const visibleIds = new Set<string>();

      if (normalized.length === 0) {
        return visibleIds;
      }

      const globRegex = isGlobQuery(normalized)
        ? globToRegex(normalized)
        : null;

      const queryHasSlash = normalized.includes('/');

      for (const entry of entries) {
        const matched =
          globRegex !== null
            ? queryHasSlash
              ? globRegex.test(entry.path)
              : globRegex.test(entry.name)
            : entry.text.includes(normalized);

        if (!matched) {
          continue;
        }

        visibleIds.add(entry.id);

        for (const ancestorId of entry.ancestorIds) {
          visibleIds.add(ancestorId);
        }

        for (const descendantId of entry.descendantIds) {
          visibleIds.add(descendantId);
        }
      }

      return visibleIds;
    },
    searchTimeRanges(ranges: TreeTimeRange[]): Set<string> {
      const visibleIds = new Set<string>();

      for (const entry of entries) {
        const matched = entry.timestamps.some((timestamp) =>
          ranges.some(
            (range) => timestamp >= range.since && timestamp < range.until,
          ),
        );

        if (!matched) {
          continue;
        }

        visibleIds.add(entry.id);

        for (const ancestorId of entry.ancestorIds) {
          visibleIds.add(ancestorId);
        }

        for (const descendantId of entry.descendantIds) {
          visibleIds.add(descendantId);
        }
      }

      return visibleIds;
    },
  };
}

export function cachedTreeFilterIndex(tree: WebElementNode): TreeFilterIndex {
  const key = tree.props?.filterIndexKey;

  if (typeof key === 'string' && key.length > 0) {
    const cached = treeFilterIndexCache.get(key);

    if (cached !== undefined) {
      treeFilterIndexCache.delete(key);
      treeFilterIndexCache.set(key, cached);

      return cached;
    }

    const built = buildTreeFilterIndex(tree);
    treeFilterIndexCache.set(key, built);

    if (treeFilterIndexCache.size > MAX_TREE_FILTER_INDEX_CACHE_SIZE) {
      const oldestKey = treeFilterIndexCache.keys().next().value;

      if (typeof oldestKey === 'string') {
        treeFilterIndexCache.delete(oldestKey);
      }
    }

    return built;
  }

  return buildTreeFilterIndex(tree);
}
