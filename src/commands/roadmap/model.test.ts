import { expect, test } from 'bun:test';
import type { NostrEvent } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools';

import {
  ISSUE_KIND,
  materializeRoadmap,
  PROJECT_KIND,
  WORKFLOW_KIND,
  ZAP_KIND,
} from './model';

const ownerPubkey = 'a'.repeat(64);
const issueAuthorPubkey = 'b'.repeat(64);
const receiptPubkey = 'c'.repeat(64);
const projectAddress = `${PROJECT_KIND}:${ownerPubkey}:core`;

function event({
  id,
  kind,
  pubkey = ownerPubkey,
  tags,
}: {
  id: string;
  kind: number;
  pubkey?: string;
  tags: string[][];
}): NostrEvent {
  return {
    id: id.repeat(64).slice(0, 64),
    pubkey,
    created_at: 1,
    kind,
    tags,
    content: '',
    sig: 'f'.repeat(128),
  };
}

test('reads zap amounts from the NIP-57 description request', () => {
  const project = event({
    id: '1',
    kind: PROJECT_KIND,
    tags: [
      ['d', 'core'],
      ['name', 'Core'],
    ],
  });

  const issue = event({
    id: '2',
    kind: ISSUE_KIND,
    pubkey: issueAuthorPubkey,
    tags: [
      ['a', projectAddress],
      ['subject', 'Funded issue'],
    ],
  });

  const workflow = event({
    id: '3',
    kind: WORKFLOW_KIND,
    tags: [
      ['d', 'core'],
      ['a', projectAddress, '', 'project'],
      ['col', 'planned', 'Planned'],
    ],
  });

  const zapRequest = finalizeEvent(
    {
      created_at: 1,
      content: '',
      kind: 9734,
      tags: [
        ['e', issue.id],
        ['p', ownerPubkey],
        ['amount', '100000'],
      ],
    },
    new Uint8Array(32).fill(1),
  );

  const receipt = event({
    id: '4',
    kind: ZAP_KIND,
    pubkey: receiptPubkey,
    tags: [
      ['e', issue.id],
      ['p', ownerPubkey],
      ['description', JSON.stringify(zapRequest)],
    ],
  });

  const view = materializeRoadmap({
    relay: 'wss://relay.ngit.dev/',
    events: [project, issue, workflow, receipt],
    authorIdentities: null,
    zapReceiptPubkeys: new Set([receiptPubkey]),
    zapReceiptPubkeysByProjectAddress: null,
  });

  const renderedIssue = view.workflows[0]?.columns[0]?.issues[0];

  expect(renderedIssue?.fundingSats).toBe(100);
  expect(renderedIssue?.zapCount).toBe(1);
  expect(view.zapCount).toBe(1);
});
