import type {
  BuiltinHandler,
  RouteCommandContext,
} from '@src/commands/dispatch';
import { renderBuiltinHelpText } from '@src/commands/help/renderers/text';
import { createWebPrompt } from '@src/core/plugin';
import { NwcClient } from '@src/nwc/client';
import { parseNwcConnectionUri } from '@src/nwc/connection';
import { NwcError } from '@src/nwc/errors';
import {
  addNwcConnection,
  getStoredNwcConnection,
  listNwcConnections,
  removeNwcConnection,
  renameNwcConnection,
  updateNwcConnectionVerification,
  type StoredNwcConnection,
} from '@src/nwc/state';
import type { NwcWalletInfo, NwcWalletServiceInfo } from '@src/nwc/types';
import type {
  InteractivePaymentResult,
  PaymentSettlement,
} from '@src/payments/interactive-types';
import { parseLightningInvoice } from '@src/payments/lightning-invoice';
import { createUnsupportedInteractivePaymentService } from '@src/payments/service';
import type { WebHandlerResult } from '@src/web/ui-schema';
import { multiChoiceQuestion } from '@src/web/widgets';

import {
  renderNwcDetailWeb,
  renderNwcListText,
  renderNwcListWeb,
} from './renderers';

type VerifiedConnection = {
  service: NwcWalletServiceInfo;
  wallet: NwcWalletInfo | null;
};

function webArgument(ctx: RouteCommandContext, name: string): string | null {
  if (ctx.source !== 'web' || typeof ctx.jsonPayload !== 'object') {
    return null;
  }

  const payload = ctx.jsonPayload as {
    arguments?: Record<string, unknown>;
  };

  const value = payload.arguments?.[name];

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof NwcError) {
    return error.message;
  }

  return error instanceof Error ? error.message : 'NWC operation failed.';
}

function clientFor(ctx: RouteCommandContext, stored: StoredNwcConnection) {
  return new NwcClient({
    transport: ctx.pool,
    connection: parseNwcConnectionUri(stored.connectionUri),
    infoTimeoutMs: 10_000,
    publishTimeoutMs: 5_000,
    replyTimeoutMs: 30_000,
  });
}

function selectConnection(
  ctx: RouteCommandContext,
  selector: string | undefined,
) {
  const connections = listNwcConnections(ctx.seenDb);

  if (connections.length === 0) {
    throw new Error('No NWC connections configured.');
  }

  const selected = selector?.trim();

  if (!selected && connections.length !== 1) {
    throw new Error('Specify a connection ID or label.');
  }

  const stored = getStoredNwcConnection(
    ctx.seenDb,
    selected ?? connections[0]!.id,
  );

  if (!stored) {
    throw new Error('NWC connection not found.');
  }

  return stored;
}

async function verifyConnection(
  ctx: RouteCommandContext,
  stored: StoredNwcConnection,
): Promise<VerifiedConnection> {
  const client = clientFor(ctx, stored);
  const service = await client.getWalletServiceInfo();

  updateNwcConnectionVerification({
    db: ctx.seenDb,
    id: stored.id,
    walletAlias: stored.walletAlias,
    methods: service.methods,
  });

  if (!service.methods.includes('get_info')) {
    return { service, wallet: null };
  }

  const wallet = await client.getInfo();

  updateNwcConnectionVerification({
    db: ctx.seenDb,
    id: stored.id,
    walletAlias: wallet.alias || null,
    methods: service.methods,
  });

  return { service, wallet };
}

function renderList(
  ctx: RouteCommandContext,
  notice: string | null = null,
): WebHandlerResult {
  const connections = listNwcConnections(ctx.seenDb);

  return ctx.source === 'web'
    ? renderNwcListWeb({ connections, notice })
    : renderNwcListText(connections, notice);
}

