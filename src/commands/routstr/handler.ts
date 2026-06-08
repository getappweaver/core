import { type BuiltinHandler } from '../dispatch';
import { renderBuiltinHelpText } from '../help/renderers/text';
import { runRoutstrCommandsFromArgs } from '../provider/handler';

export const handleRoutstrRoot: BuiltinHandler = (ctx) => {
  const subcmd = ctx.args[0]?.toLowerCase();

  if (subcmd === 'help') {
    const topic = ctx.args.length > 1 ? ctx.args.slice(1).join(' ') : null;

    return Promise.resolve(
      renderBuiltinHelpText({
        prefix: ctx.prefix,
        root: 'routstr',
        topic,
      }),
    );
  }

  return runRoutstrCommandsFromArgs(ctx, ctx.args);
};
