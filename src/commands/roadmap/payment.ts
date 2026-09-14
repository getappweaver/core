import type { NostrEvent } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools';

import type { RouteCommandContext } from '@src/commands/dispatch';
import { Satoshi } from '@src/payments/amount';
import type {
  InteractivePaymentResult,
  PaymentSettlement,
} from '@src/payments/interactive-types';
import { createUnsupportedInteractivePaymentService } from '@src/payments/service';

import { uniqueRoadmapRelays } from './model';

const ZAP_REQUEST_KIND = 9734;
const ZAP_RECEIPT_KIND = 9735;
const HEX_32_BYTES = /^[0-9a-f]{64}$/i;
const RECEIPT_QUERY_TIMEOUT_MS = 5_000;

function webArgument(ctx: RouteCommandContext, name: string): string {
  if (ctx.source !== 'web' || typeof ctx.jsonPayload !== 'object') {
    return '';
  }

  const payload = ctx.jsonPayload as {
    arguments?: Record<string, unknown>;
  };

  const value = payload.arguments?.[name];

  return typeof value === 'string' ? value.trim() : '';
}

function tagValue(event: NostrEvent, name: string): string {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? '';
}

function validZapRequestDescription(params: {
  receipt: NostrEvent;
  zapRequestId: string;
  issueId: string;
  recipientPubkey: string;
}): boolean {
  const description = tagValue(params.receipt, 'description');

  if (!description) {
    return false;
  }

  try {
    const request = JSON.parse(description) as NostrEvent;

    return (
      request.kind === ZAP_REQUEST_KIND &&
      request.id === params.zapRequestId &&
      verifyEvent(request) &&
      tagValue(request, 'e') === params.issueId &&
      tagValue(request, 'p') === params.recipientPubkey
    );
  } catch {
    return false;
  }
}

async function checkZapSettlement(params: {
  ctx: RouteCommandContext;
  invoice: string;
  issueId: string;
  recipientPubkey: string;
  receiptPubkey: string;
  zapRequestId: string;
  relays: string[];
}): Promise<PaymentSettlement> {
  try {
    const receipts = await params.ctx.pool.querySync(
      params.relays,
      {
        kinds: [ZAP_RECEIPT_KIND],
        authors: [params.receiptPubkey],
        '#e': [params.issueId],
        '#p': [params.recipientPubkey],
      },
      { maxWait: RECEIPT_QUERY_TIMEOUT_MS },
    );

    const settled = receipts.some(
      (receipt) =>
        verifyEvent(receipt) &&
        tagValue(receipt, 'bolt11').toLowerCase() ===
          params.invoice.toLowerCase() &&
        validZapRequestDescription({
          receipt,
          zapRequestId: params.zapRequestId,
          issueId: params.issueId,
          recipientPubkey: params.recipientPubkey,
        }),
    );

    return settled ? { status: 'settled' } : { status: 'pending' };
  } catch (error) {
    return {
      status: 'failed',
      message:
        error instanceof Error
          ? error.message
          : 'Could not verify the zap receipt.',
    };
  }
}

function renderResult(result: InteractivePaymentResult): string {
  switch (result.status) {
    case 'success':
      return 'Roadmap zap payment confirmed.';
    case 'rejected':
      return 'Roadmap zap payment cancelled.';
    case 'unsupported':
      return result.reasons.map((reason) => reason.message).join(' ');
    case 'failed':
      return `Roadmap zap payment failed: ${result.error.message}`;
  }
}

export async function handleRoadmapPayment(
  ctx: RouteCommandContext,
): Promise<string> {
  if (ctx.source !== 'web') {
    return 'Roadmap zap payments require the web UI.';
  }

  const invoice = webArgument(ctx, 'invoice');
  const amount = webArgument(ctx, 'amount');
  const title = webArgument(ctx, 'title');
  const recipient = webArgument(ctx, 'recipient');
  const issueId = webArgument(ctx, 'issueId').toLowerCase();
  const recipientPubkey = webArgument(ctx, 'recipientPubkey').toLowerCase();
  const receiptPubkey = webArgument(ctx, 'receiptPubkey').toLowerCase();
  const zapRequestId = webArgument(ctx, 'zapRequestId').toLowerCase();
  const relays = uniqueRoadmapRelays(webArgument(ctx, 'relays').split(','));

  if (
    !invoice ||
    !amount ||
    !title ||
    !recipient ||
    !HEX_32_BYTES.test(issueId) ||
    !HEX_32_BYTES.test(recipientPubkey) ||
    !HEX_32_BYTES.test(receiptPubkey) ||
    !HEX_32_BYTES.test(zapRequestId) ||
    relays.length === 0
  ) {
    return 'Invalid roadmap zap payment handoff.';
  }

  const principal = Satoshi.parse(amount);

  const payments = ctx.interactivePaymentServiceFactory
    ? ctx.interactivePaymentServiceFactory({
        pluginName: 'appweaver-core',
        pluginAlias: 'roadmap',
        title: 'Roadmap',
        iconUrl:
          '/builtin-icons/src__commands__roadmap__renderers__roadmap.svg',
      })
    : createUnsupportedInteractivePaymentService();

  const result = await payments.requestPayment({
    purpose: `Fund ${title}`,
    recipient,
    options: [
      {
        type: 'lightning',
        amount: principal,
        freshlyCreated: true,
        refreshable: false,
        createInvoice: async () => ({
          invoice,
          checkSettlement: () =>
            checkZapSettlement({
              ctx,
              invoice,
              issueId,
              recipientPubkey,
              receiptPubkey,
              zapRequestId,
              relays,
            }),
        }),
      },
    ],
  });

  return renderResult(result);
}
