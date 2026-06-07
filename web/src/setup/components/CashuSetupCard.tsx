import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';

import {
  generateCashuMnemonic,
  setCashuWallet,
  type SetupStatus,
} from '../transport';

type CashuSetupCardProps = {
  token: string;
  status: SetupStatus;
  onSaved: () => void;
};

type QuizWord = {
  index: number;
};

const DEFAULT_CASHU_MINT_URL = 'https://mint.minibits.cash/Bitcoin';

function chooseQuizWords(words: string[]): QuizWord[] {
  const selected = new Set<number>();

  while (selected.size < 3) {
    selected.add(Math.floor(Math.random() * words.length));
  }

  return [...selected]
    .sort((left, right) => left - right)
    .map((index) => ({ index }));
}

export function CashuSetupCard(props: CashuSetupCardProps): JSX.Element {
  const [mnemonic, setMnemonic] = createSignal<string | null>(null);
  const [mintUrl, setMintUrl] = createSignal(DEFAULT_CASHU_MINT_URL);
  const [quizWords, setQuizWords] = createSignal<QuizWord[]>([]);

  const [quizAnswers, setQuizAnswers] = createSignal<Record<number, string>>(
    {},
  );

  const [generating, setGenerating] = createSignal(false);
  const [copying, setCopying] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const mnemonicWords = createMemo(() => mnemonic()?.split(' ') ?? []);

  const showMnemonic = createMemo(
    () => mnemonic() !== null && quizWords().length === 0,
  );

  const quizComplete = createMemo(() => {
    const words = mnemonicWords();

    return (
      quizWords().length === 3 &&
      quizWords().every(
        (item) =>
          (quizAnswers()[item.index] ?? '').trim().toLowerCase() ===
          words[item.index]?.toLowerCase(),
      )
    );
  });

  async function generateMnemonic(): Promise<void> {
    setGenerating(true);
    setMessage(null);
    setError(null);
    setQuizWords([]);
    setQuizAnswers({});

    try {
      const result = await generateCashuMnemonic(props.token);

      setMnemonic(result.mnemonic);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function dangerouslyCopyMnemonic(): Promise<void> {
    const phrase = mnemonic();

    if (!phrase) {
      return;
    }

    setCopying(true);
    setMessage(null);
    setError(null);

    try {
      await navigator.clipboard.writeText(phrase);
      setMessage('Mnemonic copied. Clear your clipboard after backing it up.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopying(false);
    }
  }

  function startBackupQuiz(): void {
    const words = mnemonicWords();

    if (words.length !== 12) {
      setError('Generate a 12-word mnemonic first.');

      return;
    }

    setMessage(null);
    setError(null);
    setQuizWords(chooseQuizWords(words));
    setQuizAnswers({});
  }

  function setQuizAnswer(index: number, answer: string): void {
    setQuizAnswers((current) => ({ ...current, [index]: answer }));
  }

  async function saveWallet(): Promise<void> {
    const phrase = mnemonic();

    if (!phrase || !quizComplete()) {
      setError('Enter the requested backup words before saving.');

      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const result = await setCashuWallet({
        token: props.token,
        mnemonic: phrase,
        defaultMintUrl: mintUrl(),
      });

      setMnemonic(null);
      setQuizWords([]);
      setQuizAnswers({});
      setMintUrl(result.defaultMintUrl);

      setMessage(
        'Cashu wallet saved to .env. Restart before using wallet commands.',
      );

      props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card setup-card setup-card--cashu">
      <div class="setup-card-head">
        <div>
          <h1>Cashu Wallet</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': props.status.env.cashuMnemonic }}
        >
          {props.status.env.cashuMnemonic ? 'configured' : 'optional'}
        </span>
      </div>

      <p class="setup-copy">
        Generate a local Cashu wallet mnemonic for wallet commands and Routstr
        payments. The 12 words are the only recovery key. AppWeaver writes them
        to <code>CASHU_MNEMONIC</code> only after you pass the backup check.
      </p>

      <Show
        when={!props.status.env.cashuMnemonic}
        fallback={
          <p class="setup-inline-code">
            CASHU_MNEMONIC is already set in .env. Remove it manually before
            generating a new wallet.
          </p>
        }
      >
        <label class="field-block setup-relay-field">
          <span class="field-label">Default mint URL</span>
          <input
            type="text"
            value={mintUrl()}
            onInput={(event) => setMintUrl(event.currentTarget.value)}
          />
          <small>
            Saved as <code>CASHU_DEFAULT_MINT_URL</code>. Leave the default if
            you are not sure which mint to use.
          </small>
        </label>

        <div class="setup-step-actions">
          <button
            type="button"
            class="web-button"
            disabled={generating()}
            onClick={() => void generateMnemonic()}
          >
            {generating() ? 'Generating...' : 'Generate 12 words'}
          </button>
        </div>

        <Show when={showMnemonic()}>
          <div class="setup-auth-result">
            <p class="setup-warning-line">
              Write these words down on paper. Anyone with these words can spend
              this wallet. They will not be shown again after saving.
            </p>
            <ol class="setup-tool-list">
              <For each={mnemonicWords()}>
                {(word, index) => (
                  <li>
                    <strong>{index() + 1}</strong>
                    <span>{word}</span>
                  </li>
                )}
              </For>
            </ol>
            <div class="setup-step-actions">
              <button
                type="button"
                class="web-button"
                disabled={copying()}
                onClick={() => void dangerouslyCopyMnemonic()}
              >
                {copying() ? 'Copying...' : 'Dangerously copy'}
              </button>
              <button
                type="button"
                class="web-button"
                onClick={startBackupQuiz}
              >
                Yes, I backed it up
              </button>
            </div>
          </div>
        </Show>

        <Show when={quizWords().length > 0}>
          <div class="setup-step setup-auth-step">
            <span class="setup-step-marker">?</span>
            <div class="setup-step-body">
              <h2>Backup check</h2>
              <p>Enter the requested words to confirm your backup.</p>
              <div class="setup-defaults-grid">
                <For each={quizWords()}>
                  {(item) => (
                    <label class="field-block">
                      <span class="field-label">Word {item.index + 1}</span>
                      <input
                        type="text"
                        value={quizAnswers()[item.index] ?? ''}
                        autocomplete="off"
                        onInput={(event) =>
                          setQuizAnswer(item.index, event.currentTarget.value)
                        }
                      />
                    </label>
                  )}
                </For>
              </div>
              <div class="setup-step-actions">
                <button
                  type="button"
                  class="web-button"
                  disabled={saving() || !quizComplete()}
                  onClick={() => void saveWallet()}
                >
                  {saving() ? 'Saving...' : 'Verify and write .env'}
                </button>
                <Show when={!quizComplete()}>
                  <span class="setup-inline-code">waiting for exact words</span>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </Show>

      <Show when={message()}>
        {(text) => <p class="setup-inline-code">{text()}</p>}
      </Show>
      <Show when={error()}>
        {(text) => <p class="setup-error-line">{text()}</p>}
      </Show>
    </section>
  );
}
