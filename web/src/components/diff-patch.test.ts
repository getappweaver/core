import { describe, expect, test } from 'bun:test';

import { renderDiffPatchLines } from './diff-patch';

describe('renderDiffPatchLines', () => {
  test('colors changes and tracks old and new line numbers', () => {
    const lines = renderDiffPatchLines(
      [
        'diff --git a/src/file.ts b/src/file.ts',
        '--- a/src/file.ts',
        '+++ b/src/file.ts',
        '@@ -10,2 +10,2 @@',
        '-old value',
        '+new value',
        ' unchanged',
      ].join('\n'),
    );

    expect(lines[4]).toMatchObject({
      className: 'diff-line diff-line--del',
      oldLine: 10,
      newLine: null,
      file: 'src/file.ts',
    });

    expect(lines[5]).toMatchObject({
      className: 'diff-line diff-line--add',
      oldLine: null,
      newLine: 10,
      file: 'src/file.ts',
    });

    expect(lines[6]).toMatchObject({ oldLine: 11, newLine: 11 });
  });

  test('updates copied line paths across a multi-file patch', () => {
    const lines = renderDiffPatchLines(
      [
        'diff --git a/one.ts b/one.ts',
        '@@ -1 +1 @@',
        '+one',
        'diff --git a/two.ts b/two.ts',
        '@@ -4 +4 @@',
        '+two',
      ].join('\n'),
    );

    expect(lines[2]?.file).toBe('one.ts');
    expect(lines[5]).toMatchObject({ file: 'two.ts', newLine: 4 });
  });
});
