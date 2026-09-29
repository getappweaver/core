/** View a workspace file in the web UI, optionally focused on a line. */
import { z } from 'zod';

import { WebRenderResultSchema } from '@src/web/ui-schema';

import { defineCapability } from './types';

export const WorkspaceFileViewV1 = defineCapability({
  capability: { name: 'workspace-file-view', version: 1 },
  addedInCoreVersion: '13.1.1',
  operations: {
    view: {
      id: 'capability:v1:workspace-file-view.view',
      required: true,
      inputSchema: z.object({
        path: z.string().min(1),
        line: z.number().int().positive().nullable(),
      }),
      outputSchema: z.object({ view: WebRenderResultSchema }),
      webResult: (output) => output.view,
    },
  },
});
