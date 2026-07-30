import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type {
  MonitoringAttributeValueV1,
  MonitoringSpanV1,
} from '@src/capabilities/monitoring.v1';
import { MonitoringV1 } from '@src/capabilities/monitoring.v1';
import { debug } from '@src/logger';

import { capabilityRegistry } from './capabilities/registry';

export type MonitoringTraceContext = {
  traceId: string;
  parentSpanId: string;
};

export type StartMonitoringSpanProps = {
  name: string;
  attributes: Record<string, MonitoringAttributeValueV1>;
  parent: MonitoringTraceContext | null;
};

export type MonitoringSpan = {
  traceId: string;
  spanId: string;
  context: MonitoringTraceContext;
  end: (status?: 'ok' | 'error') => void;
};

export type WithMonitoringSpanProps<T> = StartMonitoringSpanProps & {
  run: () => T | Promise<T>;
};

export type Monitoring = {
  isEnabled: () => boolean;
  startSpan: (props: StartMonitoringSpanProps) => MonitoringSpan;
  withSpan: <T>(props: WithMonitoringSpanProps<T>) => Promise<T>;
  currentContext: () => MonitoringTraceContext | null;
};

const traceStorage = new AsyncLocalStorage<MonitoringTraceContext>();
let queuedSpans: MonitoringSpanV1[] = [];
let flushScheduled = false;

function id(): string {
  return randomUUID().replaceAll('-', '');
}

function enqueue(span: MonitoringSpanV1): void {
  queuedSpans.push(span);

  if (flushScheduled) {
    return;
  }

  flushScheduled = true;
  queueMicrotask(() => void flush());
}

async function flush(): Promise<void> {
  flushScheduled = false;

  if (queuedSpans.length === 0) {
    return;
  }

  const spans = queuedSpans;
  queuedSpans = [];

  try {
    await capabilityRegistry.invokeAllById({
      operationId: MonitoringV1.operations.record.id,
      input: { spans },
      caller: {
        type: 'plugin',
        pluginName: 'appweaver-core',
        alias: 'core',
      },
    });
  } catch (err) {
    debug(`Monitoring span delivery failed: ${String(err)}`);
  }
}

export function recordMonitoringSpans(spans: MonitoringSpanV1[]): void {
  for (const span of spans) {
    enqueue(span);
  }
}

export async function runWithMonitoringContext<T>(
  context: MonitoringTraceContext | null,
  run: () => Promise<T>,
): Promise<T> {
  return context ? traceStorage.run(context, run) : run();
}

export const monitoring: Monitoring = {
  isEnabled: () =>
    capabilityRegistry.listOperationProviders(MonitoringV1.operations.record.id)
      .length > 0,
  currentContext: () => traceStorage.getStore() ?? null,
  startSpan: ({ name, attributes, parent }) => {
    const activeParent = parent ?? traceStorage.getStore() ?? null;
    const traceId = activeParent?.traceId ?? id();
    const spanId = id();
    const startedAt = Date.now();
    const started = performance.now();
    let ended = false;

    return {
      traceId,
      spanId,
      context: { traceId, parentSpanId: spanId },
      end: (status = 'ok') => {
        if (ended) {
          return;
        }

        ended = true;

        enqueue({
          traceId,
          spanId,
          parentSpanId: activeParent?.parentSpanId ?? null,
          name,
          source: 'server',
          startedAt,
          durationMs: performance.now() - started,
          status,
          attributes,
        });
      },
    };
  },
  withSpan: async ({ name, attributes, parent, run }) => {
    const span = monitoring.startSpan({ name, attributes, parent });

    try {
      return await traceStorage.run(span.context, run);
    } catch (err) {
      span.end('error');
      throw err;
    } finally {
      span.end();
    }
  },
};
