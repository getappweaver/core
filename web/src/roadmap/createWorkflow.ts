import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { z } from 'zod';

import {
  renderRoadmapNewWorkflowWeb,
  type RoadmapProjectPayload,
} from '@src/commands/roadmap/renderers/web';
import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

const WORKFLOW_KIND = 39010;
const REPO_KIND = '30617';
const NIP65_KIND = 10002;

const DISCOVERY_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nos.social',
  'wss://user.kindpag.es',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
] as const;

const ProjectSchema = z.object({
  address: z.string().min(1),
  authorPubkey: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  repoRelays: z.array(z.string()),
  ownerWriteRelays: z.array(z.string()),
});

const CreateWorkflowPayloadSchema = z
  .object({
    projects: z.array(ProjectSchema).optional().default([]),
    repoAuthor: z.string().min(1),
    repoD: z.string().min(1),
    roadmapD: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    relay: z.string().optional(),
    relays: z.array(z.string()).optional(),
    columnCount: z.number().int().positive(),
  })
  .catchall(z.unknown());

type CreateWorkflowDeps = {
  action: Extract<WebAction, { type: 'clientAction' }>;
  signEvent: (
    event: EventTemplate,
    options?: { title: string | null; allowedPubkeys?: string[] | null },
  ) => Promise<NostrEvent | null>;
  setChromeWeb: (root: WebNodeRoot | null) => void;
  setChromeText: (text: string | null) => void;
  setChromeError: (text: string | null) => void;
  setChromeLoading: (loading: boolean) => void;
  appendSystemMessage: (text: string) => void;
};

function statusRoot(title: string, body: string): WebNodeRoot {
  return {
    kind: 'ui',
    version: 1,
    meta: { command: 'roadmap', subcommand: 'new-board' },
    tree: {
      type: 'element',
      tag: 'stack',
      props: { gap: 'md' },
      children: [
        {
          type: 'element',
          tag: 'text',
          props: { weight: 'bold' },
          children: [{ type: 'text', value: title }],
        },
        {
          type: 'element',
          tag: 'text',
          props: { whiteSpace: 'pre-wrap' },
          children: [{ type: 'text', value: body }],
        },
      ],
    },
  };
}

function repoOwner(repoAddress: string): string {
  const [kind, pubkey] = repoAddress.split(':');

  return kind === REPO_KIND ? (pubkey ?? '') : '';
}

function repoAddress(author: string, repoD: string): string {
  return `${REPO_KIND}:${author}:${repoD}`;
}

function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === name)
    .flatMap((tag) => tag.slice(1))
    .filter(Boolean);
}

