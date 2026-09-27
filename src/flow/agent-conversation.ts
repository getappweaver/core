// ---------------------------------------------------------------------------
// src/flow/agent-conversation.ts — Session, agent run, and reply
// ---------------------------------------------------------------------------

import type { AgentBackend } from '../backends/types';
import { getOutputString } from '../backends/types';
import type { PreparedModelRun } from '../core/model-source';
import type { CoreDb } from '../db';
import { getWorkspaceTarget } from '../db';
import { C, log } from '../logger';
import type { MessageSource } from '../messaging';
import { tokenFooter, sendChunkedReply } from '../messaging';
import { getOrCreateCurrentSession, insertSessionMessage } from '../session';

import { runAgentWithLintFollowUp } from './agent-lint-follow-up';

export type RunAgentConversationProps = {
  content: string;
  source: MessageSource;
  sendReplyForSource: (source: MessageSource, message: string) => Promise<void>;
  backend: AgentBackend;
  prepared: PreparedModelRun;
  seenDb: CoreDb;
  dmBotRoot: string;
  parentOfBotRoot: string;
};

export async function runAgentConversation({
  content,
  source,
  sendReplyForSource,
  backend,
  prepared,
  seenDb,
  dmBotRoot,
  parentOfBotRoot,
}: RunAgentConversationProps): Promise<void> {
  const isLocal = source === 'local';
  const currentWorkspace = getWorkspaceTarget(seenDb);
  const cwd = currentWorkspace === 'appweaver' ? dmBotRoot : parentOfBotRoot;

  const sessionId = await getOrCreateCurrentSession({
    db: seenDb,
    backend,
    cwd,
  });

  insertSessionMessage(seenDb, sessionId, 'user', content);

  try {
    const { result: finalResult } = await runAgentWithLintFollowUp({
      dmBotRoot,
      sessionId,
      cwd,
      coreDb: seenDb,
      effectiveContent: content,
      currentWorkspace,
      prepared,
    });

    const finalOutput = getOutputString(finalResult);

    const isErrorResponse =
      finalResult.type === 'error' ||
      finalOutput.startsWith('Unexpected error') ||
      finalOutput.startsWith('Error:') ||
      finalOutput.includes('check log file at') ||
      finalOutput === '(no output)';

    if (!isErrorResponse) {
      insertSessionMessage(seenDb, sessionId, 'assistant', finalOutput);
    } else {
      log.error(
        `${C.red}[bot] Error response — not stored in session history.${C.reset}`,
      );

      log.error(finalOutput);
    }

    const spentMsats = 0;
    const footer = tokenFooter(finalResult, isLocal, spentMsats);

    let fullReply: string;

    if (
      isLocal &&
      finalResult.type === 'success' &&
      finalResult.outputs.some((o) => o.type === 'reasoning')
    ) {
      const reasoningSegs = finalResult.outputs.filter(
        (o): o is { type: 'reasoning'; value: string } =>
          o.type === 'reasoning',
      );

      const reasoningText = reasoningSegs.map((s) => s.value).join('\n');
      const thinkingBlock = `${C.dim}<thinking>\n${reasoningText}\n</thinking>${C.reset}\n\n`;
      fullReply = thinkingBlock + finalOutput + footer;
    } else {
      fullReply = finalOutput + footer;
    }

    await sendChunkedReply({
      source,
      reply: fullReply,
      sendReplyForSource,
    });
  } catch (err) {
    log.error(`${C.red}Agent process error:${C.reset} ${String(err)}`);

    sendReplyForSource(source, `Error: ${String(err)}`).catch((e) =>
      log.error(`Failed to send error reply: ${String(e)}`),
    );
  }
}
