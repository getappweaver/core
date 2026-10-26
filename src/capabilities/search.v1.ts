/** Capability: search:v1. Added in AppWeaver core: 14.11.1.
 * Interactive, read-only search. Text/context are plain text; cursors are opaque
 * and query-scoped. Source identity is supplied by the registry, not the results.
 */
import { z } from 'zod';

import { ResourceAddressSchema } from './resource-view.v1';
import { defineCapability } from './types';

export const SearchInputV1Schema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50),
  cursor: z.string().min(1).max(16000).nullable(),
});
export const SearchResultV1Schema = z.object({
  id: z.string().min(1).max(8000),
  text: z.string().min(1).max(1000),
  context: z.string().max(2000).nullable(),
  address: ResourceAddressSchema,
});
export const SearchOutputV1Schema = z.object({
  results: z.array(SearchResultV1Schema).max(50),
  nextCursor: z.string().min(1).max(16000).nullable(),
  notices: z.array(z.string().max(500)).max(50),
});
export type SearchInputV1 = z.infer<typeof SearchInputV1Schema>;
export type SearchOutputV1 = z.infer<typeof SearchOutputV1Schema>;
export type SearchResultV1 = z.infer<typeof SearchResultV1Schema>;

export const SearchV1 = defineCapability({
  capability: { name: 'search', version: 1 },
  addedInCoreVersion: '14.11.1',
  operations: {
    search: {
      id: 'capability:v1:search.search',
      required: true,
      inputSchema: SearchInputV1Schema,
      outputSchema: SearchOutputV1Schema,
    },
  },
});
