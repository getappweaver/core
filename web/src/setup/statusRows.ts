import type { SetupDependencyStatus, SetupStatus } from './transport';

export type StatusRowProps = {
  label: string;
  ok: boolean;
  detail: string;
};

export function setupRows(status: SetupStatus): StatusRowProps[] {
  return [
    {
      label: 'Bot key',
      ok: status.env.botKey,
      detail: status.env.botKey ? 'configured' : 'missing',
    },
    {
      label: 'Master pubkey',
      ok: status.env.masterPubkey,
      detail: status.env.masterPubkey ? 'configured' : 'missing',
    },
    {
      label: 'Relays',
      ok: status.env.relays,
      detail: status.env.relays
        ? `${status.runtime.relayCount} configured`
        : 'missing',
    },
    {
      label: 'Cashu wallet',
      ok: status.env.cashuMnemonic,
      detail: status.env.cashuMnemonic ? 'configured' : 'optional',
    },
    {
      label: 'Web push',
      ok: status.env.webPush,
      detail: status.env.webPush ? 'configured' : 'optional',
    },
    {
      label: 'Cursor API key',
      ok: status.env.cursorApiKey,
      detail: status.env.cursorApiKey ? 'configured' : 'optional',
    },
  ];
}

export function dependencyDetail(dependency: SetupDependencyStatus): string {
  if (dependency.installed) {
    return dependency.path ?? 'found';
  }

  return dependency.required ? 'missing' : 'optional';
}
