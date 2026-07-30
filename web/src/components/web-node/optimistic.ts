import type {
  WebElementNode,
  WebNode,
  WebNodeRoot,
  WebOptimisticMutation,
} from '@src/web/ui-schema';

function isElement(node: WebNode): node is WebElementNode {
  return node.type === 'element';
}

function countLabel(label: string, count: number): string {
  return `${label} (${count})`;
}

function patchCountText(node: WebNode, label: string, count: number): void {
  if (!isElement(node)) {
    return;
  }

  if (node.props?.optimisticCountText === true) {
    node.children = [{ type: 'text', value: countLabel(label, count) }];

    return;
  }

  if (node.summary) {
    patchCountText(node.summary, label, count);
  }

  for (const child of node.children ?? []) {
    patchCountText(child, label, count);
  }
}

function recomputeOptimisticCount(node: WebElementNode): number | null {
  const label = node.props?.optimisticCountLabel;

  if (typeof label !== 'string') {
    return null;
  }

  const children = node.children ?? [];

  const count = children.reduce((sum, child) => {
    if (!isElement(child)) {
      return sum;
    }

    const childCount = child.props?.optimisticCountValue;

    return sum + (typeof childCount === 'number' ? childCount : 1);
  }, 0);

  node.props = { ...node.props, optimisticCountValue: count };

  if (node.summary) {
    patchCountText(node.summary, label, count);
  }

  return count;
}

function patchOptimisticActions(
  value: unknown,
  patches: Extract<
    WebOptimisticMutation,
    { type: 'patchEntityActions' }
  >['actions'],
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => patchOptimisticActions(entry, patches));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const optimisticKey = record.optimisticKey;

  const patch =
    typeof optimisticKey === 'string'
      ? patches.find((entry) => entry.key === optimisticKey)
      : undefined;

  const next: Record<string, unknown> = { ...record };

  if (patch) {
    const { key: _key, ...displayPatch } = patch;
    Object.assign(next, displayPatch);
  }

  for (const [key, nestedValue] of Object.entries(next)) {
    next[key] = patchOptimisticActions(nestedValue, patches);
  }

  return next;
}

function applyToNode(
  node: WebNode,
  mutations: WebOptimisticMutation[],
): WebNode | null {
  if (!isElement(node)) {
    return node;
  }

  for (const mutation of mutations) {
    if (
      mutation.type === 'removeEntity' &&
      node.props?.entityKey === mutation.entityKey
    ) {
      return null;
    }

    if (
      mutation.type === 'patchEntityProps' &&
      node.props?.entityKey === mutation.entityKey
    ) {
      node.props = { ...node.props, ...mutation.props };
    }

    if (
      mutation.type === 'patchEntityActions' &&
      node.props?.entityKey === mutation.entityKey
    ) {
      node.props = patchOptimisticActions(
        node.props,
        mutation.actions,
      ) as WebElementNode['props'];
    }
  }

  if (node.summary) {
    const previousSummary = node.summary;
    const nextSummary = applyToNode(previousSummary, mutations);

    if (nextSummary && nextSummary !== previousSummary) {
      node.summary = nextSummary;
    } else if (!nextSummary) {
      delete node.summary;
    }
  }

  if (node.children) {
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const previousChild = node.children[index];
      const nextChild = applyToNode(previousChild, mutations);

      if (!nextChild) {
        node.children.splice(index, 1);
      } else if (nextChild !== previousChild) {
        node.children[index] = nextChild;
      }
    }
  }

  const count = recomputeOptimisticCount(node);

  const shouldPrune = mutations.some(
    (mutation) =>
      mutation.type === 'removeEntity' && mutation.pruneEmptyParents,
  );

  if (
    shouldPrune &&
    count === 0 &&
    node.props?.optimisticPruneWhenEmpty === true
  ) {
    return null;
  }

  return node;
}

export function applyOptimisticMutationsToRoot({
  root,
  mutations,
}: {
  root: WebNodeRoot;
  mutations: WebOptimisticMutation[];
}): void {
  const nextTree = applyToNode(root.tree, mutations);

  if (nextTree) {
    root.tree = nextTree;
  }
}
