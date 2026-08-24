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

import {
  getStoredProviderID,
  providerIsConfigured,
  storedPreferredProvider,
  storeProviderID,
} from '../opencodeAuth';
import {
  authorizeOpenCodeProvider,
  fetchOpenCodeAuthStatus,
  setProviderApiKey,
  type OpenCodeAuthorizeResponse,
  type SetupStatus,
} from '../transport';

type OpenCodeAuthCardProps = {
  token: string;
  status: SetupStatus;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function OpenCodeAuthCard(props: OpenCodeAuthCardProps): JSX.Element {
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
  const [deviceCodeCopied, setDeviceCodeCopied] = createSignal(false);

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
      storeProviderID(selected);

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

  const selectedMethodIsHeadless = () =>
    /headless/i.test(selectedAuthMethod()?.label ?? '');

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
    setDeviceCodeCopied(false);

    try {
      const result = await authorizeOpenCodeProvider({
        token: props.token,
        providerID: provider.id,
        methodIndex: selectedMethodIndex(),
      });

      setAuthorizeResult(result);

      if (result.url) {
        void waitForProviderAuth(provider.id);
      }
    } catch (err) {
      setAuthorizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthorizing(false);
    }
  }

  async function copyDeviceCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setDeviceCodeCopied(true);
    } catch (err) {
      setAuthorizeError(err instanceof Error ? err.message : String(err));
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
                      storeProviderID(event.currentTarget.value);
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
                          <Show when={selectedMethodIsHeadless()}>
                            <small>
                              For ChatGPT, first enable device code
                              authorization in ChatGPT Settings &gt; Security.
                              OpenCode will generate the one-time code after you
                              start authentication.
                            </small>
                          </Show>
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
                          <a
                            href={url()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            open provider login
                          </a>
                        </p>
                      )}
                    </Show>
                    <Show when={result().instructions}>
                      {(instructions) => <p>{instructions()}</p>}
                    </Show>
                    <Show when={result().code}>
                      {(code) => (
                        <div class="setup-auth-device-code">
                          <span>One-time code</span>
                          <code>{code()}</code>
                          <button
                            type="button"
                            class="web-button"
                            onClick={() => void copyDeviceCode(code())}
                          >
                            {deviceCodeCopied() ? 'Copied' : 'Copy code'}
                          </button>
                        </div>
                      )}
                    </Show>
                    <p class="setup-copy">
                      Complete the provider flow in the new tab. This section
                      checks OpenCode automatically while authorization is in
                      progress.
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
          <div>
            <p class="setup-error-line">{String(authStatus.error)}</p>
            <div class="setup-step-actions">
              <button
                type="button"
                class="web-button"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </div>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
