import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { WebElementNode, WebNode } from '@src/web/ui-schema';

import { WebButton } from '../WebButton';

import { elementClass, elementStyle, elementUi } from './element-helpers';

type WebTagFilterElementProps = {
  element: WebElementNode;
  renderChild: (child: WebNode) => JSX.Element;
};

function collectFilterTagItems(node: WebNode, out: string[][]): void {
  if (node.type !== 'element') {
    return;
  }

  if (node.props?.filterTags !== undefined) {
    out.push(node.props.filterTags);

    return;
  }

  for (const child of node.children ?? []) {
    collectFilterTagItems(child, out);
  }
}

function hasFilterTagDescendant(node: WebNode): boolean {
  if (node.type !== 'element') {
    return false;
  }

  if (node.props?.filterTags !== undefined) {
    return true;
  }

  return (node.children ?? []).some(hasFilterTagDescendant);
}

function filterWebNodeByTags(
  node: WebNode,
  selected: Set<string>,
): WebNode | null {
  if (selected.size === 0 || node.type !== 'element') {
    return node;
  }

  if (node.props?.filterTags !== undefined) {
    const tags = node.props.filterTags;

    for (const tag of selected) {
      if (!tags.includes(tag)) {
        return null;
      }
    }

    return node;
  }

  if (!hasFilterTagDescendant(node)) {
    return node;
  }

  const nextChildren: WebNode[] = [];
  let hasMatchingTaggedDescendant = false;

  for (const child of node.children ?? []) {
    const hadTaggedDescendant = hasFilterTagDescendant(child);
    const filteredChild = filterWebNodeByTags(child, selected);

    if (filteredChild !== null) {
      nextChildren.push(filteredChild);

      if (hadTaggedDescendant) {
        hasMatchingTaggedDescendant = true;
      }
    }
  }

  if (!hasMatchingTaggedDescendant) {
    return null;
  }

  return {
    ...node,
    children: nextChildren,
  };
}

export function WebTagFilterElement(
  props: WebTagFilterElementProps,
): JSX.Element {
  const [selectedTags, setSelectedTags] = createSignal<string[]>([]);

  const tagItems = createMemo(() => {
    const items: string[][] = [];

    for (const child of props.element.children ?? []) {
      collectFilterTagItems(child, items);
    }

    return items;
  });

  const allTags = createMemo(() => {
    const set = new Set<string>();

    for (const tags of tagItems()) {
      for (const tag of tags) {
        set.add(tag);
      }
    }

    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const selectedSet = createMemo(() => new Set(selectedTags()));

  const matchingItems = createMemo(() => {
    const selected = selectedSet();

    if (selected.size === 0) {
      return tagItems();
    }

    return tagItems().filter((tags) => {
      for (const tag of selected) {
        if (!tags.includes(tag)) {
          return false;
        }
      }

      return true;
    });
  });

  const tagCounts = createMemo(() => {
    const counts = new Map<string, number>();

    for (const tags of matchingItems()) {
      for (const tag of new Set(tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return counts;
  });

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const filteredChildren = createMemo(() => {
    const selected = selectedSet();
    const children = props.element.children ?? [];

    if (selected.size === 0) {
      return children;
    }

    return children
      .map((child) => filterWebNodeByTags(child, selected))
      .filter((child): child is WebNode => child !== null);
  });

  return (
    <div
      class={`${elementClass(props.element)} web-stack web-tag-filter`}
      data-ui={elementUi(props.element)}
      style={elementStyle(props.element)}
    >
      <Show when={allTags().length > 0}>
        <div
          class="web-row web-tag-filter-bar"
          role="group"
          aria-label="Filter by tag"
        >
          <For each={allTags()}>
            {(tag) => {
              const isSelected = () => selectedSet().has(tag);
              const count = () => tagCounts().get(tag) ?? 0;
              const isDisabled = () => !isSelected() && count() === 0;

              return (
                <WebButton
                  type="button"
                  class={`web-button web-tag-filter-chip${isSelected() ? ' is-selected' : ''}`}
                  disabled={isDisabled()}
                  aria-pressed={isSelected()}
                  onClick={() => toggleTag(tag)}
                >
                  {`#${tag} (${count()})`}
                </WebButton>
              );
            }}
          </For>
        </div>
      </Show>
      <div
        class="web-stack web-tag-filter-items"
        style={elementStyle(props.element)}
      >
        <For each={filteredChildren()}>
          {(child) => props.renderChild(child)}
        </For>
      </div>
    </div>
  );
}
