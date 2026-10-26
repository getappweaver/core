import {
  SearchInputV1Schema,
  SearchOutputV1Schema,
  type SearchInputV1,
  type SearchOutputV1,
} from '@src/capabilities/search.v1';
import type { CapabilityProviderSummary } from '@src/capabilities/types';

export type SearchSourceState = {
  provider: CapabilityProviderSummary;
  status: 'loading' | 'ready' | 'error';
  output: SearchOutputV1 | null;
  error: string | null;
};
export type SearchInvocation = {
  providerId: string;
  input: SearchInputV1;
  signal: AbortSignal;
};
type CoordinatorProps = {
  providers: CapabilityProviderSummary[];
  input: SearchInputV1;
  signal: AbortSignal;
  invoke: (request: SearchInvocation) => Promise<unknown>;
  onSource: (source: SearchSourceState) => void;
};

/** Transport-independent, bounded fan-out. Deadlines stop waiting, not plugin execution. */
export async function searchProviders({
  providers,
  input,
  signal,
  invoke,
  onSource,
}: CoordinatorProps): Promise<void> {
  const parsedInput = SearchInputV1Schema.parse(input);

  if (signal.aborted) {
    return;
  }

  let next = 0;
  for (const provider of providers) {
    onSource({ provider, status: 'loading', output: null, error: null });
  }

  const worker = async () => {
    while (!signal.aborted && next < providers.length) {
      const provider = providers[next++]!;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 8000);
      let rejectAbort = () => {};

      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(new Error('Search cancelled.'));

        controller.signal.addEventListener('abort', rejectAbort, {
          once: true,
        });
      });

      try {
        const output = SearchOutputV1Schema.parse(
          await Promise.race([
            Promise.resolve().then(() =>
              invoke({
                providerId: provider.providerId,
                input: parsedInput,
                signal: controller.signal,
              }),
            ),
            aborted,
          ]),
        );

        const owner =
          provider.source.type === 'plugin'
            ? provider.source.pluginName
            : provider.source.id;

        if (
          output.results.length > input.limit ||
          output.results.some(
            (hit) => hit.address.providerId !== `${owner}/resource-view/v1`,
          )
        ) {
          throw new Error('Invalid search result ownership or limit.');
        }

        if (output.nextCursor !== null && output.nextCursor === input.cursor) {
          throw new Error('Search cursor did not advance.');
        }

        const seen = new Set<string>();

        output.results = output.results.filter((hit) => {
          if (seen.has(hit.id)) {
            return false;
          }

          seen.add(hit.id);

          return true;
        });

        if (!signal.aborted) {
          onSource({ provider, status: 'ready', output, error: null });
        }
      } catch (error) {
        if (!signal.aborted) {
          onSource({
            provider,
            status: 'error',
            output: null,
            error: controller.signal.aborted
              ? 'Search timed out. Retry this source.'
              : error instanceof Error
                ? error.message
                : 'Source unavailable.',
          });
        }
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', rejectAbort);
        signal.removeEventListener('abort', abort);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, providers.length) }, worker),
  );
}
