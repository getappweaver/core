import { randomBytes, timingSafeEqual } from 'crypto';

export function createSetupSecret(): string {
  const fromEnv = process.env.SETUP_SECRET?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  return randomBytes(32).toString('base64url');
}

export function isSetupSecretValid(
  provided: string | null,
  expected: string,
): boolean {
  if (!provided || provided.length === 0) {
    return false;
  }

  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(providedBytes, expectedBytes);
}
