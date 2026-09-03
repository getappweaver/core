import { expect, test } from 'bun:test';

import { serializeCommandFieldForWeb } from './command-catalog';

test('web command fields omit nullable choices', () => {
  expect(
    serializeCommandFieldForWeb({
      name: 'path',
      summary: 'Path',
      flag: '--path',
      shortFlag: null,
      kind: 'string',
      required: true,
      choices: null,
    }),
  ).toEqual({
    name: 'path',
    summary: 'Path',
    flag: '--path',
    shortFlag: null,
    kind: 'string',
    required: true,
  });
});

test('web command fields preserve concrete choices', () => {
  expect(
    serializeCommandFieldForWeb({
      name: 'format',
      summary: 'Format',
      flag: '--format',
      shortFlag: null,
      kind: 'string',
      required: false,
      choices: ['json', 'markdown'],
    }),
  ).toMatchObject({ choices: ['json', 'markdown'] });
});
