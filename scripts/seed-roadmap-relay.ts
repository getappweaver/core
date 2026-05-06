import { createHash } from 'node:crypto';

import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';

import { APPWEAVER_RELAY } from '@src/appweaver-relay';

const PROJECT_KIND = 30617;
const ISSUE_KIND = 1621;
const STATUS_RESOLVED_KIND = 1631;
const STATUS_CLOSED_KIND = 1632;
const COMMENT_KIND = 1111;
const PLUGIN_KIND = 32107;
const WORKFLOW_KIND = 39010;
const TRACKER_KIND = 39011;
const MOCK_ZAP_KIND = 9735;
const BASE_CREATED_AT = 1_765_000_000;

type SignedEvent = ReturnType<typeof finalizeEvent>;

type IssueSeed = {
  key: string;
  project: 'core' | 'plugin';
  author: Uint8Array;
  subject: string;
  content: string;
  labels: string[];
  offset: number;
};

type TrackerSeed = {
  issueKey: string;
  workflow: SignedEvent;
  column: string;
  rank: number;
  offset: number;
};

type ZapSeed = {
  issueKey: string;
  amountSats: number;
  payer: Uint8Array;
  offset: number;
};

function secret(label: string): Uint8Array {
  return createHash('sha256').update(`appweaver-roadmap:${label}`).digest();
}

function sign(
  sk: Uint8Array,
  kind: number,
  createdAt: number,
  tags: string[][],
  content: string,
): SignedEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content }, sk);
}

function amountMsats(sats: number): string {
  return String(sats * 1000);
}

async function publishAll(relay: string, events: SignedEvent[]): Promise<void> {
  const pool = new SimplePool();

  try {
    const results = await Promise.allSettled(
      events.flatMap((event) => pool.publish([relay], event)),
    );

    const rejected = results.filter((result) => result.status === 'rejected');

    if (rejected.length > 0) {
      for (const result of rejected) {
        if (result.status === 'rejected') {
          console.error(`publish failed: ${String(result.reason)}`);
        }
      }

      throw new Error(`${rejected.length} publish operation(s) failed`);
    }
  } finally {
    pool.close([relay]);
  }
}

async function verifySeed(relay: string): Promise<void> {
  const pool = new SimplePool();

  try {
    const events = await pool.querySync(
      [relay],
      {
        kinds: [
          PROJECT_KIND,
          ISSUE_KIND,
          STATUS_RESOLVED_KIND,
          STATUS_CLOSED_KIND,
          COMMENT_KIND,
          PLUGIN_KIND,
          WORKFLOW_KIND,
          TRACKER_KIND,
          MOCK_ZAP_KIND,
        ],
        limit: 200,
      },
      { maxWait: 2_000 },
    );

    const byKind = new Map<number, number>();

    for (const event of events) {
      byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    }

    console.log('\nFetched from relay:');

    for (const kind of [...byKind.keys()].sort((a, b) => a - b)) {
      console.log(`  kind ${kind}: ${byKind.get(kind)}`);
    }
  } finally {
    pool.close([relay]);
  }
}

