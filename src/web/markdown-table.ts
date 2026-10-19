export type MarkdownTableAlignment = 'left' | 'center' | 'right';

export type MarkdownTableRow = {
  lineNumber: number;
  cells: string[];
};

export type MarkdownTableSegment = {
  type: 'table';
  startLineNumber: number;
  endLineNumber: number;
  delimiterLineNumber: number;
  alignments: MarkdownTableAlignment[];
  header: MarkdownTableRow;
  rows: MarkdownTableRow[];
};

export type MarkdownLineEntry = {
  lineNumber: number;
  text: string;
};

export type MarkdownLinesSegment = {
  type: 'lines';
  startLineNumber: number;
  lines: MarkdownLineEntry[];
};

export type MarkdownSegment = MarkdownLinesSegment | MarkdownTableSegment;

function parseFenceMarker(
  line: string,
): { char: '`' | '~'; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);

  if (!match || !match[1]) {
    return null;
  }

  const fence = match[1];
  const char = fence[0] as '`' | '~';

  if (char === '`' && line.slice(match[0].length).includes('`')) {
    return null;
  }

  return { char, length: fence.length };
}

function isClosingFence(
  line: string,
  activeFence: { char: '`' | '~'; length: number },
): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);

  if (!match || !match[1]) {
    return false;
  }

  const fence = match[1];

  return fence[0] === activeFence.char && fence.length >= activeFence.length;
}

function splitUnescapedPipes(line: string): string[] | null {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const rawParts: string[] = [];
  let current = '';
  let sawPipe = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }

    if (ch === '|') {
      sawPipe = true;
      rawParts.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (!sawPipe) {
    return null;
  }

  rawParts.push(current);

  if (trimmed.startsWith('|')) {
    rawParts.shift();
  }

  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
    rawParts.pop();
  }

  if (rawParts.length === 0) {
    return null;
  }

  return rawParts.map((cell) => cell.trim());
}

function parseDelimiterRow(line: string): MarkdownTableAlignment[] | null {
  const cells = splitUnescapedPipes(line);

  if (cells === null || cells.length === 0) {
    return null;
  }

  const alignments: MarkdownTableAlignment[] = [];

  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) {
      return null;
    }

    const startsWithColon = cell.startsWith(':');
    const endsWithColon = cell.endsWith(':');

    if (startsWithColon && endsWithColon) {
      alignments.push('center');
    } else if (endsWithColon) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }

  return alignments;
}

function normalizeRowCells(cells: string[], columnCount: number): string[] {
  if (cells.length === columnCount) {
    return cells;
  }

  if (cells.length > columnCount) {
    return cells.slice(0, columnCount);
  }

  return [
    ...cells,
    ...Array.from({ length: columnCount - cells.length }, () => ''),
  ];
}

export function parseMarkdownTableSegments(text: string): MarkdownSegment[] {
  const rawLines = text.split(/\r?\n/);
  const segments: MarkdownSegment[] = [];
  let currentLines: MarkdownLineEntry[] = [];
  let activeFence: { char: '`' | '~'; length: number } | null = null;

  const flushLines = (): void => {
    if (currentLines.length === 0) {
      return;
    }

    segments.push({
      type: 'lines',
      startLineNumber: currentLines[0]!.lineNumber,
      lines: currentLines,
    });

    currentLines = [];
  };

  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i] ?? '';
    const lineNumber = i + 1;

    if (activeFence !== null) {
      if (isClosingFence(line, activeFence)) {
        activeFence = null;
      }

      currentLines.push({ lineNumber, text: line });
      i += 1;
      continue;
    }

    const fenceOpen = parseFenceMarker(line);

    if (fenceOpen !== null) {
      activeFence = fenceOpen;
      currentLines.push({ lineNumber, text: line });
      i += 1;
      continue;
    }

    if (i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1] ?? '';

      if (parseFenceMarker(nextLine) === null) {
        const headerCells = splitUnescapedPipes(line);

        const alignments =
          headerCells !== null ? parseDelimiterRow(nextLine) : null;

        if (
          headerCells !== null &&
          alignments !== null &&
          headerCells.length === alignments.length
        ) {
          flushLines();

          const columnCount = headerCells.length;
          const rows: MarkdownTableRow[] = [];
          let j = i + 2;

          while (j < rawLines.length) {
            const bodyLine = rawLines[j] ?? '';

            if (
              bodyLine.trim().length === 0 ||
              parseFenceMarker(bodyLine) !== null
            ) {
              break;
            }

            const bodyCells = splitUnescapedPipes(bodyLine);

            if (bodyCells === null) {
              break;
            }

            rows.push({
              lineNumber: j + 1,
              cells: normalizeRowCells(bodyCells, columnCount),
            });

            j += 1;
          }

          segments.push({
            type: 'table',
            startLineNumber: lineNumber,
            endLineNumber: j,
            delimiterLineNumber: lineNumber + 1,
            alignments,
            header: {
              lineNumber,
              cells: headerCells,
            },
            rows,
          });

          i = j;
          continue;
        }
      }
    }

    currentLines.push({ lineNumber, text: line });
    i += 1;
  }

  flushLines();

  return segments;
}
