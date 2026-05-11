import type { JSX } from 'solid-js';
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';

import { HeaderChrome } from '../chrome/HeaderChrome';
import { ConnectOverlays } from '../connect/ConnectOverlays';
import { useConnect } from '../connect/useConnect';
import { useNostrAuth } from '../contexts/NostrAuthContext';

import {
  authorizeOpenCodeProvider,
  fetchOpenCodeAuthStatus,
  fetchSetupStatus,
  generateSetupBotKey,
  initializeSetupSession,
  restartSetupApp,
  setCursorApiKey,
  setProviderApiKey,
  setSetupDefaults,
  setSetupMasterPubkey,
  setSetupRelays,
  setupWebPush,
  type OpenCodeAuthProvider,
  type OpenCodeAuthorizeResponse,
  type ParentWorkspaceInstallResult,
  type SetupDefaults,
  type SetupStatus,
  type SetupWebPushResponse,
} from './transport';

type StatusRowProps = {
  label: string;
  ok: boolean;
  detail: string;
};

function StatusRow(props: StatusRowProps): JSX.Element {
  return (
    <li class="setup-status-row">
      <span
        class="setup-status-dot"
        classList={{ 'is-ok': props.ok, 'is-missing': !props.ok }}
        aria-hidden="true"
      />
      <span class="setup-status-label">{props.label}</span>
      <span class="setup-status-detail">{props.detail}</span>
    </li>
  );
}

function setupRows(status: SetupStatus): StatusRowProps[] {
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

function SetupStatusCard(props: { status: SetupStatus }): JSX.Element {
  const status = () => props.status;

  return (
    <section class="card setup-card" aria-labelledby="setup-title">
      <div class="setup-card-head">
        <div>
          <h1 id="setup-title">Configuration Status</h1>
        </div>
        <span class="setup-badge" classList={{ 'is-ok': status().configured }}>
          {status().configured ? 'ready' : 'needs setup'}
        </span>
      </div>

      <p class="setup-copy">
        This setup screen is protected by the boot secret printed in the server
        logs. The secret changes on restart unless SETUP_SECRET is set.
      </p>

      <dl class="setup-runtime-grid">
        <div>
          <dt>Version</dt>
          <dd>{status().runtime.version}</dd>
        </div>
        <div>
          <dt>Command prefix</dt>
          <dd>{status().runtime.prefix}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{status().defaults.backend}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{status().defaults.provider}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{status().defaults.mode}</dd>
        </div>
        <div>
          <dt>Bot pubkey</dt>
          <dd>{status().runtime.botPubkey ?? 'not available'}</dd>
        </div>
      </dl>

      <ul class="setup-status-list">
        <For each={setupRows(status())}>{(row) => <StatusRow {...row} />}</For>
      </ul>
    </section>
  );
}

type SetupCompletionCardProps = {
  status: SetupStatus;
  token: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForRestartThenOpenApp(): Promise<void> {
  await sleep(800);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        window.location.assign('/');

        return;
      }
    } catch {
      // The server is expected to disappear briefly while restarting.
    }

    await sleep(500);
  }

  throw new Error('restart_poll_timeout');
}

