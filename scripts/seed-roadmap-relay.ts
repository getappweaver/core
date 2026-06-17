import { createHash } from 'node:crypto';

import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';

import { APPWEAVER_RELAY } from '@src/appweaver-relay';

const PROJECT_KIND = 30617;
const PROFILE_KIND = 0;
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
  project: ProjectKey;
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

type PluginSeed = {
  key: PluginKey;
  projectD: string;
  projectName: string;
  catalogD: string;
  repo: string;
  description: string;
  workflowD: string;
  workflowTitle: string;
};

type PluginKey = 'todo' | 'bookmarks' | 'journal' | 'job' | 'file';
type ProjectKey = 'core' | PluginKey;

const pluginSeeds: PluginSeed[] = [
  {
    key: 'todo',
    projectD: 'appweaver-plugin-todo',
    projectName: 'AppWeaver Todo Plugin',
    catalogD: 'todo',
    repo: 'https://github.com/getappweaver/plugin-todo',
    description: 'Official AppWeaver plugin for todo management.',
    workflowD: 'appweaver-plugin-todo-roadmap',
    workflowTitle: 'Todo Plugin Roadmap',
  },
  {
    key: 'bookmarks',
    projectD: 'appweaver-plugin-bookmarks',
    projectName: 'AppWeaver Bookmarks Plugin',
    catalogD: 'bookmarks',
    repo: 'https://github.com/getappweaver/plugin-bookmarks',
    description: 'Official AppWeaver plugin for bookmark management.',
    workflowD: 'appweaver-plugin-bookmarks-roadmap',
    workflowTitle: 'Bookmarks Plugin Roadmap',
  },
  {
    key: 'journal',
    projectD: 'appweaver-plugin-journal',
    projectName: 'AppWeaver Journal Plugin',
    catalogD: 'journal',
    repo: 'https://github.com/getappweaver/plugin-journal',
    description: "Official AppWeaver plugin for Captain's Log journaling.",
    workflowD: 'appweaver-plugin-journal-roadmap',
    workflowTitle: 'Journal Plugin Roadmap',
  },
  {
    key: 'job',
    projectD: 'appweaver-plugin-job',
    projectName: 'AppWeaver Job Plugin',
    catalogD: 'job',
    repo: 'https://github.com/getappweaver/plugin-job',
    description: 'Official AppWeaver plugin for scheduled jobs.',
    workflowD: 'appweaver-plugin-job-roadmap',
    workflowTitle: 'Job Plugin Roadmap',
  },
  {
    key: 'file',
    projectD: 'appweaver-plugin-file',
    projectName: 'AppWeaver File Plugin',
    catalogD: 'file',
    repo: 'https://github.com/getappweaver/plugin-file',
    description: 'Official AppWeaver plugin for workspace file tools.',
    workflowD: 'appweaver-plugin-file-roadmap',
    workflowTitle: 'File Plugin Roadmap',
  },
];

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
          PROFILE_KIND,
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
  const zapServer = secret('zap-server');
  const payerOne = secret('payer-one');
  const payerTwo = secret('payer-two');
  const payerThree = secret('payer-three');
  const maintainerPubkey = getPublicKey(maintainer);
  const pluginMaintainerPubkey = getPublicKey(pluginMaintainer);
  const zapServerPubkey = getPublicKey(zapServer);
  const coreRepo = `${PROJECT_KIND}:${maintainerPubkey}:appweaver`;

  const pluginRepos = new Map<PluginKey, string>(
    pluginSeeds.map((plugin) => [
      plugin.key,
      `${PROJECT_KIND}:${pluginMaintainerPubkey}:${plugin.projectD}`,
    ]),
  );

  const maintainerProfile = sign(
    maintainer,
    PROFILE_KIND,
    BASE_CREATED_AT + 1_000,
    [],
    JSON.stringify({
      name: 'getappweaver',
      display_name: 'AppWeaver',
      nip05: '_@getappweaver.com',
      lud16: 'donations_test@getappweaver.com',
      website: 'https://getappweaver.com',
    }),
  );

  const pluginMaintainerProfile = sign(
    pluginMaintainer,
    PROFILE_KIND,
    BASE_CREATED_AT + 1_000,
    [],
    JSON.stringify({
      name: 'getappweaver-plugins',
      display_name: 'AppWeaver Plugins',
      nip05: 'plugins@getappweaver.com',
      lud16: 'donations_test@getappweaver.com',
      website: 'https://getappweaver.com',
    }),
  );

  const coreProject = sign(
    maintainer,
    PROJECT_KIND,
    BASE_CREATED_AT + 1,
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

  const pluginProjects = new Map<PluginKey, SignedEvent>();
  const pluginCatalogs = new Map<PluginKey, SignedEvent>();

  pluginSeeds.forEach((plugin, index) => {
    const repo = pluginRepos.get(plugin.key);

    if (!repo) {
      throw new Error(`missing plugin repo: ${plugin.key}`);
    }

    pluginProjects.set(
      plugin.key,
      sign(
        pluginMaintainer,
        PROJECT_KIND,
        BASE_CREATED_AT + 1 + index,
        [
          ['d', plugin.projectD],
          ['name', plugin.projectName],
          ['description', plugin.description],
          ['web', `https://getappweaver.com/${plugin.catalogD}`],
          ['relays', relay],
          ['maintainers', pluginMaintainerPubkey],
          ['t', 'appweaver'],
          ['t', 'plugin'],
        ],
        '',
      ),
    );

    pluginCatalogs.set(
      plugin.key,
      sign(
        pluginMaintainer,
        PLUGIN_KIND,
        BASE_CREATED_AT + 10 + index,
        [
          ['d', plugin.catalogD],
          ['repo', plugin.repo],
          ['description', plugin.description],
          ['version', '1.4.0'],
          ['core-api-version', '9'],
          ['ref', 'v1.4.0', '9', 'Roadmap test plugin catalog entry'],
          ['a', repo, relay],
        ],
        '',
      ),
    );
  });

  const coreWorkflow = sign(
    maintainer,
    WORKFLOW_KIND,
    BASE_CREATED_AT + 20,
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

  const pluginWorkflows = new Map<PluginKey, SignedEvent>();

  pluginSeeds.forEach((plugin, index) => {
    const repo = pluginRepos.get(plugin.key);
    const catalog = pluginCatalogs.get(plugin.key);

    if (!repo || !catalog) {
      throw new Error(`missing plugin workflow dependency: ${plugin.key}`);
    }

    pluginWorkflows.set(
      plugin.key,
      sign(
        pluginMaintainer,
        WORKFLOW_KIND,
        BASE_CREATED_AT + 21 + index,
        [
          ['d', plugin.workflowD],
          ['title', plugin.workflowTitle],
          [
            'description',
            `Maintainer-selected roadmap issues for the official ${plugin.catalogD} plugin`,
          ],
          ['col', 'planned', 'Planned'],
          ['col', 'in-progress', 'In Progress'],
          ['col', 'shipped', 'Shipped'],
          ['col', 'rejected', 'Rejected'],
          ['col', 'archived', 'Archived'],
          ['a', repo, relay, 'project'],
          ['e', catalog.id, relay, 'plugin'],
        ],
        '',
      ),
    );
  });

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
      project: 'bookmarks',
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
    const repo =
      issue.project === 'core' ? coreRepo : pluginRepos.get(issue.project);

    if (!repo) {
      throw new Error(`missing issue repo: ${issue.project}`);
    }

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

  const bookmarkWorkflow = pluginWorkflows.get('bookmarks');

  if (!bookmarkWorkflow) {
    throw new Error('missing bookmarks workflow');
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
      workflow: bookmarkWorkflow,
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
      zapServer,
      MOCK_ZAP_KIND,
      BASE_CREATED_AT + zap.offset,
      [
        ['e', issue.id, relay],
        ['p', issue.pubkey],
        ['P', getPublicKey(zap.payer)],
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
    maintainerProfile,
    pluginMaintainerProfile,
    coreProject,
    ...pluginProjects.values(),
    ...pluginCatalogs.values(),
    coreWorkflow,
    ...pluginWorkflows.values(),
    ...issueEvents.values(),
    ...trackerEvents,
    ...statusEvents,
    ...comments,
    ...zapEvents,
  ];

  console.log(`Publishing ${events.length} roadmap seed events to ${relay}...`);
  await publishAll(relay, events);
  await verifySeed(relay);
  console.log('\nStable roadmap addresses:');
  console.log(`  dev LNURL nostrPubkey: ${zapServerPubkey}`);
  console.log(`  core project: ${coreRepo}`);

  console.log(
    `  core board: ${nip19.naddrEncode({ kind: WORKFLOW_KIND, pubkey: coreWorkflow.pubkey, identifier: 'appweaver-roadmap', relays: [relay] })}`,
  );

  for (const plugin of pluginSeeds) {
    const repo = pluginRepos.get(plugin.key);
    const workflow = pluginWorkflows.get(plugin.key);

    if (!repo || !workflow) {
      continue;
    }

    console.log(`  ${plugin.key} project: ${repo}`);

    console.log(
      `  ${plugin.key} board: ${nip19.naddrEncode({ kind: WORKFLOW_KIND, pubkey: workflow.pubkey, identifier: plugin.workflowD, relays: [relay] })}`,
    );
  }

  console.log('\nSeed complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
