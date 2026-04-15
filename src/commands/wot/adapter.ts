// ---------------------------------------------------------------------------
// src/commands/builtin/wot/adapter.ts
// ---------------------------------------------------------------------------

import type { RouteCommandContext } from '../dispatch';

import type { WotBuiltinInput } from './types';

export function adaptWotBuiltinInput(
  ctx: RouteCommandContext,
): WotBuiltinInput {
  return ctx;
}
