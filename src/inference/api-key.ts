import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  getState,
  setState,
  STATE_INFERENCE_API_KEY_HASH,
  type CoreDb,
} from '../db';

function hashApiKey(apiKey: string): Buffer {
  return createHash('sha256').update(apiKey).digest();
}

export function rotateInferenceApiKey(db: CoreDb): string {
  const apiKey = `aw_${randomBytes(32).toString('base64url')}`;

  setState(
    db,
    STATE_INFERENCE_API_KEY_HASH,
    hashApiKey(apiKey).toString('hex'),
  );

  return apiKey;
}

export function verifyInferenceApiKey(
  db: CoreDb,
  providedApiKey: string | null,
): boolean {
  const storedHash = getState(db, STATE_INFERENCE_API_KEY_HASH);

  if (!providedApiKey || !storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) {
    return false;
  }

  return timingSafeEqual(
    hashApiKey(providedApiKey),
    Buffer.from(storedHash, 'hex'),
  );
}
