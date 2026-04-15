import type { MessageSource } from '@src/messaging';
import type { RepresentationBase } from '@src/system/representation';

import type {
  CommandDefinition,
  SubcommandDefinition,
} from './command-definition';

export type RenderTarget = 'text' | 'web';

export type Renderers<TRepresentation, TWebOutput = unknown> = {
  text?: (representation: TRepresentation) => string;
  web?: (representation: TRepresentation) => TWebOutput;
};

export type SubcommandAdapterContext = {
  source: MessageSource;
};

export type SubcommandHandlerContext = {
  source: MessageSource;
};

export type SubcommandAdapter<TInput> = (
  raw: unknown,
  ctx: SubcommandAdapterContext,
) => TInput | Promise<TInput>;

export type SubcommandHandler<TInput, TRepresentation> = (
  input: TInput,
  ctx: SubcommandHandlerContext,
) => TRepresentation | Promise<TRepresentation>;

export type SubcommandSpec<
  TInput = unknown,
  TRepresentation extends RepresentationBase = RepresentationBase,
  TWebOutput = unknown,
> = {
  definition: SubcommandDefinition;
  representation: TRepresentation;
  handler: SubcommandHandler<TInput, TRepresentation>;
  renderers: Renderers<TRepresentation, TWebOutput>;
  adapter?: SubcommandAdapter<TInput>;
};

export type CommandSpec<
  TSubcommands extends readonly SubcommandSpec<any, any, any>[] =
    readonly SubcommandSpec<any, any, any>[],
> = {
  definition: CommandDefinition;
  subcommands: TSubcommands;
};

export function getSubcommandSpec<
  TSubcommands extends readonly SubcommandSpec<any, any, any>[],
>(
  command: CommandSpec<TSubcommands>,
  token: string,
): TSubcommands[number] | null {
  return (
    command.subcommands.find(
      (subcommand) =>
        subcommand.definition.name === token ||
        subcommand.definition.aliases.includes(token),
    ) ?? null
  );
}

export async function executeSubcommandSpec<
  TInput,
  TRepresentation extends RepresentationBase,
  TWebOutput,
>(params: {
  subcommand: SubcommandSpec<TInput, TRepresentation, TWebOutput>;
  raw: unknown;
  source: MessageSource;
}): Promise<string | TWebOutput> {
  const input = params.subcommand.adapter
    ? await params.subcommand.adapter(params.raw, {
        source: params.source,
      })
    : (params.raw as TInput);

  const representation = await params.subcommand.handler(input, {
    source: params.source,
  });

  const target: RenderTarget =
    params.source === 'web' && params.subcommand.renderers.web ? 'web' : 'text';

  const renderer =
    target === 'web'
      ? params.subcommand.renderers.web
      : params.subcommand.renderers.text;

  if (!renderer) {
    throw new Error(
      `Renderer '${target}' not available for subcommand '${params.subcommand.definition.name}'`,
    );
  }

  return renderer(representation);
}

function assertHasAtLeastOneRenderer(
  renderers: Renderers<unknown, unknown>,
  subject: string,
): void {
  if (!renderers.text && !renderers.web) {
    throw new Error(`${subject} must provide at least one renderer`);
  }
}

export function createSubcommand<
  TInput = unknown,
  TRepresentation extends RepresentationBase = RepresentationBase,
  TWebOutput = unknown,
>(params: {
  definition: SubcommandDefinition;
  representation: TRepresentation;
  handler: SubcommandHandler<TInput, TRepresentation>;
  renderers: Renderers<TRepresentation, TWebOutput>;
  adapter?: SubcommandAdapter<TInput>;
}): SubcommandSpec<TInput, TRepresentation, TWebOutput> {
  const { definition } = params;

  assertHasAtLeastOneRenderer(
    params.renderers as Renderers<unknown, unknown>,
    `Subcommand '${definition.name}'`,
  );

  return {
    definition,
    representation: params.representation,
    handler: params.handler,
    renderers: params.renderers,
    adapter: params.adapter,
  };
}
