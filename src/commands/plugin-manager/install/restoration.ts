import { randomUUID } from 'node:crypto';

import { verifyEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';

import type { RouteCommandContext } from '@src/commands/dispatch';
import { getState, setState } from '@src/db';
import { bunkerSignEvent } from '@src/nostr/bunker';
import { listConnections } from '@src/nostr/connections';
import { singletonZapTag } from '@src/payments/zap';
import type { WebNodeRoot } from '@src/web/ui-schema';

import type { PluginCatalogEntry } from './handler';
import type { PurchaseIdentity } from './payments';
import { renderRestorationChallenge } from './renderers/payments';

const CHALLENGE_LIFETIME_SECONDS = 5 * 60;

export type RestorationChallenge = {
  id: string;
  app: string;
  buyer: string;
  receiptId: string;
  expiresAt: number;
  template: EventTemplate;
};

type AuthorizeRestorationProps = {
  ctx: RouteCommandContext;
  entry: PluginCatalogEntry;
  identity: PurchaseIdentity;
  receipt: NostrEvent;
  challengeId: string;
};

function challengeKey(id: string): string {
  return `plugins.purchase-challenge.${id}`;
}

function issueChallenge(
  props: AuthorizeRestorationProps,
): RestorationChallenge {
  const now = Math.floor(Date.now() / 1000);
  const id = randomUUID();
  const app = `32107:${props.entry.pubkey}:${props.entry.name}`;
  const expiresAt = now + CHALLENGE_LIFETIME_SECONDS;

  const challenge: RestorationChallenge = {
    id,
    app,
    buyer: props.identity.pubkey,
    receiptId: props.receipt.id,
    expiresAt,
    template: {
      kind: 1,
      created_at: now,
      content:
        'AppWeaver: prove signing access to restore this app purchase. This challenge is not published and does not authorize a payment.',
      tags: [
        ['t', 'appweaver-purchase-restoration'],
        ['a', app],
        ['p', props.identity.pubkey],
        ['e', props.receipt.id],
        ['challenge', id],
        ['expiration', String(expiresAt)],
      ],
    },
  };

  setState(props.ctx.seenDb, challengeKey(id), JSON.stringify(challenge));

  return challenge;
}

type ValidateAndConsumeProps = {
  ctx: RouteCommandContext;
  challenge: RestorationChallenge;
  stored: string;
  signed: NostrEvent;
};

function validateAndConsume(props: ValidateAndConsumeProps): void {
  const { challenge, signed } = props;
  const now = Math.floor(Date.now() / 1000);

  if (now >= challenge.expiresAt) {
    throw new Error(
      'Signing challenge expired. Check purchases again for a fresh challenge.',
    );
  }

  if (
    !verifyEvent(signed) ||
    signed.pubkey !== challenge.buyer ||
    signed.kind !== challenge.template.kind ||
    signed.content !== challenge.template.content ||
    JSON.stringify(signed.tags) !== JSON.stringify(challenge.template.tags)
  ) {
    throw new Error(
      'Signing proof does not match the selected purchase identity and challenge.',
    );
  }

  // Freshness comes from the server nonce and expiry, not the signer's clock.

  const consumed = props.ctx.seenDb.run(
    'DELETE FROM state WHERE key = ? AND value = ?',
    [challengeKey(challenge.id), props.stored],
  );

  if (consumed.changes !== 1) {
    throw new Error(
      'Signing challenge was already used. Check purchases again.',
    );
  }
}

export async function authorizePurchaseRestoration(
  props: AuthorizeRestorationProps,
): Promise<WebNodeRoot | string | null> {
  const app = `32107:${props.entry.pubkey}:${props.entry.name}`;

  const request = JSON.parse(
    singletonZapTag(props.receipt, 'description'),
  ) as NostrEvent;

  if (
    props.receipt.kind !== 9735 ||
    !verifyEvent(props.receipt) ||
    request.kind !== 9734 ||
    !verifyEvent(request) ||
    request.pubkey !== props.identity.pubkey ||
    singletonZapTag(request, 'a') !== app
  ) {
    throw new Error(
      'Restoration identity must match the buyer in the verified purchase receipt.',
    );
  }

  let challenge: RestorationChallenge;
  let stored: string;

  if (props.challengeId) {
    const saved = getState(props.ctx.seenDb, challengeKey(props.challengeId));

    if (!saved) {
      throw new Error(
        'Signing challenge is missing or already used. Check purchases again.',
      );
    }

    stored = saved;
    challenge = JSON.parse(saved) as RestorationChallenge;

    if (
      challenge.id !== props.challengeId ||
      challenge.app !== app ||
      challenge.buyer !== props.identity.pubkey ||
      challenge.receiptId !== props.receipt.id
    ) {
      throw new Error(
        'Signing challenge belongs to another app, buyer, or receipt.',
      );
    }
  } else {
    challenge = issueChallenge(props);
    stored = JSON.stringify(challenge);
  }

  if (Math.floor(Date.now() / 1000) >= challenge.expiresAt) {
    throw new Error('Signing challenge expired. Check purchases again.');
  }

  if (props.identity.id === 'authenticated') {
    if (props.ctx.source !== 'web') {
      return 'Open /plugins install in the web UI to sign a fresh purchase-restoration challenge.';
    }

    if (!props.challengeId) {
      return renderRestorationChallenge({
        entry: props.entry,
        identity: props.identity,
        challenge,
      });
    }

    const args =
      props.ctx.jsonPayload && typeof props.ctx.jsonPayload === 'object'
        ? (props.ctx.jsonPayload as { arguments?: Record<string, unknown> })
            .arguments
        : null;

    if (typeof args?.signedEvent !== 'string') {
      throw new Error(
        'Approve the fresh signing challenge to restore this purchase.',
      );
    }

    const signed = JSON.parse(args.signedEvent) as NostrEvent;
    validateAndConsume({ ctx: props.ctx, challenge, stored, signed });

    return null;
  }

  const connection = listConnections(props.ctx.seenDb).find(
    (item) =>
      `bunker:${item.name}` === props.identity.id &&
      item.data.userPubkey === challenge.buyer,
  );

  if (!connection) {
    throw new Error(
      'Reconnect the selected purchase identity in the bunker manager.',
    );
  }

  const signed = await bunkerSignEvent(
    props.ctx.pool,
    connection.data,
    challenge.template,
  );

  validateAndConsume({ ctx: props.ctx, challenge, stored, signed });

  return null;
}