function tagValue(event: NostrEvent, name: string): string {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function normalizeRelay(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const withProtocol = /^wss?:\/\//i.test(trimmed)
    ? trimmed
    : `wss://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
      return null;
    }

    url.protocol = 'wss:';

    return url.toString();
  } catch {
    return null;
  }
}

function uniqueRelays(relays: readonly string[]): string[] {
  return [
    ...new Set(
      relays
        .map((relay) => normalizeRelay(relay))
        .filter((relay): relay is string => relay !== null),
    ),
  ];
}

function writeRelaysFromNip65(event: NostrEvent | null): string[] {
  return uniqueRelays(
    event?.tags
      .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string')
      .filter((tag) => tag[2] === undefined || tag[2] === 'write')
      .map((tag) => tag[1] ?? '') ?? [],
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueColumnCode(label: string, used: Set<string>): string {
  const base = slugify(label) || 'column';
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(candidate);

  return candidate;
}

function columnLabels(
  payload: Record<string, unknown>,
  count: number,
): string[] {
  const labels: string[] = [];

  for (let index = 0; index < count; index += 1) {
    if (payload[`columnEnabled${index}`] !== 'true') {
      continue;
    }

    const label = payload[`columnLabel${index}`];

    if (typeof label === 'string' && label.trim()) {
      labels.push(label.trim());
    }
  }

  return labels;
}

function publishEvent(relays: string[], event: NostrEvent): Promise<void> {
  const pool = new SimplePool();
  const targets = [...new Set(relays.filter(Boolean))];

  return Promise.allSettled(pool.publish(targets, event))
    .then((results) => {
      const fulfilled = results.find((result) => result.status === 'fulfilled');

      if (!fulfilled) {
        const rejected = results.find((result) => result.status === 'rejected');

        throw new Error(
          rejected?.status === 'rejected'
            ? String(rejected.reason)
            : 'Publish failed on all relays.',
        );
      }
    })
    .finally(() => {
      pool.close(targets);
    });
}

async function queryRepoProject({
  repo,
  author,
  repoD,
  relays,
}: {
  repo: string;
  author: string;
  repoD: string;
  relays: string[];
}): Promise<RoadmapProjectPayload | null> {
  const pool = new SimplePool();
  const discoveryRelays = uniqueRelays([...DISCOVERY_RELAYS, ...relays]);

  const nip65 = await pool.get(
    discoveryRelays,
    {
      kinds: [NIP65_KIND],
      authors: [author],
      limit: 1,
    },
    { maxWait: 2_000 },
  );

  const ownerWriteRelays = writeRelaysFromNip65(nip65);
  const targets = uniqueRelays([...ownerWriteRelays, ...relays]);

  if (targets.length === 0) {
    pool.close(discoveryRelays);

    return null;
  }

  try {
    const events = await pool.querySync(
      targets,
      {
        kinds: [Number(REPO_KIND)],
        authors: [author],
        '#d': [repoD],
        limit: 1,
      },
      { maxWait: 2_000 },
    );

    const event = events[0];

    if (!event) {
      return null;
    }

    return {
      address: repo,
      authorPubkey: event.pubkey,
      name: tagValue(event, 'name') || repoD,
      description: tagValue(event, 'description'),
      repoRelays: tagValues(event, 'relays'),
      ownerWriteRelays,
    };
  } finally {
    pool.close([...discoveryRelays, ...targets]);
  }
}

async function projectForRepo(
  projects: RoadmapProjectPayload[],
  repo: string,
  author: string,
  repoD: string,
  relays: string[],
): Promise<RoadmapProjectPayload | null> {
  return (
    projects.find((project) => project.address === repo) ??
    (await queryRepoProject({ repo, author, repoD, relays }))
  );
}

export async function handleRoadmapCreateWorkflow({
  action,
  signEvent,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
  appendSystemMessage,
}: CreateWorkflowDeps): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = CreateWorkflowPayloadSchema.parse(action.payload ?? {});
    const cleanRepoAuthor = payload.repoAuthor.trim();
    const cleanRepoD = payload.repoD.trim();
    const repo = repoAddress(cleanRepoAuthor, cleanRepoD);

    const project = await projectForRepo(
      payload.projects,
      repo,
      cleanRepoAuthor,
      cleanRepoD,
      payload.relays ?? [],
    );

    const owner = repoOwner(repo);
    const title = payload.title?.trim() ?? '';
    const roadmapD = payload.roadmapD?.trim() || cleanRepoD;
    const description = payload.description?.trim() ?? '';
    const labels = columnLabels(payload, payload.columnCount);

    if (!project || !owner || project.authorPubkey !== owner) {
      throw new Error(
        'Could not resolve a valid NIP-34 repository announcement.',
      );
    }

    if (!roadmapD) {
      throw new Error('Roadmap d is required.');
    }

    if (!title) {
      throw new Error('Roadmap title is required.');
    }

    if (labels.length === 0) {
      throw new Error('Add at least one enabled column.');
    }

    const usedColumnCodes = new Set<string>();

    const columnTags = labels.map((label) => [
      'col',
      uniqueColumnCode(label, usedColumnCodes),
      label,
    ]);

    const primaryRelay = project.repoRelays[0] ?? payload.relay ?? '';

    const publishRelays = [...project.repoRelays, ...project.ownerWriteRelays];

    if (publishRelays.length === 0) {
      throw new Error(
        'No publish relays found for this repository announcement.',
      );
    }

    const template: EventTemplate = {
      kind: WORKFLOW_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: description,
      tags: [
        ['d', roadmapD],
        ['title', title],
        ...(description ? [['description', description]] : []),
        ...columnTags,
        ['a', repo, primaryRelay, 'project'],
      ],
    };

    const signed = await signEvent(template, {
      title: 'Create roadmap board',
      allowedPubkeys: [owner],
    });

    if (!signed) {
      throw new Error('Connect or unlock the repository owner signer.');
    }

    if (signed.pubkey !== owner) {
      throw new Error(
        `This roadmap must be signed by the repo author ${owner}. The selected signer returned ${signed.pubkey}.`,
      );
    }

    await publishEvent(publishRelays, signed);

    setChromeWeb(
      statusRoot(
        'Roadmap created',
        `${title}\n\nRepo: ${repo}\nEvent: ${signed.id}\nRelays: ${[...new Set(publishRelays)].join(', ')}`,
      ),
    );

    appendSystemMessage(`Created roadmap board: ${title}`);
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}

export async function handleRoadmapFetchWorkflowRepo({
  action,
  setChromeWeb,
  setChromeText,
  setChromeError,
  setChromeLoading,
}: Omit<
  CreateWorkflowDeps,
  'signEvent' | 'appendSystemMessage'
>): Promise<void> {
  setChromeLoading(true);
  setChromeError(null);
  setChromeText(null);

  try {
    const payload = CreateWorkflowPayloadSchema.parse(action.payload ?? {});
    const cleanRepoAuthor = payload.repoAuthor.trim();
    const cleanRepoD = payload.repoD.trim();
    const repo = repoAddress(cleanRepoAuthor, cleanRepoD);

    const project = await projectForRepo(
      [],
      repo,
      cleanRepoAuthor,
      cleanRepoD,
      payload.relays ?? [],
    );

    if (!project) {
      throw new Error(
        'Could not find a NIP-34 repo announcement for that pubkey and keyword.',
      );
    }

    setChromeWeb(
      renderRoadmapNewWorkflowWeb({
        projects: [project],
        relay: payload.relay ?? '',
        relays: payload.relays ?? [],
        initialRepoAuthor: cleanRepoAuthor,
        initialRepoD: cleanRepoD,
      }),
    );
  } catch (error) {
    setChromeError(error instanceof Error ? error.message : String(error));
  } finally {
    setChromeLoading(false);
  }
}
