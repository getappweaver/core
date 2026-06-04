export type EditableTextSnapshot = {
  text: string;
  activeLine: number;
  changedLine: number | null;
};

type EditableTextEntry = {
  getSnapshot: () => EditableTextSnapshot;
};

const editableTextEntries = new Map<string, EditableTextEntry>();

function fallbackActiveLine(root: HTMLElement): number {
  const activeLine = Number.parseInt(root.dataset.activeLine ?? '', 10);

  return Number.isFinite(activeLine) && activeLine > 0 ? activeLine : 1;
}

function lineForSelection(root: HTMLElement): number {
  const selection = window.getSelection();

  if (selection == null || selection.rangeCount === 0) {
    return fallbackActiveLine(root);
  }

  const range = selection.getRangeAt(0);

  if (!root.contains(range.startContainer)) {
    return fallbackActiveLine(root);
  }

  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);

  return before.toString().split('\n').length;
}

function findEditableTextElementInRoot(
  root: Document | ShadowRoot,
  id: string,
): HTMLElement | null {
  for (const candidate of root.querySelectorAll<HTMLElement>(
    '[data-editable-id]',
  )) {
    if (candidate.dataset.editableId === id) {
      return candidate;
    }

    const nested = candidate.shadowRoot
      ? findEditableTextElementInRoot(candidate.shadowRoot, id)
      : null;

    if (nested !== null) {
      return nested;
    }
  }

  for (const host of root.querySelectorAll<HTMLElement>('*')) {
    if (host.shadowRoot == null) {
      continue;
    }

    const nested = findEditableTextElementInRoot(host.shadowRoot, id);

    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function getEditableTextDomSnapshot(id: string): EditableTextSnapshot | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const element = findEditableTextElementInRoot(document, id);

  if (element === null) {
    return null;
  }

  return {
    text: element.innerText,
    activeLine: lineForSelection(element),
    changedLine: null,
  };
}

export function registerEditableTextEntry(props: {
  id: string;
  getSnapshot: () => EditableTextSnapshot;
}): () => void {
  editableTextEntries.set(props.id, { getSnapshot: props.getSnapshot });

  return () => {
    const current = editableTextEntries.get(props.id);

    if (current?.getSnapshot === props.getSnapshot) {
      editableTextEntries.delete(props.id);
    }
  };
}

export function getEditableTextSnapshot(
  id: string,
): EditableTextSnapshot | null {
  return (
    editableTextEntries.get(id)?.getSnapshot() ?? getEditableTextDomSnapshot(id)
  );
}