function SetupCompletionCard(props: SetupCompletionCardProps): JSX.Element {
  const [restartState, setRestartState] = createSignal<
    'idle' | 'requested' | 'failed'
  >('idle');

  const [restartError, setRestartError] = createSignal<string | null>(null);

  async function restartAndOpen(): Promise<void> {
    setRestartState('requested');
    setRestartError(null);

    try {
      await restartSetupApp(props.token);
      await waitForRestartThenOpenApp();
    } catch (err) {
      setRestartState('failed');
      setRestartError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Show when={props.status.configured}>
      <section class="card setup-card setup-card--complete">
        <div class="setup-card-head">
          <div>
            <h1>Restart into AppWeaver</h1>
          </div>
          <span class="setup-badge is-ok">ready</span>
        </div>
        <p class="setup-copy">
          Required configuration is saved. Restart AppWeaver so it can leave
          setup-only mode, connect to relays, and load the full web interface.
        </p>
        <div class="setup-step-actions">
          <button
            type="button"
            class="web-button"
            disabled={restartState() === 'requested'}
            onClick={() => void restartAndOpen()}
          >
            {restartState() === 'requested'
              ? 'Restarting...'
              : 'Restart and open app'}
          </button>
          <Show when={restartState() === 'requested'}>
            <span class="setup-inline-code">waiting for /api/health</span>
          </Show>
        </div>
        <p class="setup-warning-line">
          If this process was started without a restart watcher, restart the
          container or process manually, then open <code>/</code>.
        </p>
        <Show when={restartError()}>
          {(error) => <p class="setup-error-line">{error()}</p>}
        </Show>
      </section>
    </Show>
  );
}

type OpenCodeAuthCardProps = {
  token: string;
  status: SetupStatus;
};

const SETUP_OPENCODE_PROVIDER_STORAGE_KEY = 'appweaver.setup.opencode.provider';

function getStoredProviderID(): string {
  return window.localStorage.getItem(SETUP_OPENCODE_PROVIDER_STORAGE_KEY) ?? '';
}

function preferredProvider(providers: OpenCodeAuthProvider[]): string {
  return providers.find((provider) => provider.id === 'opencode')
    ? 'opencode'
    : (providers[0]?.id ?? '');
}

function storedPreferredProvider(providers: OpenCodeAuthProvider[]): string {
  const stored = getStoredProviderID();

  if (stored && providers.some((provider) => provider.id === stored)) {
    return stored;
  }

  return preferredProvider(providers);
}

function providerIsConfigured(
  status: { providers: OpenCodeAuthProvider[] } | undefined,
  providerID: string,
): boolean {
  return Boolean(
    providerID &&
    status?.providers.find((provider) => provider.id === providerID)
      ?.configured,
  );
}

function OpenCodeAuthCard(props: OpenCodeAuthCardProps): JSX.Element {
  const [authStatus, { refetch }] = createResource(
    () => props.token,
    fetchOpenCodeAuthStatus,
  );

  const [selectedProviderID, setSelectedProviderID] = createSignal(
    getStoredProviderID(),
  );

  const [selectedMethodIndex, setSelectedMethodIndex] = createSignal(0);
  const [authorizing, setAuthorizing] = createSignal(false);
  const [envValues, setEnvValues] = createSignal<Record<string, string>>({});
  const [savingApiKey, setSavingApiKey] = createSignal(false);
  const [pollingAuth, setPollingAuth] = createSignal(false);

  const [authorizeResult, setAuthorizeResult] =
    createSignal<OpenCodeAuthorizeResponse | null>(null);

  const [authorizeError, setAuthorizeError] = createSignal<string | null>(null);
  const [apiKeyError, setApiKeyError] = createSignal<string | null>(null);
  const [apiKeySaved, setApiKeySaved] = createSignal<string[] | null>(null);
  let providerSelect: HTMLSelectElement | undefined;
  let stopAuthPolling: (() => void) | null = null;

  onCleanup(() => stopAuthPolling?.());

  createEffect(() => {
    const providers = authStatus()?.providers ?? [];
    const selected = selectedProviderID();

    if (providers.length === 0) {
      return;
    }

    if (selected && providers.some((provider) => provider.id === selected)) {
      return;
    }

    setSelectedProviderID(storedPreferredProvider(providers));
    setSelectedMethodIndex(0);
  });

  createEffect(() => {
    const selected = selectedProviderID();

    if (selected) {
      window.localStorage.setItem(
        SETUP_OPENCODE_PROVIDER_STORAGE_KEY,
        selected,
      );

      if (providerSelect && providerSelect.value !== selected) {
        providerSelect.value = selected;
      }
    }
  });

  const selectedProvider = () =>
    authStatus()?.providers.find(
      (provider) => provider.id === selectedProviderID(),
    ) ?? null;

  const selectedProviderConfigured = () =>
    Boolean(selectedProvider()?.configured);

  const selectedAuthMethod = () => {
    const provider = selectedProvider();

    return provider?.authMethods[selectedMethodIndex()] ?? null;
  };

  const selectedMethodIsApiKey = () => {
    const method = selectedAuthMethod();

    return method?.type === 'api';
  };

  const selectedMethodCanStartAuth = () => {
    const method = selectedAuthMethod();

    return Boolean(method && method.type !== 'api');
  };

  const shouldShowEnvInputs = () => {
    const provider = selectedProvider();

    return Boolean(
      provider &&
      provider.env.length > 0 &&
      (provider.authMethods.length === 0 || selectedMethodIsApiKey()),
    );
  };

  const selectedEnvNames = () => selectedProvider()?.env ?? [];

  const hasEnteredEnvValue = () =>
    selectedEnvNames().some(
      (envName) => (envValues()[envName]?.trim() ?? '').length > 0,
    );

  createEffect(() => {
    const provider = selectedProvider();

    if (!provider) {
      return;
    }

    if (selectedMethodIndex() >= provider.authMethods.length) {
      setSelectedMethodIndex(0);
    }
  });

  function setEnvValue(envName: string, value: string): void {
    setEnvValues((current) => ({ ...current, [envName]: value }));
  }

  async function waitForProviderAuth(providerID: string): Promise<void> {
    stopAuthPolling?.();

    let stopped = false;
    let checking = false;

    stopAuthPolling = () => {
      stopped = true;
      window.removeEventListener('focus', checkSoon);
      document.removeEventListener('visibilitychange', checkSoon);
    };

    async function checkNow(): Promise<boolean> {
      if (stopped || checking) {
        return false;
      }

      checking = true;

      try {
        const nextStatus = await refetch();

        if (providerIsConfigured(nextStatus, providerID)) {
          stopAuthPolling?.();
          stopAuthPolling = null;

          return true;
        }
      } finally {
        checking = false;
      }

      return false;
    }

    function checkSoon(): void {
      if (document.visibilityState === 'hidden') {
        return;
      }

      void checkNow();
    }

    setPollingAuth(true);
    window.addEventListener('focus', checkSoon);
    document.addEventListener('visibilitychange', checkSoon);

    try {
      for (let attempt = 0; attempt < 90 && !stopped; attempt += 1) {
        if (await checkNow()) {
          break;
        }

        await sleep(2000);
      }
    } finally {
      stopAuthPolling?.();
      stopAuthPolling = null;
      setPollingAuth(false);
    }
  }

  async function startAuth(): Promise<void> {
    const provider = selectedProvider();

    if (!provider || !selectedMethodCanStartAuth()) {
      return;
    }

    setAuthorizing(true);
    setAuthorizeError(null);
    setAuthorizeResult(null);

    try {
      const result = await authorizeOpenCodeProvider({
        token: props.token,
        providerID: provider.id,
        methodIndex: selectedMethodIndex(),
      });

      setAuthorizeResult(result);

      if (result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        void waitForProviderAuth(provider.id);
      }
    } catch (err) {
      setAuthorizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthorizing(false);
    }
  }

  async function saveProviderApiKey(): Promise<void> {
    const provider = selectedProvider();

    if (!provider || provider.env.length === 0) {
      return;
    }

    setSavingApiKey(true);
    setApiKeyError(null);
    setApiKeySaved(null);

    try {
      const result = await setProviderApiKey({
        token: props.token,
        values: Object.fromEntries(
          provider.env.map((envName) => [envName, envValues()[envName] ?? '']),
        ),
      });

      setEnvValues((current) => {
        const next = { ...current };

        for (const envName of result.envNames) {
          next[envName] = '';
        }

        return next;
      });

      setApiKeySaved(result.envNames);
      void refetch();
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingApiKey(false);
    }
  }

  return (
    <section class="card setup-card setup-card--opencode">
      <div class="setup-card-head">
        <div>
          <h1>OpenCode Backend Configuration</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.defaults.backend === 'opencode' }}
        >
          {props.status.defaults.backend === 'opencode' ? 'active' : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        AppWeaver starts the local OpenCode SDK server and asks it for supported
        auth methods and environment variables. Use OAuth when available, or
        paste provider API keys to write them into <code>.env</code>.
      </p>

      <Switch>
        <Match when={authStatus()}>
          {(loaded) => (
            <>
              <div class="setup-defaults-grid">
                <label class="field-block">
                  <span class="field-label">Provider</span>
                  <select
                    ref={providerSelect}
                    value={selectedProviderID()}
                    onChange={(event) => {
                      setSelectedProviderID(event.currentTarget.value);

                      window.localStorage.setItem(
                        SETUP_OPENCODE_PROVIDER_STORAGE_KEY,
                        event.currentTarget.value,
                      );

                      setSelectedMethodIndex(0);
                      setAuthorizeResult(null);
                    }}
                  >
                    <For each={loaded().providers}>
                      {(provider) => (
                        <option value={provider.id}>{provider.name}</option>
                      )}
                    </For>
                  </select>
                  <small>
                    OpenCode Zen is usually ready by default. OpenAI, GitHub
                    Copilot, Google, and similar providers may offer OAuth.
                  </small>
                </label>

                <Show when={selectedProvider()}>
                  {(provider) => (
                    <>
                      <Show when={provider().authMethods.length > 0}>
                        <label class="field-block">
                          <span class="field-label">Login method</span>
                          <select
                            value={String(selectedMethodIndex())}
                            onChange={(event) =>
                              setSelectedMethodIndex(
                                Number(event.currentTarget.value),
                              )
                            }
                          >
                            <For each={provider().authMethods}>
                              {(method, index) => (
                                <option value={String(index())}>
                                  {method.label}
                                </option>
                              )}
                            </For>
                          </select>
                        </label>
                      </Show>
                      <Show when={shouldShowEnvInputs()}>
                        <For each={provider().env}>
                          {(envName) => (
                            <label class="field-block">
                              <span class="field-label">{envName}</span>
                              <input
                                type={
                                  envName.includes('REGION')
                                    ? 'text'
                                    : 'password'
                                }
                                value={envValues()[envName] ?? ''}
                                autocomplete="off"
                                placeholder={`Enter ${envName}`}
                                onInput={(event) =>
                                  setEnvValue(
                                    envName,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                              <small>
                                Writes <code>{envName}</code> to{' '}
                                <code>.env</code>.
                              </small>
                            </label>
                          )}
                        </For>
                      </Show>
                      <Show
                        when={
                          provider().authMethods.length === 0 ||
                          selectedMethodIsApiKey()
                        }
                      >
                        <p class="setup-warning-line">
                          This provider uses environment-based credentials in
                          this setup flow. Fill the fields above and save them
                          to <code>.env</code>.
                        </p>
                      </Show>
                    </>
                  )}
                </Show>
              </div>

              <div class="setup-step-actions">
                <Show when={selectedMethodCanStartAuth()}>
                  <button
                    type="button"
                    class="web-button"
                    disabled={authorizing() || !selectedProvider()}
                    onClick={() => void startAuth()}
                  >
                    {authorizing() ? 'Starting auth...' : 'Start auth'}
                  </button>
                </Show>
                <Show when={shouldShowEnvInputs()}>
                  <button
                    type="button"
                    class="web-button"
                    disabled={
                      savingApiKey() ||
                      selectedEnvNames().length === 0 ||
                      !hasEnteredEnvValue()
                    }
                    onClick={() => void saveProviderApiKey()}
                  >
                    {savingApiKey() ? 'Saving key...' : 'Save API key'}
                  </button>
                </Show>
                <span class="setup-inline-code">
                  {loaded().providers.length} provider(s)
                </span>
              </div>

              <Show when={selectedProvider()}>
                {(provider) => (
                  <div
                    class="setup-step setup-auth-step"
                    classList={{ 'is-ok': selectedProviderConfigured() }}
                  >
                    <span class="setup-step-marker">✓</span>
                    <div class="setup-step-body">
                      <h2>{provider().name} auth</h2>
                      <p>
                        {selectedProviderConfigured()
                          ? 'OpenCode reports stored credentials for this provider.'
                          : pollingAuth()
                            ? 'Waiting for the provider callback to complete...'
                            : 'Start auth, complete the provider login, then this will turn green when OpenCode reports stored credentials.'}
                      </p>
                    </div>
                  </div>
                )}
              </Show>

              <Show when={authorizeResult()}>
                {(result) => (
                  <div class="setup-auth-result">
                    <Show when={result().url}>
                      {(url) => (
                        <p>
                          Auth URL:{' '}
                          <a href={url()} target="_blank" rel="noreferrer">
                            open provider login
                          </a>
                        </p>
                      )}
                    </Show>
                    <Show when={result().instructions}>
                      {(instructions) => <p>{instructions()}</p>}
                    </Show>
                    <p class="setup-copy">
                      Complete the provider flow, then click Refresh. If a
                      browser window did not open, use the link above.
                    </p>
                  </div>
                )}
              </Show>
              <Show when={authorizeError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
              <Show when={apiKeySaved()}>
                {(envNames) => (
                  <p class="setup-inline-code">
                    Saved {envNames().join(', ')} to .env
                  </p>
                )}
              </Show>
              <Show when={apiKeyError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </>
          )}
        </Match>
        <Match when={authStatus.loading}>
          <p class="setup-copy">Starting local OpenCode server...</p>
        </Match>
        <Match when={authStatus.error}>
          <p class="setup-error-line">{String(authStatus.error)}</p>
        </Match>
      </Switch>
    </section>
  );
}

type CursorSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

function CursorSetupCard(props: CursorSetupCardProps): JSX.Element {
  const [apiKey, setApiKey] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function saveApiKey(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await setCursorApiKey(props.token, apiKey());
      setApiKey('');
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card setup-card setup-card--cursor">
      <div class="setup-card-head">
        <div>
          <h1>Add Cursor API key</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.env.cursorApiKey }}
        >
          {props.status.env.cursorApiKey ? 'saved' : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        If you choose the Cursor backend, create a cloud agents API key in
        Cursor, then paste it here. AppWeaver stores it as{' '}
        <code>CURSOR_API_KEY</code> in <code>.env</code>.
      </p>
      <div class="setup-step-actions">
        <a
          class="setup-text-link"
          href="https://cursor.com/dashboard/integrations#user-api-keys"
          target="_blank"
          rel="noreferrer"
        >
          Create Cursor API key
        </a>
      </div>
      <label class="field-block setup-relay-field">
        <span class="field-label">Cursor API key</span>
        <input
          type="password"
          value={apiKey()}
          autocomplete="off"
          placeholder="Paste Cursor API key"
          onInput={(event) => setApiKey(event.currentTarget.value)}
        />
        <small>The key is written to your mounted AppWeaver .env file.</small>
      </label>
      <div class="setup-step-actions">
        <button
          type="button"
          class="web-button"
          disabled={saving() || apiKey().trim().length === 0}
          onClick={() => void saveApiKey()}
        >
          {saving() ? 'Saving...' : 'Save Cursor key'}
        </button>
      </div>
      <div
        class="setup-step setup-auth-step"
        classList={{ 'is-ok': props.status.env.cursorApiKey }}
      >
        <span class="setup-step-marker">✓</span>
        <div class="setup-step-body">
          <h2>Cursor API key</h2>
          <p>
            {props.status.env.cursorApiKey
              ? 'CURSOR_API_KEY is saved in .env.'
              : 'Optional. Save a Cursor API key here only if you plan to use the Cursor backend.'}
          </p>
        </div>
      </div>
      <Show when={error()}>
        {(message) => <p class="setup-error-line">{message()}</p>}
      </Show>
    </section>
  );
}

type WebPushSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

function WebPushSetupCard(props: WebPushSetupCardProps): JSX.Element {
  const [subject, setSubject] = createSignal('mailto:operator@example.com');

  const [generateNewKeys, setGenerateNewKeys] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [result, setResult] = createSignal<SetupWebPushResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const next = await setupWebPush(
        props.token,
        subject(),
        generateNewKeys(),
      );

      setResult(next);
      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card setup-card setup-card--web-push">
      <div class="setup-card-head">
        <div>
          <h1>Browser notifications</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.env.webPush }}
        >
          {props.status.env.webPush ? 'configured' : 'optional'}
        </span>
      </div>
      <p class="setup-copy">
        Generate VAPID keys for PWA/browser notifications. After restart, open
        the main web UI and enable Push from the header to subscribe this
        browser.
      </p>
      <label class="field-block setup-relay-field">
        <span class="field-label">VAPID subject</span>
        <input
          type="text"
          value={subject()}
          placeholder="mailto:you@example.com"
          onInput={(event) => setSubject(event.currentTarget.value)}
        />
        <small>Use mailto:you@example.com or an https:// URL.</small>
      </label>
      <label class="field-block setup-checkbox-field">
        <span class="setup-checkbox-row">
          <input
            type="checkbox"
            checked={generateNewKeys()}
            onChange={(event) =>
              setGenerateNewKeys(event.currentTarget.checked)
            }
          />
          Generate a new VAPID key pair
        </span>
        <small>
          Leave enabled for first setup. Existing browsers must re-enable Push
          if keys are regenerated.
        </small>
      </label>
      <div class="setup-step-actions">
        <button
          type="button"
          class="web-button"
          disabled={saving() || subject().trim().length === 0}
          onClick={() => void save()}
        >
          {saving() ? 'Saving...' : 'Save Web Push config'}
        </button>
      </div>
      <Show when={result()}>
        {(saved) => (
          <p class="setup-inline-code">
            Saved {saved().subject} / {saved().publicKey.slice(0, 14)}...
          </p>
        )}
      </Show>
      <Show when={error()}>
        {(message) => <p class="setup-error-line">{message()}</p>}
      </Show>
    </section>
  );
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 10)}...${pubkey.slice(-8)}`;
}

type SetupTimelineProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

function SetupTimeline(props: SetupTimelineProps): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  const initialRelays = () =>
    props.status.runtime.relays.length > 0
      ? props.status.runtime.relays.join('\n')
      : 'wss://relay.primal.net\nwss://relay.damus.io';

  const [savingMaster, setSavingMaster] = createSignal(false);
  const [generatingBotKey, setGeneratingBotKey] = createSignal(false);
  const [savingRelays, setSavingRelays] = createSignal(false);
  const [savingDefaults, setSavingDefaults] = createSignal(false);
  const [relayText, setRelayText] = createSignal(initialRelays());
  const [prefix, setPrefix] = createSignal(props.status.runtime.prefix);
  const [backend, setBackend] = createSignal(props.status.defaults.backend);
  const [provider, setProvider] = createSignal(props.status.defaults.provider);
  const [mode, setMode] = createSignal(props.status.defaults.mode);

  const [workspace, setWorkspace] = createSignal(
    props.status.defaults.workspace,
  );

  const [linting, setLinting] = createSignal(props.status.defaults.linting);

  const [readyNotification, setReadyNotification] = createSignal(
    props.status.defaults.readyNotification,
  );

  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [botKeyError, setBotKeyError] = createSignal<string | null>(null);
  const [relayError, setRelayError] = createSignal<string | null>(null);
  const [defaultsError, setDefaultsError] = createSignal<string | null>(null);

  const [defaultsInstallResult, setDefaultsInstallResult] =
    createSignal<ParentWorkspaceInstallResult | null>(null);

  createEffect(() => {
    setPrefix(props.status.runtime.prefix);
    setBackend(props.status.defaults.backend);
    setProvider(props.status.defaults.provider);
    setMode(props.status.defaults.mode);
    setWorkspace(props.status.defaults.workspace);
    setLinting(props.status.defaults.linting);
    setReadyNotification(props.status.defaults.readyNotification);
  });

  const connectedPubkey = () => {
    const state = auth.authState();

    return state.status === 'connected' ? state.pubkey : null;
  };

  const masterMatches = () => {
    const connected = connectedPubkey();
    const configured = props.status.runtime.masterPubkey;

    return Boolean(
      connected && configured && connected.toLowerCase() === configured,
    );
  };

  async function saveConnectedMaster(): Promise<void> {
    const pubkey = connectedPubkey();

    if (!pubkey) {
      connect.handleConnectMenuClick();

      return;
    }

    setSavingMaster(true);
    setSaveError(null);

    try {
      await setSetupMasterPubkey(props.token, pubkey);
      props.onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingMaster(false);
    }
  }

  async function generateBotKey(): Promise<void> {
    setGeneratingBotKey(true);
    setBotKeyError(null);

    try {
      await generateSetupBotKey(props.token);
      props.onSaved();
    } catch (err) {
      setBotKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingBotKey(false);
    }
  }

  async function saveRelays(): Promise<void> {
    const relays = relayText()
      .split(/[\n,]/)
      .map((relay) => relay.trim())
      .filter(Boolean);

    setSavingRelays(true);
    setRelayError(null);

    try {
      const result = await setSetupRelays(props.token, relays);

      setRelayText(result.relays.join('\n'));
      props.onSaved();
    } catch (err) {
      setRelayError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRelays(false);
    }
  }

  async function saveDefaults(): Promise<void> {
    const defaults: SetupDefaults = {
      prefix: prefix(),
      backend: backend(),
      provider: provider(),
      mode: mode(),
      workspace: workspace(),
      linting: linting(),
      readyNotification: readyNotification(),
    };

    setSavingDefaults(true);
    setDefaultsError(null);
    setDefaultsInstallResult(null);

    try {
      const result = await setSetupDefaults(props.token, defaults);

      setDefaultsInstallResult(result.parentWorkspaceInstall);
      props.onSaved();
    } catch (err) {
      setDefaultsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <>
      <section class="card setup-card setup-card--timeline">
        <div class="setup-card-head">
          <div>
            <h1>Connect your operator identity</h1>
          </div>
          <span class="setup-badge" classList={{ 'is-ok': masterMatches() }}>
            {masterMatches() ? 'linked' : 'first step'}
          </span>
        </div>

        <ol class="setup-timeline">
          <li
            class="setup-step"
            classList={{ 'is-ok': Boolean(connectedPubkey()) }}
          >
            <span class="setup-step-marker">1</span>
            <div class="setup-step-body">
              <h2>Connect Nostr</h2>
              <p>
                Use your browser signer or existing AppWeaver connect flow. This
                key becomes the master identity the bot responds to.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  title={connect.manageTitle()}
                  onClick={connect.handleConnectMenuClick}
                >
                  {connect.connectLabel()}
                </button>
                <Show when={connectedPubkey()}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      connected {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
            </div>
          </li>

          <li class="setup-step" classList={{ 'is-ok': masterMatches() }}>
            <span class="setup-step-marker">2</span>
            <div class="setup-step-body">
              <h2>Set master pubkey</h2>
              <p>
                Write the connected Nostr pubkey into{' '}
                <code>BOT_MASTER_PUBKEY</code>
                in <code>.env</code>. Restart after setup to run the full bot
                with the new configuration.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingMaster()}
                  onClick={() => void saveConnectedMaster()}
                >
                  {savingMaster()
                    ? 'Saving...'
                    : connectedPubkey()
                      ? 'Use connected pubkey'
                      : 'Connect first'}
                </button>
                <Show when={props.status.runtime.masterPubkey}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      current {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={saveError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>

          <li
            class="setup-step"
            classList={{ 'is-ok': props.status.env.botKey }}
          >
            <span class="setup-step-marker">3</span>
            <div class="setup-step-body">
              <h2>Generate bot key</h2>
              <p>
                Generate a fresh Nostr identity for the bot. This writes{' '}
                <code>BOT_KEY</code> and <code>BOT_PUBKEY</code> to{' '}
                <code>.env</code>.
              </p>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={generatingBotKey()}
                  onClick={() => void generateBotKey()}
                >
                  {generatingBotKey()
                    ? 'Generating...'
                    : props.status.env.botKey
                      ? 'Regenerate bot key'
                      : 'Generate bot key'}
                </button>
                <Show when={props.status.runtime.botPubkey}>
                  {(pubkey) => (
                    <span class="setup-inline-code">
                      bot {shortPubkey(pubkey())}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={props.status.env.botKey}>
                <p class="setup-warning-line">
                  Regenerating replaces the bot identity in <code>.env</code>.
                </p>
              </Show>
              <Show when={botKeyError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>

          <li
            class="setup-step"
            classList={{ 'is-ok': props.status.env.relays }}
          >
            <span class="setup-step-marker">4</span>
            <div class="setup-step-body">
              <h2>Relay setup</h2>
              <p>
                Add DM/inbox relays for the bot. Bare hostnames are normalized
                to <code>wss://</code> URLs and written to{' '}
                <code>BOT_RELAYS</code>.
              </p>
              <label class="field-block setup-relay-field">
                <span class="field-label">Relays</span>
                <textarea
                  rows="4"
                  value={relayText()}
                  onInput={(event) => setRelayText(event.currentTarget.value)}
                />
                <small>One relay per line, or comma-separated.</small>
              </label>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingRelays()}
                  onClick={() => void saveRelays()}
                >
                  {savingRelays() ? 'Saving...' : 'Save relays'}
                </button>
                <Show when={props.status.env.relays}>
                  <span class="setup-inline-code">
                    {props.status.runtime.relayCount} configured
                  </span>
                </Show>
              </div>
              <Show when={relayError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>

          <li class="setup-step is-ok">
            <span class="setup-step-marker">5</span>
            <div class="setup-step-body">
              <h2>Bot defaults</h2>
              <p>
                Set the defaults that <code>bun run bot:setup</code> also
                manages. These are stored in the core database, except the ready
                notification flag in <code>.env</code>.
              </p>
              <div class="setup-defaults-grid">
                <label class="field-block">
                  <span class="field-label">DM command prefix</span>
                  <input
                    type="text"
                    value={prefix()}
                    onInput={(event) => setPrefix(event.currentTarget.value)}
                  />
                  <small>Examples: /help or .help</small>
                </label>
                <label class="field-block">
                  <span class="field-label">Workspace</span>
                  <select
                    value={workspace()}
                    onChange={(event) =>
                      setWorkspace(event.currentTarget.value)
                    }
                  >
                    <option value="parent">parent</option>
                    <option value="appweaver">appweaver</option>
                  </select>
                  <small>
                    Use parent for your project checkout, or appweaver when the
                    agent should work only inside this AppWeaver repo.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Backend</span>
                  <select
                    value={backend()}
                    onChange={(event) => setBackend(event.currentTarget.value)}
                  >
                    <option value="opencode">opencode</option>
                    <option value="cursor">cursor</option>
                  </select>
                  <small>
                    OpenCode is the recommended default. Cursor is available if
                    you already use Cursor cloud agents.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Provider</span>
                  <select
                    value={provider()}
                    onChange={(event) => setProvider(event.currentTarget.value)}
                  >
                    <option value="local">local</option>
                    <option value="routstr">routstr</option>
                  </select>
                  <small>
                    Local uses your selected backend/provider config. Routstr
                    routes paid requests through the Cashu-backed provider flow.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Mode</span>
                  <select
                    value={mode()}
                    onChange={(event) => setMode(event.currentTarget.value)}
                  >
                    <option value="ask">ask</option>
                    <option value="plan">plan</option>
                    <option value="agent">agent</option>
                  </select>
                  <small>
                    Ask answers questions, plan proposes changes, and agent can
                    edit files in the selected workspace.
                  </small>
                </label>
                <label class="field-block">
                  <span class="field-label">Lint auto</span>
                  <select
                    value={linting()}
                    onChange={(event) => setLinting(event.currentTarget.value)}
                  >
                    <option value="off">off</option>
                    <option value="on">on</option>
                  </select>
                  <small>
                    Use this if your selected workspace can run{' '}
                    <code>bun run lint</code>. In agent mode, AppWeaver will run
                    lint after edits and do one automatic fix pass if it fails.
                  </small>
                </label>
                <label class="field-block setup-checkbox-field">
                  <span class="field-label">Ready notification</span>
                  <span class="setup-checkbox-row">
                    <input
                      type="checkbox"
                      checked={readyNotification()}
                      onChange={(event) =>
                        setReadyNotification(event.currentTarget.checked)
                      }
                    />
                    Send a DM when AppWeaver starts
                  </span>
                  <small>
                    Useful on a server so you know the bot is online after
                    restart or deployment.
                  </small>
                </label>
              </div>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={savingDefaults()}
                  onClick={() => void saveDefaults()}
                >
                  {savingDefaults() ? 'Saving...' : 'Save defaults'}
                </button>
                <span class="setup-inline-code">
                  {backend()} / {provider()} / {mode()}
                </span>
              </div>
              <Show when={workspace() === 'parent'}>
                <p class="setup-warning-line">
                  Saving defaults with OpenCode + parent workspace also installs
                  missing OpenCode symlinks and agent templates automatically.
                </p>
              </Show>
              <Show when={defaultsInstallResult()}>
                {(installed) => (
                  <p class="setup-inline-code">
                    Parent assets checked:{' '}
                    {installed().symlinks.installed.length} symlink(s)
                    installed, {installed().symlinks.conflicts.length}{' '}
                    conflict(s)
                  </p>
                )}
              </Show>
              <Show when={defaultsError()}>
                {(error) => <p class="setup-error-line">{error()}</p>}
              </Show>
            </div>
          </li>
        </ol>
      </section>

      <ConnectOverlays auth={auth} connect={connect} />
    </>
  );
}

function SetupChrome(props: { children: JSX.Element }): JSX.Element {
  const auth = useNostrAuth();
  const connect = useConnect({ auth });

  return (
    <div class="app-shell setup-app-shell">
      <HeaderChrome
        widgets={() => []}
        isWidgetActive={() => false}
        wsConnected={() => false}
        isConnected={connect.isConnected}
        isDisconnected={connect.isDisconnected}
        connectLabel={connect.connectLabel}
        manageTitle={connect.manageTitle}
        pushBusy={() => false}
        piperTtsBusy={() => false}
        piperTtsEnabled={() => false}
        onOpenWidget={() => undefined}
        onConnect={connect.handleConnectMenuClick}
        onLogout={auth.logout}
        onEnablePush={() => undefined}
        onEnablePiperTts={() => undefined}
        onAnyMenuOpenChange={() => undefined}
      />
      {props.children}
      <ConnectOverlays auth={auth} connect={connect} />
    </div>
  );
}

export function SetupView(): JSX.Element {
  const [setupToken] = createResource(initializeSetupSession);

  const [latestStatus, setLatestStatus] = createSignal<SetupStatus | null>(
    null,
  );

  const [status, { refetch }] = createResource(
    () => setupToken() ?? null,
    async (token) => fetchSetupStatus(token),
  );

  createEffect(() => {
    const next = status();

    if (next) {
      setLatestStatus(next);
    }
  });

  return (
    <SetupChrome>
      <main class="setup-shell">
        <Switch>
          <Match when={setupToken() === null}>
            <section class="card setup-card setup-card--error">
              <h1>Missing setup access</h1>
              <p class="setup-copy">
                Open the setup URL printed in the server logs. The boot secret
                is exchanged for a local setup session and removed from the URL.
              </p>
            </section>
          </Match>

          <Match when={setupToken.error || status.error}>
            <section class="card setup-card setup-card--error">
              <h1>Setup access failed</h1>
              <p class="setup-copy">
                The setup secret was rejected or the setup API is unavailable.
                Restart AppWeaver and use the latest setup URL from the logs.
              </p>
              <pre class="setup-error-detail">
                {String(setupToken.error ?? status.error)}
              </pre>
            </section>
          </Match>

          <Match
            when={(setupToken.loading || status.loading) && !latestStatus()}
          >
            <section class="card setup-card">
              <h1>Checking configuration...</h1>
              <p class="setup-copy">
                Reading setup status from the local server.
              </p>
            </section>
          </Match>

          <Match when={latestStatus()}>
            {(loaded) => (
              <>
                <SetupTimeline
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <OpenCodeAuthCard token={setupToken()!} status={loaded()} />
                <CursorSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <WebPushSetupCard
                  token={setupToken()!}
                  status={loaded()}
                  onSaved={() => void refetch()}
                />
                <SetupStatusCard status={loaded()} />
                <SetupCompletionCard token={setupToken()!} status={loaded()} />
              </>
            )}
          </Match>
        </Switch>

        <Show when={setupToken()}>
          <p class="setup-footnote">
            Setup access is using an in-memory local session. Restart AppWeaver
            to invalidate setup sessions.
          </p>
        </Show>
      </main>
    </SetupChrome>
  );
}
