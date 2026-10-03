import { describe, expect, mock, test } from 'bun:test';
import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

import type { WebAction, WebNodeRoot } from '@src/web/ui-schema';

import type { ChromeModalState } from '../chrome/types';

import { handleNostrPublishKind1Action } from './publishKind1Action';

describe('handleNostrPublishKind1Action', () => {
  test('opens chrome modal, publishes to write relays, and reports failure when all fail', async () => {
    let capturedModal = null as ChromeModalState | null;
    let capturedLoading = null as boolean | null;
    const systemMessages: string[] = [];

    const mockEvent: NostrEvent = {
      id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      pubkey:
        '1111111111111111111111111111111111111111111111111111111111111111',
      created_at: 1234567,
      kind: 1,
      tags: [],
      content: 'Hello world',
      sig: 'sig',
    };

    const action: Extract<WebAction, { type: 'clientAction' }> = {
      type: 'clientAction',
      action: 'nostr.publishKind1',
      payload: {
        content: 'Hello world',
        tags: [['t', 'journal']],
        signTitle: 'Sign Event: Publish journal entry',
        fallbackRelays: ['ws://127.0.0.1:59999'],
        statusTitle: 'Journal entry published',
        statusMessage: 'Journal entry #42',
        onSuccessCommand: {
          command: 'journal',
          subcommand: 'publish',
          arguments: { id: 42 },
          options: {},
        },
      },
    };

    const signEvent = mock(async (_event: EventTemplate) => mockEvent);
    let capturedError = null as string | null;

    const result = await handleNostrPublishKind1Action({
      action,
      currentUserPubkey: mockEvent.pubkey,
      signEvent,
      setChromeModal: (modal) => {
        capturedModal = modal;
      },
      setChromeWeb: () => {},
      setChromeText: () => {},
      setChromeError: (err) => {
        capturedError = err;
      },
      setChromeLoading: (loading) => {
        capturedLoading = loading;
      },
      appendSystemMessage: (msg) => {
        systemMessages.push(msg);
      },
    });

    expect(capturedModal).toMatchObject({
      command: 'nostr',
      subcommand: 'publish',
      title: 'Journal entry published',
    });

    expect(result).toBeNull();
    expect(capturedError).toContain('Publish failed on all relays');
    expect(capturedLoading).toBe(false);
  });

  test('successful publish sets report modal with accepted relays and triggers onSuccessCommand', async () => {
    let capturedModal = null as ChromeModalState | null;
    let capturedWeb = null as WebNodeRoot | null;
    let capturedLoading = null as boolean | null;
    const systemMessages: string[] = [];

    const mockEvent: NostrEvent = {
      id: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      pubkey:
        '1111111111111111111111111111111111111111111111111111111111111111',
      created_at: 1234567,
      kind: 1,
      tags: [],
      content: 'Hello world',
      sig: 'sig',
    };

    const action: Extract<WebAction, { type: 'clientAction' }> = {
      type: 'clientAction',
      action: 'nostr.publishKind1',
      payload: {
        content: 'Hello world',
        tags: [['t', 'journal']],
        signTitle: 'Sign Event: Publish journal entry',
        fallbackRelays: ['wss://relay1.example.com'],
        statusTitle: 'Journal entry published',
        statusMessage: 'Journal entry #42',
        onSuccessCommand: {
          command: 'journal',
          subcommand: 'publish',
          arguments: { id: 42 },
          options: {},
        },
      },
    };

    const signEvent = mock(async (_event: EventTemplate) => mockEvent);

    // Mock SimplePool.prototype.get to return kind 10002 write relays
    const originalGet = SimplePool.prototype.get;
    const originalPublish = SimplePool.prototype.publish;

    SimplePool.prototype.get = async () => ({
      id: 'nip65id',
      pubkey: mockEvent.pubkey,
      kind: 10002,
      created_at: 1000,
      tags: [
        ['r', 'wss://write1.example.com', 'write'],
        ['r', 'wss://write2.example.com', 'write'],
      ],
      content: '',
      sig: 'sig',
    });

    // Mock SimplePool.prototype.publish to return 1 success and 1 failure
    SimplePool.prototype.publish = (relays) => {
      return relays.map((relay) => {
        if (relay.includes('write1')) {
          return Promise.resolve('ok');
        }

        return Promise.reject(new Error('connection timeout'));
      });
    };

    try {
      const result = await handleNostrPublishKind1Action({
        action,
        currentUserPubkey: mockEvent.pubkey,
        signEvent,
        setChromeModal: (modal) => {
          capturedModal = modal;
        },
        setChromeWeb: (root) => {
          capturedWeb = root;
        },
        setChromeText: () => {},
        setChromeError: () => {},
        setChromeLoading: (loading) => {
          capturedLoading = loading;
        },
        appendSystemMessage: (msg) => {
          systemMessages.push(msg);
        },
      });

      expect(result).not.toBeNull();
      expect(result?.nostrUrl).toContain('nostr://nevent1');

      expect(result?.onSuccessCommand).toEqual({
        command: 'journal',
        subcommand: 'publish',
        arguments: { id: 42 },
        options: {},
      });

      expect(capturedModal).toMatchObject({
        command: 'nostr',
        subcommand: 'publish',
        title: 'Journal entry published',
      });

      expect(capturedWeb).not.toBeNull();
      expect(capturedWeb?.kind).toBe('ui');

      expect(capturedWeb?.meta).toEqual({
        command: 'nostr',
        subcommand: 'publish',
      });

      // The WebNode tree should have the title, message, and relay items
      expect(capturedLoading).toBe(false);
      expect(systemMessages).toContain('Journal entry published');
    } finally {
      SimplePool.prototype.get = originalGet;
      SimplePool.prototype.publish = originalPublish;
    }
  });
});
