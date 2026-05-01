/* global process */

import { Agent, Cursor } from '@cursor/sdk';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function writeResult(result) {
  process.stdout.write(`${JSON.stringify({ type: 'result', result })}\n`);
}

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function formatError(err) {
  if (err && typeof err === 'object') {
    const parts = [err.message ?? String(err)];

    if (err.code) {
      parts.push(`code=${err.code}`);
    }

    if (err.status) {
      parts.push(`status=${err.status}`);
    }

    if (err.requestId) {
      parts.push(`requestId=${err.requestId}`);
    }

    return parts.join(' ');
  }

  return String(err);
}

function extractText(event) {
  if (event.type !== 'assistant') {
    return '';
  }

  return event.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function createSession(input) {
  await Cursor.me({ apiKey: input.apiKey });

  const agent = await Agent.create({
    apiKey: input.apiKey,
    model: { id: input.model },
    local: { cwd: input.cwd },
  });

  try {
    writeResult({ ok: true, sessionId: agent.agentId });
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

async function runMessage(input) {
  await Cursor.me({ apiKey: input.apiKey });

  const agent = await Agent.resume(input.sessionId, {
    apiKey: input.apiKey,
    model: { id: input.model },
    local: { cwd: input.cwd },
  });

  let activeRun = null;
  const cancelActiveRun = () => {
    if (activeRun) {
      void activeRun.cancel().catch(() => {});
    }
  };

  process.once('SIGTERM', cancelActiveRun);
  process.once('SIGINT', cancelActiveRun);

  try {
    const run = await agent.send(input.content, {
      model: { id: input.model },
      local: { force: true },
    });
    activeRun = run;

    const chunks = [];

    for await (const event of run.stream()) {
      if (event.type === 'request') {
        await run.cancel();
        writeResult({
          ok: false,
          error: `Cursor SDK is waiting for user input or approval: ${event.request_id}`,
        });

        return;
      }

      const text = extractText(event);

      if (text) {
        chunks.push(text);
        writeEvent({ type: 'text_delta', text });
      }
    }

    const result = await run.wait();

    if (result.status !== 'finished') {
      writeResult({
        ok: false,
        error: result.result ?? `Cursor SDK run ${result.status}`,
      });

      return;
    }

    writeResult({
      ok: true,
      output: chunks.join('') || result.result || '(no output)',
      model: result.model?.id ?? input.model,
    });
  } finally {
    process.removeListener('SIGTERM', cancelActiveRun);
    process.removeListener('SIGINT', cancelActiveRun);
    await agent[Symbol.asyncDispose]();
  }
}

async function listModels(input) {
  await Cursor.me({ apiKey: input.apiKey });

  const models = await Cursor.models.list({ apiKey: input.apiKey });

  writeResult({
    ok: true,
    models: models.map((model) => model.id),
  });
}

try {
  const input = JSON.parse(await readStdin());

  if (!input.apiKey) {
    throw new Error('CURSOR_API_KEY is not set');
  }

  if (input.type === 'create') {
    await createSession(input);
  } else if (input.type === 'run') {
    await runMessage(input);
  } else if (input.type === 'models') {
    await listModels(input);
  } else {
    throw new Error(`Unknown worker request type: ${String(input.type)}`);
  }
} catch (err) {
  writeResult({ ok: false, error: formatError(err) });
  process.exitCode = 1;
}
