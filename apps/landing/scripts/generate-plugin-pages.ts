#!/usr/bin/env bun

import { generateSite } from './generate-site';

generateSite().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
