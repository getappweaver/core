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
    cursorApiKey: boolean;
    piperBinaryPath: boolean;
    piperModelPath: boolean;
    piperLibraryPath: boolean;
    piperServiceEnabled: boolean;
  };
  defaults: SetupDefaults;
  runtime: {
    version: string;
    setupMode: boolean;
    prefix: string;
    relayCount: number;
    relays: string[];
    botPubkey: string | null;
    masterPubkey: string | null;
  };
  piper: {
    binaryPath: string;
    binaryExists: boolean;
    modelPath: string;
    modelExists: boolean;
    libraryPath: string;
    serviceEnabled: boolean;
  };
  dependencies: SetupDependencyStatus[];
};

export type SetupDependencyStatus = {
  name: string;
  command: string;
  installed: boolean;
  path: string | null;
  required: boolean;
  installHint: string;
  installUrl: string | null;
  installCommand: string | null;
};

export type SetupDefaults = {
  prefix: string;
  backend: string;
  provider: string;
  mode: string;
  workspace: string;
  linting: string;
  readyNotification: boolean;
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

export type SetDefaultsResponse = {
  ok: true;
  defaults: SetupDefaults;
  parentWorkspaceInstall: ParentWorkspaceInstallResult | null;
  status: SetupStatus;
};

export type SetCursorApiKeyResponse = {
  ok: true;
  saved: true;
  status: SetupStatus;
};

export type GenerateCashuMnemonicResponse = {
  ok: true;
  mnemonic: string;
};

export type SetCashuWalletResponse = {
  ok: true;
  defaultMintUrl: string;
  saved: true;
  status: SetupStatus;
};

export type SetProviderApiKeyResponse = {
  ok: true;
  envNames: string[];
  saved: true;
};

export type ParentWorkspaceInstallResult = {
  parentRoot: string;
  symlinks: {
    installed: string[];
    kept: string[];
    conflicts: string[];
    missingSources: string[];
  };
  agentTemplates: {
    copied: string[];
    kept: string[];
  };
  gitignore: {
    added: string[];
    kept: string[];
  };
};

export type SetupWebPushResponse = {
  ok: true;
  publicKey: string;
  subject: string;
  status: SetupStatus;
};

export type SetPiperConfigResponse = {
  ok: true;
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
  serviceEnabled: boolean;
  status: SetupStatus;
};

type SetPiperConfigProps = {
  token: string;
  binaryPath: string;
  modelPath: string;
  libraryPath: string;
  serviceEnabled: boolean;
};

export type DownloadPiperModelResponse = {
  ok: true;
  modelPath: string;
  configPath: string;
  status: SetupStatus;
};

export type RestartSetupResponse = {
  ok: true;
  status: SetupStatus;
};

export type OpenCodeAuthMethod = {
  type: string;
  label: string;
  prompts: unknown[];
};

export type OpenCodeAuthProvider = {
  id: string;
  name: string;
  source: string;
  env: string[];
  configured: boolean;
  authMethods: OpenCodeAuthMethod[];
};

export type OpenCodeAuthStatus = {
  ok: true;
  providers: OpenCodeAuthProvider[];
};

export type OpenCodeAuthStatusResult =
  | OpenCodeAuthStatus
  | {
      ok: false;
      error: string;
      status: number | null;
    };

export type OpenCodeAuthorizeResponse = {
  ok: true;
  providerID: string;
  methodIndex: number;
  url: string | null;
  code: string | null;
  method: string | null;
  instructions: string | null;
};

export type SetupSessionResponse = {
  ok: true;
  token: string;
};

const SETUP_TOKEN_KEY = 'appweaver.setup.token';
const OPENCODE_AUTH_STATUS_TIMEOUT_MS = 45_000;

export function getSetupSecretFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get('secret');
}

function removeSetupSecretFromUrl(): void {
  const url = new URL(window.location.href);

  if (!url.searchParams.has('secret')) {
    return;
  }

  url.searchParams.delete('secret');
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

function setupApiUrl(path: string, secret: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('secret', secret);

  return url.toString();
}

function setupAuthHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function initializeSetupSession(): Promise<string | null> {
  const stored = window.sessionStorage.getItem(SETUP_TOKEN_KEY);

  if (stored) {
    removeSetupSecretFromUrl();

    return stored;
  }

  const secret = getSetupSecretFromUrl();

  if (!secret) {
    return null;
  }

  const res = await fetch(setupApiUrl('/api/setup/session', secret), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`setup_session_failed:${res.status}`);
  }

  const body = (await res.json()) as SetupSessionResponse;
  window.sessionStorage.setItem(SETUP_TOKEN_KEY, body.token);
  removeSetupSecretFromUrl();

  return body.token;
}

export async function fetchSetupStatus(token: string): Promise<SetupStatus> {
  const res = await fetch('/api/setup/status', {
    headers: setupAuthHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`setup_status_failed:${res.status}`);
  }

  return (await res.json()) as SetupStatus;
}

