import { createEffect, onCleanup } from 'solid-js';

import type {
  WebAction,
  WebElementNode,
  WebNodeRoot,
} from '@src/web/ui-schema';

type MoveKeys = { keys: string[]; from: string; to: string; after: boolean };
export function reorderKeys({
  keys,
  from,
  to,
  after,
}: MoveKeys): string[] | null {
  if (
    from === to ||
    new Set(keys).size !== keys.length ||
    !keys.includes(from) ||
    !keys.includes(to)
  ) {
    return null;
  }

  const next = keys.filter((key) => key !== from);
  next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);

  return next.some((key, index) => key !== keys[index]) ? next : null;
}

type ReorderConfig = NonNullable<WebElementNode['props']>['reorder'];
type ReorderCommand = { config: NonNullable<ReorderConfig>; keys: string[] };
export function reorderCommand({
  config,
  keys,
}: ReorderCommand): WebAction | null {
  if (config.action.type !== 'command') {
    return null;
  }

  return {
    ...config.action,
    [config.target]: { ...config.action[config.target], [config.field]: keys },
  };
}

type TreeReorderInput = {
  element: () => WebElementNode;
  busy: () => boolean;
  filtered: () => boolean;
  run:
    | ((
        action: WebAction,
        params: {
          onReplaceRoot: ((root: WebNodeRoot) => void) | undefined;
          promptRequestId: string | undefined;
        },
      ) => void)
    | undefined;
  onReplaceRoot: ((root: WebNodeRoot) => void) | undefined;
  promptRequestId: string | undefined;
};

export function createTreeReorder(input: TreeReorderInput) {
  let root: HTMLDivElement | undefined;
  let cancel = () => {};

  const keys = (): string[] =>
    (input.element().children ?? []).flatMap((node) =>
      node.type === 'element' &&
      node.tag === 'treeItem' &&
      node.props?.reorderKey
        ? [node.props.reorderKey]
        : [],
    );

  const enabled = () =>
    Boolean(input.element().props?.reorder) &&
    !input.busy() &&
    !input.filtered() &&
    keys().length > 1;

  const handle = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element
      ? target.closest<HTMLElement>('[data-web-reorder-handle]')
      : null;

  const commit = (next: string[] | null) => {
    const config = input.element().props?.reorder;

    if (!config || !next || !enabled()) {
      return;
    }

    const action = reorderCommand({ config, keys: next });

    if (action) {
      input.run?.(action, {
        onReplaceRoot: input.onReplaceRoot,
        promptRequestId: input.promptRequestId,
      });
    }
  };

  createEffect(() => {
    input.element();
    cancel();
  });

  onCleanup(() => cancel());

  return {
    ref: (element: HTMLDivElement) => {
      root = element;
    },
    pointerDown: (event: PointerEvent) => {
      const button = handle(event.target);

      if (!button || event.button !== 0 || !enabled() || !root) {
        return;
      }

      const from = button.dataset.webReorderHandle!;
      const order = keys();

      if (!order.includes(from) || button.closest('.web-tree') !== root) {
        return;
      }

      cancel();
      event.preventDefault();
      event.stopPropagation();
      button.focus({ preventScroll: true });
      const container = root;
      const source = button.closest<HTMLElement>('[data-web-reorder-key]');
      let target: HTMLElement | null = null;
      let after = false;
      let moving = false;

      const clearTarget = () => {
        target?.classList.remove('web-reorder-before', 'web-reorder-after');
        target = null;
      };

      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) {
          return;
        }

        if (
          !moving &&
          Math.hypot(
            next.clientX - event.clientX,
            next.clientY - event.clientY,
          ) < 5
        ) {
          return;
        }

        moving = true;
        next.preventDefault();
        source?.classList.add('is-reordering');
        const documentRoot = container.getRootNode() as Document | ShadowRoot;

        const hit =
          documentRoot
            .elementFromPoint(next.clientX, next.clientY)
            ?.closest<HTMLElement>('[data-web-reorder-key]') ?? null;

        clearTarget();

        if (
          !hit ||
          !container.contains(hit) ||
          hit.closest('.web-tree') !== container ||
          !order.includes(hit.dataset.webReorderKey ?? '') ||
          hit.dataset.webReorderKey === from
        ) {
          return;
        }

        target = hit;

        const rect = (
          hit.querySelector('.web-tree-item-summary') ?? hit
        ).getBoundingClientRect();

        after = next.clientY >= rect.top + rect.height / 2;
        hit.classList.add(after ? 'web-reorder-after' : 'web-reorder-before');
      };

      const escape = (key: KeyboardEvent) => {
        if (key.key === 'Escape') {
          key.preventDefault();
          cancel();
        }
      };

      const blur = () => cancel();

      const finish = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) {
          return;
        }

        const to = target?.dataset.webReorderKey;

        const result =
          next.type === 'pointerup' && moving && to
            ? reorderKeys({ keys: order, from, to, after })
            : null;

        cancel();
        commit(result);
      };

      cancel = () => {
        clearTarget();
        source?.classList.remove('is-reordering');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        window.removeEventListener('keydown', escape);
        window.removeEventListener('blur', blur);
        cancel = () => {};
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('keydown', escape);
      window.addEventListener('blur', blur);
    },
  };
}
