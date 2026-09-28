import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { spawnSync } from 'bun';

import type { AiModelRuntimeConfig } from '@src/capabilities/ai-model-source.v1';

export type RawOpencodeConfig = {
  model?: unknown;
  small_model?: unknown;
  enabled_providers?: unknown;
  disabled_providers?: unknown;
  provider?: Record<string, unknown>;
  default_agent?: unknown;
  agent?: Record<string, unknown>;
  [key: string]: unknown;
};

const workspaceLocks = new Map<string, Promise<void>>();

export function getCanonicalOpencodeConfigPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), '.appweaver', 'opencode.json');
}

export function getRuntimeOpencodeConfigPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), 'opencode.json');
}

function configError(path: string, message: string): Error {
  return new Error(
    `Invalid OpenCode configuration at ${path}: ${message}. Fix the file and restart AppWeaver.`,
  );
}

export function parseOpencodeConfig(
  raw: string,
  path: string,
): RawOpencodeConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = Bun.JSONC.parse(raw);
    } catch {
      throw configError(path, 'the document is not valid JSON or JSONC');
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw configError(path, 'the document root must be an object');
  }

  const config = parsed as RawOpencodeConfig;

  for (const key of ['model', 'small_model', 'default_agent'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'string') {
      throw configError(path, `${key} must be a string`);
    }
  }

  if (
    config.agent !== undefined &&
    (typeof config.agent !== 'object' ||
      config.agent === null ||
      Array.isArray(config.agent))
  ) {
    throw configError(path, 'agent must be an object');
  }

  if (
    config.provider !== undefined &&
    (typeof config.provider !== 'object' ||
      config.provider === null ||
      Array.isArray(config.provider))
  ) {
    throw configError(path, 'provider must be an object');
  }

  for (const key of ['enabled_providers', 'disabled_providers'] as const) {
    const value = config[key];

    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some((entry) => typeof entry !== 'string'))
    ) {
      throw configError(path, `${key} must be an array of strings`);
    }
  }

  for (const [providerId, provider] of Object.entries(config.provider ?? {})) {
    if (
      typeof provider !== 'object' ||
      provider === null ||
      Array.isArray(provider)
    ) {
      throw configError(path, `provider ${providerId} must be an object`);
    }
  }

  return config;
}