async function handleSave(ctx: RouteCommandContext): Promise<WebHandlerResult> {
  if (ctx.source !== 'web') {
    return 'NWC connections can only be added through the web UI.';
  }

  const label = webArgument(ctx, 'label');
  const connectionUri = webArgument(ctx, 'connectionUri');

  if (!label || !connectionUri) {
    return renderList(ctx, 'Enter a label and NWC connection URI.');
  }

  let stored: StoredNwcConnection;

  try {
    stored = addNwcConnection({ db: ctx.seenDb, label, connectionUri });
  } catch (error) {
    return renderList(ctx, safeErrorMessage(error));
  }

  try {
    const verified = await verifyConnection(ctx, stored);
    const walletName = verified.wallet?.alias || stored.label;

    return renderList(ctx, `Added and verified ${walletName}.`);
  } catch (error) {
    return renderList(
      ctx,
      `Saved ${stored.label} as unverified. ${safeErrorMessage(error)}`,
    );
  }
}

async function handleInfo(
  ctx: RouteCommandContext,
  selector: string | undefined,
): Promise<WebHandlerResult> {
  const stored = selectConnection(ctx, selector);
  const verified = await verifyConnection(ctx, stored);

  const lines = [
    `Connection: ${stored.label}`,
    `Wallet pubkey: ${verified.service.walletPubkey}`,
    `Relays: ${stored.connection.relayUrls.join(', ')}`,
    `Methods: ${verified.service.methods.join(', ') || 'none advertised'}`,
    `Encryption: ${verified.service.encryptions.join(', ')}`,
    ...(verified.service.extensions.length > 0
      ? [`Extensions: ${verified.service.extensions.join(', ')}`]
      : []),
    ...(verified.wallet
      ? [
          `Alias: ${verified.wallet.alias || 'not provided'}`,
          `Network: ${verified.wallet.network || 'not provided'}`,
          `Block height: ${verified.wallet.blockHeight}`,
        ]
      : []),
  ];

  return ctx.source === 'web'
    ? renderNwcDetailWeb({
        title: 'NWC wallet connected',
        lines,
        tone: 'success',
      })
    : lines.join('\n');
}

async function handleBalance(
  ctx: RouteCommandContext,
  selector: string | undefined,
): Promise<WebHandlerResult> {
  const stored = selectConnection(ctx, selector);
  const client = clientFor(ctx, stored);
  const service = await client.getWalletServiceInfo();

  updateNwcConnectionVerification({
    db: ctx.seenDb,
    id: stored.id,
    walletAlias: stored.walletAlias,
    methods: service.methods,
  });

  const balance = await client.getBalance();
  let display: string;

  try {
    display = `${balance.toSatoshiExact().toString()} sats`;
  } catch {
    display = `${balance.toSatoshiFloor().toString()} sats (${balance.toString()} msats)`;
  }

  const lines = [`Connection: ${stored.label}`, `Balance: ${display}`];

  return ctx.source === 'web'
    ? renderNwcDetailWeb({ title: 'NWC balance', lines, tone: 'info' })
    : lines.join('\n');
}

async function handleRemove(
  ctx: RouteCommandContext,
  selector: string | undefined,
): Promise<WebHandlerResult> {
  const stored = selectConnection(ctx, selector);

  if (!ctx.promptFn) {
    return 'Interactive confirmation is unavailable.';
  }

  const prompt =
    ctx.source === 'web'
      ? createWebPrompt(
          multiChoiceQuestion({
            command: 'nwc',
            subcommand: 'remove',
            question: `Remove NWC connection ${JSON.stringify(stored.label)}?`,
            options: [
              { label: 'Remove', value: 'remove', tone: 'danger' },
              { label: 'Cancel', value: 'cancel', tone: 'muted' },
            ],
          }),
        )
      : `Remove NWC connection ${JSON.stringify(stored.label)}? Reply remove or cancel.`;

  const answer = (await ctx.promptFn(prompt)).trim().toLowerCase();

  if (answer !== 'remove') {
    return renderList(ctx, 'Removal cancelled.');
  }

  removeNwcConnection(ctx.seenDb, stored.id);

  return renderList(ctx, `Removed ${stored.label}.`);
}

