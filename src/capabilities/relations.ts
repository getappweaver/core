import { z } from 'zod';

import { CapabilityRefSchema, type CapabilityRef } from './types';

export const PluginCapabilityRelationsSchema = z
  .object({
    provides: z.array(CapabilityRefSchema).optional().default([]),
    uses: z.array(CapabilityRefSchema).optional().default([]),
    requires: z.array(CapabilityRefSchema).optional().default([]),
  })
  .optional()
  .default({ provides: [], uses: [], requires: [] });

export type PluginCapabilityRelations = z.infer<
  typeof PluginCapabilityRelationsSchema
>;

export type CapabilityRelationName = keyof PluginCapabilityRelations;

export type CapabilityCatalogFilter = {
  relation: CapabilityRelationName;
  capability: CapabilityRef;
};

const RELATION_TAGS: Record<CapabilityRelationName, 'p' | 'u' | 'r'> = {
  provides: 'p',
  uses: 'u',
  requires: 'r',
};

function dedupeCapabilityRefs(refs: CapabilityRef[]): CapabilityRef[] {
  return [
    ...new Map(
      refs.map((ref) => [`${ref.name}:v${ref.version}`, ref] as const),
    ).values(),
  ];
}

export function normalizeCapabilityRelations(
  value: unknown,
): PluginCapabilityRelations {
  const parsed = PluginCapabilityRelationsSchema.parse(value);

  return {
    provides: dedupeCapabilityRefs(parsed.provides),
    uses: dedupeCapabilityRefs(parsed.uses),
    requires: dedupeCapabilityRefs(parsed.requires),
  };
}

export function capabilityRelationTags(
  relations: PluginCapabilityRelations,
): string[][] {
  return (Object.keys(RELATION_TAGS) as CapabilityRelationName[]).flatMap(
    (relation) =>
      relations[relation].map((capability) => [
        RELATION_TAGS[relation],
        capability.name,
        String(capability.version),
      ]),
  );
}

export function parseCapabilityRelationTags(
  kind: number,
  tags: string[][],
): PluginCapabilityRelations {
  if (kind !== 32107) {
    return { provides: [], uses: [], requires: [] };
  }

  const result: PluginCapabilityRelations = {
    provides: [],
    uses: [],
    requires: [],
  };

  for (const tag of tags) {
    const relation =
      tag[0] === 'p'
        ? 'provides'
        : tag[0] === 'u'
          ? 'uses'
          : tag[0] === 'r'
            ? 'requires'
            : null;

    if (!relation) {
      continue;
    }

    const parsed = CapabilityRefSchema.safeParse({
      name: tag[1],
      version: Number(tag[2]),
    });

    if (parsed.success) {
      result[relation].push(parsed.data);
    }
  }

  return normalizeCapabilityRelations(result);
}

export function parseCapabilityCatalogFilter(
  value: string,
): CapabilityCatalogFilter | null {
  const match = /^(capability|provides|uses|requires):([a-z][a-z0-9.-]*):v([1-9]\d*)$/.exec(
    value.trim().toLowerCase(),
  );

  if (!match) {
    return null;
  }

  return {
    relation: match[1] === 'capability' ? 'provides' : (match[1] as CapabilityRelationName),
    capability: { name: match[2]!, version: Number(match[3]) },
  };
}

export function matchesCapabilityCatalogFilter(
  relations: PluginCapabilityRelations,
  filter: CapabilityCatalogFilter,
): boolean {
  return relations[filter.relation].some(
    (candidate) =>
      candidate.name === filter.capability.name &&
      candidate.version === filter.capability.version,
  );
}