function serializeConfig(config: RawOpencodeConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

async function validateWithOpenCode(
  config: RawOpencodeConfig,
  path: string,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'appweaver-opencode-config-'));

  try {
    try {
      const result = spawnSync(['opencode', 'debug', 'config', '--pure'], {
        cwd: directory,
        env: {
          ...process.env,
          OPENCODE_CONFIG_CONTENT: serializeConfig(config),
        },
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
        timeout: 30_000,
      });

      if (result.exitCode !== 0) {
        throw configError(
          path,
          'the installed OpenCode rejected the configuration',
        );
      }
    } catch {
      throw configError(
        path,
        'the installed OpenCode could not validate the configuration',
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function atomicWrite(path: string, contents: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  let symlink = false;

  try {
    symlink = (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    if (!symlink && (await readFile(path, 'utf8')) === contents) {
      return false;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const temporaryPath = join(
    dirname(path),
    `.${path.split('/').at(-1)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return true;
}

async function withWorkspaceLock<T>(
  workspaceRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = resolve(workspaceRoot);
  const previous = workspaceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;

  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });

  const queued = previous.then(() => current);

  workspaceLocks.set(key, queued);

  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (workspaceLocks.get(key) === queued) {
      workspaceLocks.delete(key);
    }
  }
}

export function readCanonicalOpencodeConfigSync(
  workspaceRoot: string,
): RawOpencodeConfig {
  const path = getCanonicalOpencodeConfigPath(workspaceRoot);

  try {
    return parseOpencodeConfig(readFileSync(path, 'utf8'), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw configError(path, 'the managed canonical file is missing');
    }

    throw error;
  }
}

export async function readCanonicalOpencodeConfig(
  workspaceRoot: string,
): Promise<RawOpencodeConfig> {
  const path = getCanonicalOpencodeConfigPath(workspaceRoot);

  try {
    return parseOpencodeConfig(await readFile(path, 'utf8'), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw configError(path, 'the managed canonical file is missing');
    }

    throw error;
  }
}

async function materializeConfig(
  workspaceRoot: string,
  config: RawOpencodeConfig,
): Promise<boolean> {
  const runtimePath = getRuntimeOpencodeConfigPath(workspaceRoot);
  parseOpencodeConfig(serializeConfig(config), runtimePath);
  await validateWithOpenCode(config, runtimePath);

  return atomicWrite(runtimePath, serializeConfig(config));
}

export async function initializeManagedOpencodeConfig(props: {
  workspaceRoot: string;
  templatePath: string;
}): Promise<void> {
  await withWorkspaceLock(props.workspaceRoot, async () => {
    const canonicalPath = getCanonicalOpencodeConfigPath(props.workspaceRoot);
    let config: RawOpencodeConfig;

    let canonicalExists = false;

    try {
      const stat = lstatSync(canonicalPath);

      if (!stat.isFile()) {
        throw configError(
          canonicalPath,
          'the canonical path must be a regular file',
        );
      }

      canonicalExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (canonicalExists) {
      config = parseOpencodeConfig(
        await readFile(canonicalPath, 'utf8'),
        canonicalPath,
      );
    } else {
      const runtimePath = getRuntimeOpencodeConfigPath(props.workspaceRoot);
      let sourcePath = props.templatePath;

      try {
        lstatSync(runtimePath);
        sourcePath = runtimePath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      let sourceRaw: string;

      try {
        sourceRaw = await readFile(sourcePath, 'utf8');
      } catch (error) {
        if (
          sourcePath === runtimePath &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          sourcePath = props.templatePath;
          sourceRaw = await readFile(sourcePath, 'utf8');
        } else {
          throw error;
        }
      }

      config = parseOpencodeConfig(sourceRaw, sourcePath);
      await validateWithOpenCode(config, canonicalPath);
      await atomicWrite(canonicalPath, serializeConfig(config));
    }

    await materializeConfig(props.workspaceRoot, config);
  });
}

export async function initializeManagedOpencodeConfigs(props: {
  appweaverRoot: string;
  parentRoot: string;
  templatePath?: string;
}): Promise<void> {
  const templatePath =
    props.templatePath ??
    join(
      resolve(props.appweaverRoot),
      'templates',
      'opencode',
      'opencode.json',
    );

  for (const workspaceRoot of new Set([
    resolve(props.appweaverRoot),
    resolve(props.parentRoot),
  ])) {
    await initializeManagedOpencodeConfig({ workspaceRoot, templatePath });
  }
}

export async function updateCanonicalOpencodeConfig(
  workspaceRoot: string,
  update: (config: RawOpencodeConfig) => void,
): Promise<RawOpencodeConfig> {
  return withWorkspaceLock(workspaceRoot, async () => {
    const canonicalPath = getCanonicalOpencodeConfigPath(workspaceRoot);
    const config = await readCanonicalOpencodeConfig(workspaceRoot);
    update(config);
    parseOpencodeConfig(serializeConfig(config), canonicalPath);
    await validateWithOpenCode(config, canonicalPath);
    await atomicWrite(canonicalPath, serializeConfig(config));

    return config;
  });
}

export function runtimeModelId(config: AiModelRuntimeConfig): string {
  return config.kind === 'canonical-model'
    ? config.model
    : `${config.provider.id}/${config.model}`;
}

export function runtimeConfigSignature(config: AiModelRuntimeConfig): string {
  return JSON.stringify(
    config.kind === 'canonical-model'
      ? { kind: config.kind }
      : { kind: config.kind, provider: config.provider },
  );
}

/** Build a source-specific inline override without changing the workspace config. */
export function composeOpencodeRuntimeConfig(
  canonical: RawOpencodeConfig,
  contribution: AiModelRuntimeConfig,
): RawOpencodeConfig {
  if (contribution.kind === 'canonical-model') {
    return { ...canonical, model: contribution.model };
  }

  if (
    !contribution.provider.models.some(
      (model) => model.id === contribution.model,
    )
  ) {
    throw new Error(
      'Active model is absent from the runtime provider catalog.',
    );
  }

  const provider = { ...(canonical.provider ?? {}) };

  provider[contribution.provider.id] = {
    npm: '@ai-sdk/openai-compatible',
    name: contribution.provider.label,
    options: { baseURL: contribution.provider.baseUrl },
    models: Object.fromEntries(
      contribution.provider.models.map((model) => [
        model.id,
        { name: model.label },
      ]),
    ),
  };

  const runtime: RawOpencodeConfig = {
    ...canonical,
    provider,
    enabled_providers: [contribution.provider.id],
    model: runtimeModelId(contribution),
    small_model: runtimeModelId(contribution),
  };

  const disabled = Array.isArray(canonical.disabled_providers)
    ? canonical.disabled_providers.filter(
        (id) => id !== contribution.provider.id,
      )
    : undefined;

  if (disabled?.length) {
    runtime.disabled_providers = disabled;
  } else {
    delete runtime.disabled_providers;
  }

  return runtime;
}

export async function materializeOpencodeRuntimeConfig(
  workspaceRoot: string,
  contribution: AiModelRuntimeConfig,
): Promise<boolean> {
  return withWorkspaceLock(workspaceRoot, async () => {
    const canonical = await readCanonicalOpencodeConfig(workspaceRoot);

    return materializeConfig(
      workspaceRoot,
      contribution.kind === 'canonical-model'
        ? canonical
        : composeOpencodeRuntimeConfig(canonical, contribution),
    );
  });
}