async function checkNwcPaymentSettlement(
  ctx: RouteCommandContext,
  invoice: string,
  paymentHash: string,
): Promise<PaymentSettlement> {
  const lookups = await Promise.allSettled(
    listNwcConnections(ctx.seenDb).map(async (connection) => {
      const stored = getStoredNwcConnection(ctx.seenDb, connection.id);

      if (!stored) {
        return false;
      }

      const result = await clientFor(ctx, stored).lookupInvoice({ invoice });

      return (
        result.payment_hash.toLowerCase() === paymentHash &&
        (result.state === 'settled' ||
          result.state === 'accepted' ||
          result.settled_at !== undefined)
      );
    }),
  );

  return lookups.some((lookup) => lookup.status === 'fulfilled' && lookup.value)
    ? { status: 'settled' }
    : { status: 'pending' };
}

function renderPaymentResult(result: InteractivePaymentResult): string {
  switch (result.status) {
    case 'success':
      return 'Lightning payment confirmed.';
    case 'rejected':
      return 'Lightning payment cancelled.';
    case 'unsupported':
      return result.reasons.map((reason) => reason.message).join(' ');
    case 'failed':
      return `Lightning payment failed: ${result.error.message}`;
  }
}

async function handlePay(
  ctx: RouteCommandContext,
  invoice: string | undefined,
): Promise<string> {
  if (!invoice) {
    return `Usage: ${ctx.prefix}nwc pay <bolt11-invoice>`;
  }

  if (listNwcConnections(ctx.seenDb).length === 0) {
    return 'No NWC connections configured.';
  }

  const parsed = parseLightningInvoice(invoice);

  if (!parsed.amount) {
    return 'Amountless BOLT-11 invoices are not supported.';
  }

  const principal = parsed.amount.toSatoshiExact();

  if (principal.isZero()) {
    return 'Lightning invoice amount must be positive.';
  }

  const payments = ctx.interactivePaymentServiceFactory
    ? ctx.interactivePaymentServiceFactory({
        pluginName: 'appweaver-core',
        pluginAlias: 'nwc',
        title: 'NWC Payment',
        iconUrl: null,
        sourcePolicy: 'nwc-only',
      })
    : createUnsupportedInteractivePaymentService();

  const result = await payments.requestPayment({
    purpose: 'Pay Lightning invoice',
    recipient: 'BOLT-11 invoice recipient',
    options: [
      {
        type: 'lightning',
        amount: principal,
        refreshable: false,
        createInvoice: async () => ({
          invoice,
          checkSettlement: () =>
            checkNwcPaymentSettlement(ctx, invoice, parsed.paymentHash),
        }),
      },
    ],
  });

  return renderPaymentResult(result);
}

export const handleNwcRoot: BuiltinHandler = async (ctx) => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? 'list';

  try {
    switch (subcommand) {
      case 'help':
        return renderBuiltinHelpText({
          prefix: ctx.prefix,
          root: 'nwc',
          topic: ctx.args[1]?.toLowerCase() ?? null,
        });
      case 'list':
      case 'add':
        return renderList(ctx);
      case 'save':
        return handleSave(ctx);
      case 'info':
      case 'test':
        return await handleInfo(ctx, ctx.args[1]);
      case 'balance':
        return await handleBalance(ctx, ctx.args[1]);
      case 'pay':
        return await handlePay(ctx, ctx.args[1]);
      case 'rename': {
        const selector =
          webArgument(ctx, 'connection') ?? ctx.args[1]?.trim() ?? '';

        const label = webArgument(ctx, 'label') ?? ctx.args[2]?.trim() ?? '';

        if (!selector || !label) {
          return `Usage: ${ctx.prefix}nwc rename <connection> <new-label>`;
        }

        const renamed = renameNwcConnection(ctx.seenDb, selector, label);

        return renderList(ctx, `Renamed connection to ${renamed.label}.`);
      }

      case 'remove':
      case 'delete':
        return await handleRemove(ctx, ctx.args[1]);
      default:
        return renderList(ctx, `Unknown NWC subcommand: ${subcommand}`);
    }
  } catch (error) {
    const message = safeErrorMessage(error);

    return ctx.source === 'web'
      ? renderNwcDetailWeb({
          title: 'NWC operation failed',
          lines: [message],
          tone: 'danger',
        })
      : `NWC operation failed: ${message}`;
  }
};
