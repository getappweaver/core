const STORY_DEBUG_QUERY_PARAM = 'debugStory';
const STORY_DEBUG_STORAGE_KEY = 'appweaverDebugStory';

type StoryDebugDetails = Record<string, unknown>;

function readQueryDebugFlag(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(
      STORY_DEBUG_QUERY_PARAM,
    );
  } catch {
    return null;
  }
}

export function isStoryDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const queryFlag = readQueryDebugFlag();

  if (queryFlag === '1' || queryFlag === 'true') {
    try {
      window.localStorage.setItem(STORY_DEBUG_STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures; query param still enables this load.
    }

    return true;
  }

  if (queryFlag === '0' || queryFlag === 'false') {
    try {
      window.localStorage.removeItem(STORY_DEBUG_STORAGE_KEY);
    } catch {
      // Ignore storage failures; query param still disables this load.
    }

    return false;
  }

  try {
    return window.localStorage.getItem(STORY_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function logStoryDebug(
  event: string,
  details: StoryDebugDetails = {},
): void {
  if (!isStoryDebugEnabled()) {
    return;
  }

  console.warn('[appweaver:story]', event, {
    ...details,
    href: window.location.href,
    time: new Date().toISOString(),
  });
}
