export type SetupStatus = {
  ok: true;
  configured: boolean;
  env: {
    botKey: boolean;
    botPubkey: boolean;
    masterPubkey: boolean;
    relays: boolean;
    cashuMnemonic: boolean;
    webPush: boolean;
  };
  runtime: {
    version: string;
    prefix: string;
    relayCount: number;
    relays: string[];
    botPubkey: string | null;
    masterPubkey: string | null;
  };
};

export type SetMasterPubkeyResponse = {
  ok: true;
  masterPubkey: string;
  status: SetupStatus;
};

export type GenerateBotKeyResponse = {
  ok: true;
  botPubkey: string;
  status: SetupStatus;
};

export type SetRelaysResponse = {
  ok: true;
  relays: string[];
  status: SetupStatus;
};

export function getSetupSecretFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get('secret');
}

function setupApiUrl(path: string, secret: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('secret', secret);

  return url.toString();
}

export async function fetchSetupStatus(secret: string): Promise<SetupStatus> {
  const res = await fetch(setupApiUrl('/api/setup/status', secret), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`setup_status_failed:${res.status}`);
  }

  return (await res.json()) as SetupStatus;
}

export async function setSetupMasterPubkey(
  secret: string,
  pubkey: string,
): Promise<SetMasterPubkeyResponse> {
  const res = await fetch(setupApiUrl('/api/setup/master-pubkey', secret), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pubkey }),
  });

  if (!res.ok) {
    throw new Error(`setup_master_pubkey_failed:${res.status}`);
  }

  return (await res.json()) as SetMasterPubkeyResponse;
}

export async function generateSetupBotKey(
  secret: string,
): Promise<GenerateBotKeyResponse> {
  const res = await fetch(setupApiUrl('/api/setup/bot-key', secret), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`setup_bot_key_failed:${res.status}`);
  }

  return (await res.json()) as GenerateBotKeyResponse;
}

export async function setSetupRelays(
  secret: string,
  relays: string[],
): Promise<SetRelaysResponse> {
  const res = await fetch(setupApiUrl('/api/setup/relays', secret), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ relays }),
  });

  if (!res.ok) {
    throw new Error(`setup_relays_failed:${res.status}`);
  }

  return (await res.json()) as SetRelaysResponse;
}
