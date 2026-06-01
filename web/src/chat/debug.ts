const CHAT_DEBUG_LOG_STORAGE_KEY = 'appweaverChatLog';
const MAX_STORED_LOGS = 300;

type ChatDebugDetails = Record<string, unknown>;

type StoredChatDebugLog = {
  event: string;
  details: ChatDebugDetails;
  hidden: boolean;
  href: string;
  time: string;
  visibilityState: DocumentVisibilityState;
};

function readStoredChatLogs(): StoredChatDebugLog[] {
  try {
    const raw = window.localStorage.getItem(CHAT_DEBUG_LOG_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed) ? (parsed as StoredChatDebugLog[]) : [];
  } catch {
    return [];
  }
}

function storeChatLog(entry: StoredChatDebugLog): void {
  try {
    const logs = [...readStoredChatLogs(), entry].slice(-MAX_STORED_LOGS);

    window.localStorage.setItem(
      CHAT_DEBUG_LOG_STORAGE_KEY,
      JSON.stringify(logs),
    );
  } catch {
    // Console logging is still useful when storage is unavailable.
  }
}

export function logChatDebug(
  event: string,
  details: ChatDebugDetails = {},
): void {
  const entry: StoredChatDebugLog = {
    event,
    details,
    hidden: document.hidden,
    href: window.location.href,
    time: new Date().toISOString(),
    visibilityState: document.visibilityState,
  };

  storeChatLog(entry);
  console.log('[appweaver:chat]', event, entry);
}
