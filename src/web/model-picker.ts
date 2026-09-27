import type { AiModelSourceModel } from '@src/capabilities/ai-model-source.v1';
import type { ModelSourceSnapshot } from '@src/core/model-source';

import type { WebAction, WebNode } from './ui-schema';

function command(subcommand: string, modelId: string): WebAction {
  return {
    type: 'command',
    command: 'ai',
    subcommand,
    arguments: { name_or_reset: modelId, model: modelId },
    options: {},
    recordInTimeline: false,
  };
}

function modelLeaf(
  sourceId: string,
  section: string,
  model: AiModelSourceModel,
  selectedModelId: string | null,
): WebNode {
  const available = model.availability.status === 'available';

  const unavailableReason =
    model.availability.status === 'unavailable'
      ? model.availability.reason
      : null;

  const details = [
    model.privacy,
    model.price
      ? `${model.price.currency} ${model.price.inputPerMillionTokens ?? '?'} / ${model.price.outputPerMillionTokens ?? '?'} per 1M tokens`
      : null,
    unavailableReason,
  ].filter((value): value is string => value !== null);

  return {
    type: 'element',
    tag: 'treeItem',
    props: {
      id: `model-source:${sourceId}:${section}:${model.id}`,
      entityKey: `model-source:${sourceId}:model:${model.id}`,
      filterText: [
        model.id,
        model.label,
        model.description,
        model.group,
        ...details,
      ]
        .filter(Boolean)
        .join('\n'),
      filterName: model.label,
      filterPath: `${model.group}/${model.id}`,
    },
    children: [
      {
        type: 'element',
        tag: 'row',
        props: {
          className: 'model-picker__row',
          gap: 'sm',
          align: 'between',
          itemAlign: 'center',
        },
        children: [
          {
            type: 'element',
            tag: 'button',
            props: {
              className: `model-picker__select${model.id === selectedModelId ? ' is-selected' : ''}`,
              label: model.label,
              ariaLabel: `${model.id === selectedModelId ? 'Selected model: ' : 'Select model: '}${model.label}`,
              action: command('model', model.id),
              disabled: !available,
              fill: true,
              title: available
                ? 'Select model'
                : (unavailableReason ?? 'Unavailable'),
            },
          },
          {
            type: 'element',
            tag: 'button',
            props: {
              className: `model-picker__favourite${model.favorite ? ' is-favourite' : ''}`,
              ariaLabel: model.favorite
                ? `Remove ${model.label} from favourites`
                : `Add ${model.label} to favourites`,
              title: model.favorite
                ? 'Remove from favourites'
                : 'Add to favourites',
              action: command(
                model.favorite ? 'unfavorite' : 'favorite',
                model.id,
              ),
              disabled: !available,
              buttonVariant: 'icon',
            },
          },
        ],
      },
      ...(details.length
        ? [
            {
              type: 'element' as const,
              tag: 'text' as const,
              props: {
                className: 'model-picker__details',
                tone: 'muted' as const,
              },
              children: [{ type: 'text' as const, value: details.join(' · ') }],
            },
          ]
        : []),
    ],
  };
}

function branch(id: string, label: string, children: WebNode[]): WebNode {
  return {
    type: 'element',
    tag: 'treeItem',
    props: {
      id,
      defaultExpanded: false,
      filterText: label,
      filterName: label,
      filterPath: label,
    },
    children: [
      {
        type: 'element',
        tag: 'text',
        props: { weight: 'bold' },
        children: [{ type: 'text', value: label }],
      },
      ...children,
    ],
  };
}

export function buildModelPickerTree(snapshot: ModelSourceSnapshot): WebNode {
  const selected = snapshot.state.selectedModelId;

  const recent = snapshot.models
    .filter((model) => model.lastUsedAt !== null)
    .sort((left, right) => right.lastUsedAt!.localeCompare(left.lastUsedAt!));

  const favorites = snapshot.models.filter((model) => model.favorite);
  const groups = new Map<string, AiModelSourceModel[]>();

  for (const model of snapshot.models) {
    groups.set(model.group, [...(groups.get(model.group) ?? []), model]);
  }

  return {
    type: 'element',
    tag: 'tree',
    props: {
      filterable: true,
      filterIndexKey: `model-source:${snapshot.providerId}:${snapshot.state.catalogRevision}`,
      filterPlaceholder: 'Filter models',
      gap: 'xs',
    },
    children: [
      branch(
        `model-source:${snapshot.providerId}:recent`,
        'Last used',
        recent.map((model) =>
          modelLeaf(snapshot.providerId, 'recent', model, selected),
        ),
      ),
      branch(
        `model-source:${snapshot.providerId}:favorites`,
        'Favourites',
        favorites.map((model) =>
          modelLeaf(snapshot.providerId, 'favorites', model, selected),
        ),
      ),
      branch(
        `model-source:${snapshot.providerId}:all`,
        'All',
        [...groups].map(([group, models]) =>
          branch(
            `model-source:${snapshot.providerId}:all:${group}`,
            group,
            models.map((model) =>
              modelLeaf(snapshot.providerId, `all:${group}`, model, selected),
            ),
          ),
        ),
      ),
    ],
  };
}
