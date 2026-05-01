import type { EventTemplate, NostrEvent, VerifiedEvent } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools';

const BASE_NIP55_PARAMS = 'compressionType=none';
const VISIBILITY_TIMEOUT_MS = 30_000;

function buildNip55GetPublicKeyUri(): string {
  return `nostrsigner:?${BASE_NIP55_PARAMS}&returnType=signature&type=get_public_key`;
}

function buildNip55SignEventUri(event: EventTemplate): string {
  const encodedEvent = encodeURIComponent(JSON.stringify(event));

  return `nostrsigner:${encodedEvent}?${BASE_NIP55_PARAMS}&returnType=event&type=sign_event`;
}

function waitForVisibilityReturn(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();

      return;
    }

    let sawHidden = document.visibilityState === 'hidden';

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, VISIBILITY_TIMEOUT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sawHidden = true;

        return;
      }

      if (sawHidden && document.visibilityState === 'visible') {
        cleanup();
        resolve();
      }
    };

    const onFocus = () => {
      if (sawHidden) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
  });
}

async function readClipboardText(): Promise<string | null> {
  if (
    typeof navigator === 'undefined' ||
    !('clipboard' in navigator) ||
    typeof navigator.clipboard.readText !== 'function'
  ) {
    return null;
  }

  try {
    const text = await navigator.clipboard.readText();

    return text.trim().length > 0 ? text.trim() : null;
  } catch {
    return null;
  }
}

type RequestNip55ResultProps = {
  uri: string;
  promptLabel: string;
};

async function requestNip55Result({
  uri,
  promptLabel,
}: RequestNip55ResultProps): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('NIP-55 requires a browser environment');
  }

  window.location.href = uri;
  await waitForVisibilityReturn();

  const clipboardResult = await readClipboardText();

  if (clipboardResult) {
    return clipboardResult;
  }

  const pasted = window.prompt(
    `Paste the ${promptLabel} result from Amber:`,
    '',
  );

  if (!pasted || pasted.trim().length === 0) {
    throw new Error(`Missing ${promptLabel} result from Amber`);
  }

  return pasted.trim();
}

function parseHexPubkey(result: string): string {
  const trimmed = result.trim();

  if (!/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new Error('Invalid pubkey returned by Amber');
  }

  return trimmed;
}

function parseSignedEvent(result: string): VerifiedEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(result) as unknown;
  } catch {
    throw new Error('Invalid signed event returned by Amber');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as NostrEvent).id !== 'string' ||
    typeof (parsed as NostrEvent).pubkey !== 'string' ||
    typeof (parsed as NostrEvent).sig !== 'string'
  ) {
    throw new Error('Invalid signed event returned by Amber');
  }

  if (!verifyEvent(parsed as NostrEvent)) {
    throw new Error('Amber returned an unverifiable signed event');
  }

  return parsed as VerifiedEvent;
}

export async function getPublicKeyViaNip55(): Promise<string> {
  const result = await requestNip55Result({
    uri: buildNip55GetPublicKeyUri(),
    promptLabel: 'public key',
  });

  return parseHexPubkey(result);
}

export async function signEventWithNip55(
  event: EventTemplate,
): Promise<VerifiedEvent> {
  const result = await requestNip55Result({
    uri: buildNip55SignEventUri(event),
    promptLabel: 'signed event JSON',
  });

  return parseSignedEvent(result);
}
