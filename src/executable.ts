import { accessSync, constants, existsSync } from 'fs';
import { delimiter, dirname, isAbsolute, join } from 'path';

function executableCandidates(name: string): string[] {
  if (process.platform !== 'win32') {
    return [name];
  }

  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean);

  const lowerName = name.toLowerCase();

  if (extensions.some((ext) => lowerName.endsWith(ext.toLowerCase()))) {
    return [name];
  }

  return [name, ...extensions.map((ext) => `${name}${ext}`)];
}

function canExecute(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  if (process.platform === 'win32') {
    return true;
  }

  try {
    accessSync(path, constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

export function findExecutablePath(name: string): string | null {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (isAbsolute(trimmed) || dirname(trimmed) !== '.') {
    return canExecute(trimmed) ? trimmed : null;
  }

  const pathEntries = (process.env.PATH ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const directory of pathEntries) {
    for (const candidate of executableCandidates(trimmed)) {
      const fullPath = join(directory, candidate);

      if (canExecute(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}
