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

export const CAPABILITY_LABEL_NAMESPACE = 'com.getappweaver.capability';

const CAPABILITY_RELATIONS = ['provides', 'uses', 'requires'] as const;

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

export function capabilityRelationsEqual(
  left: PluginCapabilityRelations,
  right: PluginCapabilityRelations,
): boolean {
  return CAPABILITY_RELATIONS.every((relation) => {
    const leftRefs = new Set(
      left[relation].map((ref) => `${ref.name}:v${ref.version}`),
    );

    const rightRefs = new Set(
      right[relation].map((ref) => `${ref.name}:v${ref.version}`),
    );

    return (
      leftRefs.size === rightRefs.size &&
      [...leftRefs].every((ref) => rightRefs.has(ref))
    );
  });
}

export function capabilityRelationTags(
  relations: PluginCapabilityRelations,
): string[][] {
  const labels = CAPABILITY_RELATIONS.flatMap((relation) =>
    relations[relation].map((capability) => [
      'l',
      capabilityCatalogLabel({ relation, capability }),
      CAPABILITY_LABEL_NAMESPACE,
    ]),
  );

  return labels.length > 0
    ? [['L', CAPABILITY_LABEL_NAMESPACE], ...labels]
    : [];
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

  const declaresNamespace = tags.some(
    (tag) => tag[0] === 'L' && tag[1] === CAPABILITY_LABEL_NAMESPACE,
  );

  if (!declaresNamespace) {
    return result;
  }

  for (const tag of tags) {
    if (tag[0] !== 'l' || tag[2] !== CAPABILITY_LABEL_NAMESPACE) {
      continue;
    }

    const parsedLabel = parseCapabilityLabel(tag[1] ?? '');

    if (parsedLabel) {
      result[parsedLabel.relation].push(parsedLabel.capability);
    }
  }

  return normalizeCapabilityRelations(result);
}

export function capabilityCatalogLabel({
  relation,
  capability,
}: CapabilityCatalogFilter): string {
  return `${CAPABILITY_LABEL_NAMESPACE}:${relation}:${capability.name}:v${capability.version}`;
}

function parseCapabilityLabel(value: string): CapabilityCatalogFilter | null {
  const match = new RegExp(
    `^${CAPABILITY_LABEL_NAMESPACE.replaceAll('.', '\\.')}` +
      ':(provides|uses|requires):([a-z][a-z0-9.-]*):v([1-9]\\d*)$',
  ).exec(value.trim().toLowerCase());

  if (!match) {
    return null;
  }

  const capability = CapabilityRefSchema.safeParse({
    name: match[2],
    version: Number(match[3]),
  });

  return capability.success
    ? {
        relation: match[1] as CapabilityRelationName,
        capability: capability.data,
      }
    : null;
}

export function parseCapabilityCatalogFilter(
  value: string,
): CapabilityCatalogFilter | null {
  const match =
    /^(capability|provides|uses|requires):([a-z][a-z0-9.-]*):v([1-9]\d*)$/.exec(
      value.trim().toLowerCase(),
    );

  if (!match) {
    return null;
  }

  return {
    relation:
      match[1] === 'capability'
        ? 'provides'
        : (match[1] as CapabilityRelationName),
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
