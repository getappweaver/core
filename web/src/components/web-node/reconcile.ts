import { produce } from 'solid-js/store';

import type { WebElementNode, WebNode, WebNodeRoot } from '@src/web/ui-schema';

type MutableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isElement(node: WebNode): node is WebElementNode {
  return node.type === 'element';
}

function compatibleNode(previous: WebNode, next: WebNode): boolean {
  if (previous.type !== next.type) {
    return false;
  }

  if (previous.type === 'text') {
    return true;
  }

  const nextElement = next as WebElementNode;

  return (
    previous.tag === nextElement.tag &&
    (previous.renderKey === undefined && nextElement.renderKey === undefined
      ? true
      : previous.renderKey === nextElement.renderKey)
  );
}

function warnSiblingKeys(previous: WebNode[], next: WebNode[]): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const seen = new Set<string>();

  for (const node of next) {
    if (!isElement(node) || !node.renderKey) {
      continue;
    }

    if (seen.has(node.renderKey)) {
      console.warn(`Duplicate WebNode sibling renderKey: ${node.renderKey}`);
    }

    seen.add(node.renderKey);
  }

  const previousByKey = new Map(
    previous
      .filter(
        (node): node is WebElementNode => isElement(node) && !!node.renderKey,
      )
      .map((node) => [node.renderKey as string, node]),
  );

  for (const node of next) {
    if (!isElement(node) || !node.renderKey) {
      continue;
    }

    const oldNode = previousByKey.get(node.renderKey);

    if (oldNode && oldNode.tag !== node.tag) {
      console.warn(
        `WebNode renderKey "${node.renderKey}" changed tag from ${oldNode.tag} to ${node.tag}`,
      );
    }
  }
}

function reconcileValue(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) {
    return previous;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    reconcileArray(previous, next);

    return previous;
  }

  if (isRecord(previous) && isRecord(next)) {
    reconcileRecord(previous, next);

    return previous;
  }

  return next;
}

function reconcileArray(previous: unknown[], next: unknown[]): void {
  const commonLength = Math.min(previous.length, next.length);

  for (let index = 0; index < commonLength; index += 1) {
    const reconciled = reconcileValue(previous[index], next[index]);

    if (!Object.is(previous[index], reconciled)) {
      previous[index] = reconciled;
    }
  }

  if (previous.length !== next.length) {
    previous.splice(
      commonLength,
      previous.length - commonLength,
      ...next.slice(commonLength),
    );
  }
}

function reconcileRecord(previous: MutableRecord, next: MutableRecord): void {
  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      delete previous[key];
    }
  }

  for (const [key, nextValue] of Object.entries(next)) {
    previous[key] = reconcileValue(previous[key], nextValue);
  }
}

function reconcileNode(previous: WebNode, next: WebNode): void {
  if (previous.type === 'text' && next.type === 'text') {
    previous.value = next.value;

    return;
  }

  if (previous.type !== 'element' || next.type !== 'element') {
    return;
  }

  previous.renderKey = next.renderKey;

  if (next.props === undefined) {
    delete previous.props;
  } else if (previous.props === undefined) {
    (previous as unknown as MutableRecord).props = next.props;
  } else {
    reconcileRecord(
      previous.props as unknown as MutableRecord,
      next.props as unknown as MutableRecord,
    );
  }

  if (next.summary === undefined) {
    delete previous.summary;
  } else if (
    previous.summary !== undefined &&
    compatibleNode(previous.summary, next.summary)
  ) {
    reconcileNode(previous.summary, next.summary);
  } else {
    previous.summary = next.summary;
  }

  if (next.children === undefined) {
    delete previous.children;
  } else if (previous.children === undefined) {
    previous.children = next.children;
  } else {
    reconcileWebNodeArray(previous.children, next.children);
  }
}

function reconcileWebNodeArray(previous: WebNode[], next: WebNode[]): void {
  warnSiblingKeys(previous, next);

  const keyedPrevious = new Map<string, WebElementNode>();

  for (const node of previous) {
    if (
      isElement(node) &&
      node.renderKey &&
      !keyedPrevious.has(node.renderKey)
    ) {
      keyedPrevious.set(node.renderKey, node);
    }
  }

  const retained = new Set<WebNode>();

  const selected = next.map((nextNode, index) => {
    const keyedMatch =
      isElement(nextNode) && nextNode.renderKey
        ? keyedPrevious.get(nextNode.renderKey)
        : undefined;

    const positionalMatch = previous[index];

    const match = keyedMatch
      ? compatibleNode(keyedMatch, nextNode)
        ? keyedMatch
        : undefined
      : positionalMatch &&
          !(isElement(positionalMatch) && positionalMatch.renderKey) &&
          compatibleNode(positionalMatch, nextNode)
        ? positionalMatch
        : undefined;

    if (!match || retained.has(match)) {
      return nextNode;
    }

    retained.add(match);
    reconcileNode(match, nextNode);

    return match;
  });

  if (
    previous.length !== selected.length ||
    selected.some((node, index) => !Object.is(node, previous[index]))
  ) {
    previous.splice(0, previous.length, ...selected);
  }
}

export function reconcileWebNodeRoot(next: WebNodeRoot) {
  return produce<WebNodeRoot>((previous) => {
    const mutablePrevious = previous as unknown as MutableRecord;

    for (const key of Object.keys(previous) as Array<keyof WebNodeRoot>) {
      if (!(key in next)) {
        delete mutablePrevious[key];
      }
    }

    for (const key of Object.keys(next) as Array<keyof WebNodeRoot>) {
      if (key === 'tree') {
        if (compatibleNode(previous.tree, next.tree)) {
          reconcileNode(previous.tree, next.tree);
        } else {
          previous.tree = next.tree;
        }

        continue;
      }

      mutablePrevious[key] = reconcileValue(previous[key], next[key]);
    }
  });
}
