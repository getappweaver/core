import { debug } from '../logger';

export type StreamDebugMetrics = {
  backend: string;
  sessionId: string;
  startedAt: number;
  lastChunkAt: number | null;
  chunks: number;
  textChunks: number;
  chars: number;
  minChars: number | null;
  maxChars: number;
  maxGapMs: number;
};

export function createStreamDebugMetrics(
  backend: string,
  sessionId: string,
): StreamDebugMetrics {
  return {
    backend,
    sessionId,
    startedAt: Date.now(),
    lastChunkAt: null,
    chunks: 0,
    textChunks: 0,
    chars: 0,
    minChars: null,
    maxChars: 0,
    maxGapMs: 0,
  };
}

export function recordStreamDebugChunk(
  metrics: StreamDebugMetrics,
  text: string | null,
): void {
  const now = Date.now();

  metrics.chunks += 1;

  if (metrics.lastChunkAt !== null) {
    metrics.maxGapMs = Math.max(metrics.maxGapMs, now - metrics.lastChunkAt);
  }

  metrics.lastChunkAt = now;

  if (text === null) {
    return;
  }

  const length = text.length;
  metrics.textChunks += 1;
  metrics.chars += length;

  metrics.minChars =
    metrics.minChars === null ? length : Math.min(metrics.minChars, length);

  metrics.maxChars = Math.max(metrics.maxChars, length);
}

export function logStreamDebugSummary(metrics: StreamDebugMetrics): void {
  const durationMs = Date.now() - metrics.startedAt;

  const avgChars =
    metrics.textChunks > 0
      ? Number((metrics.chars / metrics.textChunks).toFixed(2))
      : 0;

  const charsPerSecond =
    durationMs > 0
      ? Number(((metrics.chars * 1000) / durationMs).toFixed(2))
      : 0;

  debug(
    `${metrics.backend} stream summary`,
    JSON.stringify({
      sessionId: metrics.sessionId,
      durationMs,
      chunks: metrics.chunks,
      textChunks: metrics.textChunks,
      chars: metrics.chars,
      avgChars,
      minChars: metrics.minChars ?? 0,
      maxChars: metrics.maxChars,
      maxGapMs: metrics.maxGapMs,
      charsPerSecond,
    }),
  );
}