export async function setSetupMasterPubkey(
  token: string,
  pubkey: string,
): Promise<SetMasterPubkeyResponse> {
  const res = await fetch('/api/setup/master-pubkey', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(token),
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
  token: string,
): Promise<GenerateBotKeyResponse> {
  const res = await fetch('/api/setup/bot-key', {
    method: 'POST',
    headers: setupAuthHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`setup_bot_key_failed:${res.status}`);
  }

  return (await res.json()) as GenerateBotKeyResponse;
}

export async function setSetupRelays(
  token: string,
  relays: string[],
): Promise<SetRelaysResponse> {
  const res = await fetch('/api/setup/relays', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ relays }),
  });

  if (!res.ok) {
    throw new Error(`setup_relays_failed:${res.status}`);
  }

  return (await res.json()) as SetRelaysResponse;
}

export async function setCursorApiKey(
  token: string,
  apiKey: string,
): Promise<SetCursorApiKeyResponse> {
  const res = await fetch('/api/setup/cursor-api-key', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!res.ok) {
    throw new Error(`setup_cursor_api_key_failed:${res.status}`);
  }

  return (await res.json()) as SetCursorApiKeyResponse;
}

export async function generateCashuMnemonic(
  token: string,
): Promise<GenerateCashuMnemonicResponse> {
  const res = await fetch('/api/setup/cashu/mnemonic', {
    method: 'POST',
    headers: setupAuthHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`setup_cashu_mnemonic_failed:${res.status}`);
  }

  return (await res.json()) as GenerateCashuMnemonicResponse;
}

export async function setCashuWallet(props: {
  token: string;
  mnemonic: string;
  defaultMintUrl: string;
}): Promise<SetCashuWalletResponse> {
  const res = await fetch('/api/setup/cashu', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(props.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mnemonic: props.mnemonic,
      defaultMintUrl: props.defaultMintUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(`setup_cashu_wallet_failed:${res.status}`);
  }

  return (await res.json()) as SetCashuWalletResponse;
}

export async function setProviderApiKey(props: {
  token: string;
  values: Record<string, string>;
}): Promise<SetProviderApiKeyResponse> {
  const res = await fetch('/api/setup/provider-api-key', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(props.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: props.values }),
  });

  if (!res.ok) {
    throw new Error(`setup_provider_api_key_failed:${res.status}`);
  }

  return (await res.json()) as SetProviderApiKeyResponse;
}

export async function setupWebPush(
  token: string,
  subject: string,
  generateNewKeys: boolean,
): Promise<SetupWebPushResponse> {
  const res = await fetch('/api/setup/web-push', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, generateNewKeys }),
  });

  if (!res.ok) {
    throw new Error(`setup_web_push_failed:${res.status}`);
  }

  return (await res.json()) as SetupWebPushResponse;
}

export async function setPiperConfig(
  props: SetPiperConfigProps,
): Promise<SetPiperConfigResponse> {
  const res = await fetch('/api/setup/piper', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(props.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      binaryPath: props.binaryPath,
      modelPath: props.modelPath,
      libraryPath: props.libraryPath,
      serviceEnabled: props.serviceEnabled,
    }),
  });

  if (!res.ok) {
    throw new Error(`setup_piper_failed:${res.status}`);
  }

  return (await res.json()) as SetPiperConfigResponse;
}

export async function downloadPiperModel(
  token: string,
): Promise<DownloadPiperModelResponse> {
  const res = await fetch('/api/setup/piper/model', {
    method: 'POST',
    headers: setupAuthHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`setup_piper_model_failed:${res.status}`);
  }

  return (await res.json()) as DownloadPiperModelResponse;
}

export async function setSetupDefaults(
  token: string,
  defaults: SetupDefaults,
): Promise<SetDefaultsResponse> {
  const res = await fetch('/api/setup/defaults', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(defaults),
  });

  if (!res.ok) {
    throw new Error(`setup_defaults_failed:${res.status}`);
  }

  return (await res.json()) as SetDefaultsResponse;
}

export async function restartSetupApp(
  token: string,
): Promise<RestartSetupResponse> {
  const res = await fetch('/api/setup/restart', {
    method: 'POST',
    headers: setupAuthHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`setup_restart_failed:${res.status}`);
  }

  return (await res.json()) as RestartSetupResponse;
}

export async function fetchOpenCodeAuthStatus(
  token: string,
): Promise<OpenCodeAuthStatusResult> {
  try {
    const res = await fetch('/api/setup/opencode/auth', {
      headers: setupAuthHeaders(token),
      signal: AbortSignal.timeout(OPENCODE_AUTH_STATUS_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `opencode_auth_status_failed:${res.status}`,
        status: res.status,
      };
    }

    return (await res.json()) as OpenCodeAuthStatus;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status: null,
    };
  }
}

export async function authorizeOpenCodeProvider(props: {
  token: string;
  providerID: string;
  methodIndex: number;
}): Promise<OpenCodeAuthorizeResponse> {
  const res = await fetch('/api/setup/opencode/authorize', {
    method: 'POST',
    headers: {
      ...setupAuthHeaders(props.token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerID: props.providerID,
      methodIndex: props.methodIndex,
    }),
  });

  if (!res.ok) {
    throw new Error(`opencode_authorize_failed:${res.status}`);
  }

  return (await res.json()) as OpenCodeAuthorizeResponse;
}
