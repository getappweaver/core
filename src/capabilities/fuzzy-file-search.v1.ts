/**
 * Capability: fuzzy-file-search:v1
 * Added in AppWeaver core: 12.1.4
 *
 * Plugin authors that import or declare this capability must set
 * appweaver.coreApiVersion to a range including ^12.1.4 or newer.
 *
 * Intended for composer `@`-mentions: workspace file picker with prefix/fuzzy filtering.
 */
import { z } from 'zod';

import { defineCapability } from './types';

/**
 * Input is an object (not a plain string) so future options like
 * `limit`, `includeDirectories`, or type filters can be added without a breaking change.
 * Plain string array output would also be fixed-length; an object wrapper allows
 * `truncated` metadata later.
 *
 * Better than `input: string, output: string[]` because:
 * - `limit` bounds result size for composer UI (default 20, max 50)
 * - `includeDirectories` lets picker optionally include folders for future use
 * - `output.files` can later be enriched (e.g. isDirectory, score, mtime) without v2
 */
export const FuzzyFileSearchInputV1Schema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).optional(),
  includeDirectories: z.boolean().default(false),
  includeIgnored: z.boolean().default(false),
  ignoreDotFiles: z.boolean().default(true),
  isRegex: z.boolean().default(false),
});

export const FuzzyFileSearchOutputV1Schema = z.object({
  files: z.array(z.string()),
  truncated: z.boolean(),
});

export const FuzzyFileSearchV1 = defineCapability({
  capability: { name: 'fuzzy-file-search', version: 1 },
  addedInCoreVersion: '12.1.4',
  operations: {
    search: {
      id: 'capability:v1:fuzzy-file-search.search',
      required: true,
      inputSchema: FuzzyFileSearchInputV1Schema,
      outputSchema: FuzzyFileSearchOutputV1Schema,
    },
  },
});

export type FuzzyFileSearchInputV1 = z.infer<
  typeof FuzzyFileSearchInputV1Schema
>;
export type FuzzyFileSearchOutputV1 = z.infer<
  typeof FuzzyFileSearchOutputV1Schema
>;
