import type {
  MonitoringAttributeValueV1,
  MonitoringSpanV1,
} from '@src/capabilities/monitoring.v1';

type BrowserSpan = {
  spanId: string;
  end: (status?: 'ok' | 'error') => void;
};

type StartBrowserSpanProps = {
  name: string;
  attributes: Record<string, MonitoringAttributeValueV1>;
  parentSpanId: string | null;
};

type CreateBrowserTraceProps = {
  name: string;
  attributes: Record<string, MonitoringAttributeValueV1>;
};

export type BrowserTrace = {
  traceId: string;
  rootSpanId: string;
  context: { traceId: string; parentSpanId: string };
  startSpan: (props: StartBrowserSpanProps) => BrowserSpan;
  finish: (status?: 'ok' | 'error') => MonitoringSpanV1[];
};

function id(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export function createBrowserTrace({
  name,
  attributes,
}: CreateBrowserTraceProps): BrowserTrace {
  const traceId = id();
  const spans: MonitoringSpanV1[] = [];

  const startSpan = ({
    name: spanName,
    attributes: spanAttributes,
    parentSpanId,
  }: StartBrowserSpanProps): BrowserSpan => {
    const spanId = id();
    const startedAt = Date.now();
    const started = performance.now();
    let ended = false;

    return {
      spanId,
      end: (status = 'ok') => {
        if (ended) {
          return;
        }

        ended = true;

        spans.push({
          traceId,
          spanId,
          parentSpanId,
          name: spanName,
          source: 'browser',
          startedAt,
          durationMs: performance.now() - started,
          status,
          attributes: spanAttributes,
        });
      },
    };
  };

  const root = startSpan({ name, attributes, parentSpanId: null });

  return {
    traceId,
    rootSpanId: root.spanId,
    context: { traceId, parentSpanId: root.spanId },
    startSpan,
    finish: (status = 'ok') => {
      root.end(status);

      return spans;
    },
  };
}

export function afterNextPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run));
}
