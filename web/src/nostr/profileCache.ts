type CacheEntry<T> = {
  value: T;
  fetchedAtMs: number;
};

type ReadProfileCacheProps<T> = {
  key: string;
  freshTtlMs: number;
  staleTtlMs: number;
  load: () => Promise<T>;
  forceRefresh: boolean;
};

type SetProfileCacheProps<T> = {
  key: string;
  value: T;
};

const REFRESH_RETRY_INTERVAL_MS = 60_000;

export class ProfileMemoryCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly failedAtMs = new Map<string, number>();

  set({ key, value }: SetProfileCacheProps<T>): void {
    this.entries.set(key, { value, fetchedAtMs: Date.now() });
  }

  clear(): void {
    this.entries.clear();
    this.failedAtMs.clear();
  }

  async read({
    key,
    freshTtlMs,
    staleTtlMs,
    load,
    forceRefresh,
  }: ReadProfileCacheProps<T>): Promise<T> {
    const entry = this.entries.get(key);

    const ageMs = entry
      ? Date.now() - entry.fetchedAtMs
      : Number.POSITIVE_INFINITY;

    if (!forceRefresh && entry && ageMs < freshTtlMs) {
      return entry.value;
    }

    const failedAtMs = this.failedAtMs.get(key);

    if (
      !forceRefresh &&
      failedAtMs !== undefined &&
      Date.now() - failedAtMs < REFRESH_RETRY_INTERVAL_MS
    ) {
      if (entry) {
        return entry.value;
      }

      throw new Error('profile_cache_refresh_throttled');
    }

    const refresh = this.refresh({ key, load });

    if (!forceRefresh && entry && ageMs < staleTtlMs) {
      void refresh.catch(() => undefined);

      return entry.value;
    }

    return refresh;
  }

  private refresh({
    key,
    load,
  }: Pick<ReadProfileCacheProps<T>, 'key' | 'load'>): Promise<T> {
    const existing = this.pending.get(key);

    if (existing) {
      return existing;
    }

    const pending = load()
      .then((value) => {
        this.set({ key, value });
        this.failedAtMs.delete(key);

        return value;
      })
      .catch((error: unknown) => {
        this.failedAtMs.set(key, Date.now());

        throw error;
      })
      .finally(() => {
        if (this.pending.get(key) === pending) {
          this.pending.delete(key);
        }
      });

    this.pending.set(key, pending);

    return pending;
  }
}
