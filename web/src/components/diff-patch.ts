export type RenderedDiffLine = {
  text: string;
  className: string;
  oldLine: number | null;
  newLine: number | null;
  file: string | null;
};

function diffLineClass(line: string): string {
  if (
    line.startsWith('+++') ||
    line.startsWith('---') ||
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('⋮')
  ) {
    return 'diff-line diff-line--meta';
  }

  if (line.startsWith('+')) {
    return 'diff-line diff-line--add';
  }

  if (line.startsWith('-')) {
    return 'diff-line diff-line--del';
  }

  if (line.startsWith('@@')) {
    return 'diff-line diff-line--hunk';
  }

  return 'diff-line';
}

function parseDiffHunkStart(
  line: string,
): { oldLine: number; newLine: number } | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

  if (!match) {
    return null;
  }

  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function parseDiffElision(
  line: string,
): { oldLine: number; newLine: number } | null {
  const match = /^⋮ @@ -(\d+) \+(\d+) @@$/.exec(line);

  if (!match) {
    return null;
  }

  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function diffFile(line: string): string | null {
  const match =
    /^\+\+\+ b\/(.+)$/.exec(line) ?? /^diff --git a\/.+ b\/(.+)$/.exec(line);

  return match?.[1] ?? null;
}

export function renderDiffPatchLines(patch: string): RenderedDiffLine[] {
  const rendered: RenderedDiffLine[] = [];
  let oldLine: number | null = null;
  let newLine: number | null = null;
  let file: string | null = null;

  for (const line of patch.split('\n')) {
    file = diffFile(line) ?? file;
    const hunkStart = parseDiffHunkStart(line);

    if (hunkStart) {
      oldLine = hunkStart.oldLine;
      newLine = hunkStart.newLine;

      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
        file,
      });

      continue;
    }

    const elision = parseDiffElision(line);

    if (elision) {
      oldLine = elision.oldLine;
      newLine = elision.newLine;

      rendered.push({
        text: '⋮',
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
        file,
      });

      continue;
    }

    if (
      oldLine === null ||
      newLine === null ||
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine: null,
        file,
      });

      continue;
    }

    if (line.startsWith('+')) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine: null,
        newLine,
        file,
      });

      newLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      rendered.push({
        text: line,
        className: diffLineClass(line),
        oldLine,
        newLine: null,
        file,
      });

      oldLine += 1;
      continue;
    }

    rendered.push({
      text: line,
      className: diffLineClass(line),
      oldLine,
      newLine,
      file,
    });

    oldLine += 1;
    newLine += 1;
  }

  return rendered;
}