async function main(): Promise<void> {
  const relay = process.argv[2] ?? APPWEAVER_RELAY;
  const maintainer = secret('maintainer');
  const pluginMaintainer = secret('plugin-maintainer');
  const alice = secret('alice');
  const bob = secret('bob');
  const carol = secret('carol');
  const dave = secret('dave');
  const eve = secret('eve');
  const payerOne = secret('payer-one');
  const payerTwo = secret('payer-two');
  const payerThree = secret('payer-three');
  const maintainerPubkey = getPublicKey(maintainer);
  const pluginMaintainerPubkey = getPublicKey(pluginMaintainer);
  const coreRepo = `${PROJECT_KIND}:${maintainerPubkey}:appweaver`;
  const pluginRepo = `${PROJECT_KIND}:${pluginMaintainerPubkey}:appweaver-plugin-bookmarks`;

  const coreProject = sign(
    maintainer,
    PROJECT_KIND,
    BASE_CREATED_AT,
    [
      ['d', 'appweaver'],
      ['name', 'AppWeaver'],
      [
        'description',
        'Open-source AI-first platform for installable apps, automation, and bot workflows.',
      ],
      ['web', 'https://getappweaver.com'],
      ['relays', relay],
      ['maintainers', maintainerPubkey],
      ['t', 'appweaver'],
    ],
    '',
  );

  const pluginProject = sign(
    pluginMaintainer,
    PROJECT_KIND,
    BASE_CREATED_AT + 1,
    [
      ['d', 'appweaver-plugin-bookmarks'],
      ['name', 'AppWeaver Bookmarks Plugin'],
      ['description', 'Official AppWeaver plugin for bookmark management.'],
      ['web', 'https://getappweaver.com/plugins/bookmarks'],
      ['relays', relay],
      ['maintainers', pluginMaintainerPubkey],
      ['t', 'appweaver'],
      ['t', 'plugin'],
    ],
    '',
  );

  const pluginCatalog = sign(
    pluginMaintainer,
    PLUGIN_KIND,
    BASE_CREATED_AT + 2,
    [
      ['d', 'bookmarks'],
      ['repo', 'https://github.com/getappweaver/plugin-bookmarks'],
      ['description', 'Official AppWeaver bookmark management plugin.'],
      ['version', '1.4.0'],
      ['core-api-version', '9'],
      ['ref', 'v1.4.0', '9', 'Roadmap test plugin catalog entry'],
      ['a', pluginRepo, relay],
    ],
    '',
  );

  const coreWorkflow = sign(
    maintainer,
    WORKFLOW_KIND,
    BASE_CREATED_AT + 3,
    [
      ['d', 'appweaver-roadmap'],
      ['title', 'AppWeaver Roadmap'],
      ['description', 'Maintainer-selected AppWeaver core roadmap issues'],
      ['col', 'planned', 'Planned'],
      ['col', 'in-progress', 'In Progress'],
      ['col', 'shipped', 'Shipped'],
      ['col', 'rejected', 'Rejected'],
      ['col', 'archived', 'Archived'],
      ['a', coreRepo, relay, 'project'],
    ],
    '',
  );

  const pluginWorkflow = sign(
    pluginMaintainer,
    WORKFLOW_KIND,
    BASE_CREATED_AT + 4,
    [
      ['d', 'appweaver-plugin-bookmarks-roadmap'],
      ['title', 'Bookmarks Plugin Roadmap'],
      [
        'description',
        'Maintainer-selected roadmap issues for the official bookmarks plugin',
      ],
      ['col', 'planned', 'Planned'],
      ['col', 'in-progress', 'In Progress'],
      ['col', 'shipped', 'Shipped'],
      ['col', 'rejected', 'Rejected'],
      ['col', 'archived', 'Archived'],
      ['a', pluginRepo, relay, 'project'],
      ['e', pluginCatalog.id, relay, 'plugin'],
    ],
    '',
  );

  const issues: IssueSeed[] = [
    {
      key: 'offline-mode',
      project: 'core',
      author: alice,
      subject: 'Add offline project editing',
      content:
        'I want to keep editing generated apps when my connection drops, then sync once I am online again.',
      labels: ['feature', 'editor', 'offline'],
      offset: 10,
    },
    {
      key: 'mobile-preview-bug',
      project: 'core',
      author: bob,
      subject: 'Mobile preview cuts off the bottom toolbar',
      content:
        'On small screens the preview toolbar is partially hidden, which makes it hard to test mobile layouts.',
      labels: ['bug', 'mobile', 'preview'],
      offset: 11,
    },
    {
      key: 'export-static-site',
      project: 'core',
      author: carol,
      subject: 'Export project as static site',
      content:
        'Please add a one-click export that produces a static site bundle for deployment elsewhere.',
      labels: ['feature', 'publishing'],
      offset: 12,
    },
    {
      key: 'wallet-connect',
      project: 'core',
      author: dave,
      subject: 'Connect Cashu wallet for funding roadmap issues',
      content:
        'The roadmap widget should let me fund issues from an in-app Cashu wallet flow.',
      labels: ['feature', 'wallet', 'roadmap'],
      offset: 13,
    },
    {
      key: 'bookmark-search',
      project: 'plugin',
      author: eve,
      subject: 'Bookmarks plugin should search by tag synonyms',
      content:
        'Searching bookmarks should match taxonomy synonyms, not only exact tags.',
      labels: ['feature', 'search', 'bookmarks'],
      offset: 14,
    },
  ];

  const issueEvents = new Map<string, SignedEvent>();

  for (const issue of issues) {
    const repo = issue.project === 'core' ? coreRepo : pluginRepo;

    const projectOwner =
      issue.project === 'core' ? maintainerPubkey : pluginMaintainerPubkey;

    issueEvents.set(
      issue.key,
      sign(
        issue.author,
        ISSUE_KIND,
        BASE_CREATED_AT + issue.offset,
        [
          ['a', repo, relay],
          ['p', projectOwner],
          ['subject', issue.subject],
          ...issue.labels.map((label) => ['t', label]),
        ],
        issue.content,
      ),
    );
  }

  const trackers: TrackerSeed[] = [
    {
      issueKey: 'mobile-preview-bug',
      workflow: coreWorkflow,
      column: 'in-progress',
      rank: 10,
      offset: 30,
    },
    {
      issueKey: 'export-static-site',
      workflow: coreWorkflow,
      column: 'planned',
      rank: 20,
      offset: 31,
    },
    {
      issueKey: 'wallet-connect',
      workflow: coreWorkflow,
      column: 'planned',
      rank: 30,
      offset: 32,
    },
    {
      issueKey: 'bookmark-search',
      workflow: pluginWorkflow,
      column: 'planned',
      rank: 10,
      offset: 33,
    },
  ];

  const trackerEvents = trackers.map((tracker) => {
    const issue = issueEvents.get(tracker.issueKey);

    if (!issue) {
      throw new Error(`missing issue for tracker: ${tracker.issueKey}`);
    }

    const workflowOwner =
      tracker.workflow.pubkey === maintainerPubkey
        ? maintainer
        : pluginMaintainer;

    return sign(
      workflowOwner,
      TRACKER_KIND,
      BASE_CREATED_AT + tracker.offset,
      [
        [
          'd',
          `${tracker.workflow.tags.find((tag) => tag[0] === 'd')?.[1] ?? 'workflow'}:${issue.id}`,
        ],
        ['e', issue.id, relay, 'tracked_item'],
        [
          'a',
          `${tracker.workflow.kind}:${tracker.workflow.pubkey}:${tracker.workflow.tags.find((tag) => tag[0] === 'd')?.[1]}`,
          relay,
          'workflow',
        ],
        ['rank', String(tracker.rank)],
      ],
      tracker.column,
    );
  });

  const resolvedIssue = issueEvents.get('mobile-preview-bug');
  const closedIssue = issueEvents.get('wallet-connect');

  if (!resolvedIssue || !closedIssue) {
    throw new Error('missing status issue');
  }

  const statusEvents = [
    sign(
      maintainer,
      STATUS_RESOLVED_KIND,
      BASE_CREATED_AT + 40,
      [
        ['e', resolvedIssue.id, relay, 'root'],
        ['p', maintainerPubkey],
        ['p', resolvedIssue.pubkey],
        ['a', coreRepo, relay],
      ],
      'Fixed in the current development build.',
    ),
    sign(
      dave,
      STATUS_CLOSED_KIND,
      BASE_CREATED_AT + 41,
      [
        ['e', closedIssue.id, relay, 'root'],
        ['p', maintainerPubkey],
        ['p', closedIssue.pubkey],
        ['a', coreRepo, relay],
      ],
      'Closing this because it overlaps with the roadmap funding issue.',
    ),
  ];

  const comments = [
    sign(
      bob,
      COMMENT_KIND,
      BASE_CREATED_AT + 50,
      [
        ['E', resolvedIssue.id, relay],
        ['K', String(ISSUE_KIND)],
        ['P', resolvedIssue.pubkey],
        ['a', coreRepo, relay],
      ],
      'I can reproduce this on iPhone SE viewport.',
    ),
  ];

  const zaps: ZapSeed[] = [
    {
      issueKey: 'offline-mode',
      amountSats: 21_000,
      payer: payerOne,
      offset: 60,
    },
    {
      issueKey: 'offline-mode',
      amountSats: 8_000,
      payer: payerTwo,
      offset: 61,
    },
    {
      issueKey: 'export-static-site',
      amountSats: 13_000,
      payer: payerOne,
      offset: 62,
    },
    {
      issueKey: 'mobile-preview-bug',
      amountSats: 5_000,
      payer: payerThree,
      offset: 63,
    },
    {
      issueKey: 'bookmark-search',
      amountSats: 3_000,
      payer: payerTwo,
      offset: 64,
    },
  ];

  const zapEvents = zaps.map((zap, idx) => {
    const issue = issueEvents.get(zap.issueKey);

    if (!issue) {
      throw new Error(`missing issue for zap: ${zap.issueKey}`);
    }

    return sign(
      zap.payer,
      MOCK_ZAP_KIND,
      BASE_CREATED_AT + zap.offset,
      [
        ['e', issue.id, relay],
        ['p', issue.pubkey],
        ['amount', amountMsats(zap.amountSats)],
        ['bolt11', `lnbc${zap.amountSats}n1mockroadmap${idx}`],
        ['description', `mock verified zap for ${zap.issueKey}`],
        [
          'preimage',
          createHash('sha256').update(`preimage:${idx}`).digest('hex'),
        ],
      ],
      'mock verified zap accepted by the local roadmap relay',
    );
  });

  const events = [
    coreProject,
    pluginProject,
    pluginCatalog,
    coreWorkflow,
    pluginWorkflow,
    ...issueEvents.values(),
    ...trackerEvents,
    ...statusEvents,
    ...comments,
    ...zapEvents,
  ];

  console.log(`Publishing ${events.length} roadmap seed events to ${relay}...`);
  await publishAll(relay, events);
  await verifySeed(relay);
  console.log('\nSeed complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
