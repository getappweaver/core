import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { OperationCounters, Proof } from '@cashu/cashu-ts';
import { bytesToHex } from '@noble/hashes/utils.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Database } from 'bun:sqlite';

import { log } from '../logger';
import type { Brand } from '../types';

import { normalizeMintUrl } from './mint-url';
import type { WalletInfo } from './types';

export type WalletDb = Brand<Database, 'WalletDb'>;

const CASHU_WALLET_DIR = join(homedir(), '.cashu-wallet');

function ensureWalletDir(): void {
  if (!existsSync(CASHU_WALLET_DIR)) {
    mkdirSync(CASHU_WALLET_DIR, { recursive: true });
  }
}

export function getWalletDbPath(mnemonic: string): string {
  const entropy = bip39.mnemonicToEntropy(mnemonic, wordlist);
  const fingerprint = bytesToHex(entropy).slice(0, 8);

  const walletDbPath = join(CASHU_WALLET_DIR, `wallet-${fingerprint}.sqlite`);

  log.info(`Wallet DB path: ${walletDbPath}`);

  return walletDbPath;
}

export function openWalletDb(mnemonic: string): WalletDb {
  ensureWalletDir();
  const dbPath = getWalletDbPath(mnemonic);
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS proofs (
      secret TEXT PRIMARY KEY,
      keyset_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      C TEXT NOT NULL,
      mint TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_proofs_keyset_id ON proofs (keyset_id)
  `);

  const counterColumns = db.prepare('PRAGMA table_info(counters)').all() as {
    name: string;
  }[];

  if (
    counterColumns.length > 0 &&
    !counterColumns.some((column) => column.name === 'mint')
  ) {
    db.run('ALTER TABLE counters RENAME TO counters_legacy_keyset_only');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      mint TEXT NOT NULL,
      keyset_id TEXT NOT NULL,
      next INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (mint, keyset_id)
    )
  `);

  const legacyColumns = db
    .prepare('PRAGMA table_info(counters_legacy_keyset_only)')
    .all() as { name: string }[];

  if (legacyColumns.some((column) => column.name === 'keyset_id')) {
    db.run(`
      INSERT OR IGNORE INTO counters (mint, keyset_id, next)
      SELECT '', keyset_id, next FROM counters_legacy_keyset_only
    `);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_log (
      id        INTEGER PRIMARY KEY,
      ts        INTEGER NOT NULL, -- unix milliseconds
      mint_url  TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('in', 'out')),
      amount    INTEGER NOT NULL,
      fee       INTEGER NOT NULL,
      token     TEXT NOT NULL
    )
  `);

  return db as WalletDb;
}

export type CashuMintResult = {
  mint: string;
  total_amount: number;
};

export function getCashuMints(db: WalletDb): CashuMintResult[] {
  return db
    .prepare(
      `
        SELECT mint, SUM(total_amount) as total_amount
        FROM (
          SELECT mint, SUM(amount) as total_amount FROM proofs GROUP BY mint
          UNION ALL
          SELECT mint_url as mint, 0 as total_amount FROM wallet_log GROUP BY mint_url
        )
        GROUP BY mint
        ORDER BY mint
      `,
    )
    .all() as CashuMintResult[];
}

export function loadProofs(db: WalletDb, mintUrl: string): Proof[] {
  const rows = db
    .prepare(
      'SELECT keyset_id, amount, secret, C, mint, updatedAt FROM proofs WHERE mint = ?',
    )
    .all(mintUrl) as {
    keyset_id: string;
    amount: number;
    secret: string;
    C: string;
    mint: string;
    updatedAt: number;
  }[];

  return rows.map((row) => ({
    id: row.keyset_id,
    amount: row.amount,
    secret: row.secret,
    C: row.C,
    mint: row.mint,
    updatedAt: row.updatedAt,
  }));
}

export async function getBalanceByMint(
  walletDb: WalletDb,
  mintUrl: string,
): Promise<WalletInfo> {
  const proofs = loadProofs(walletDb, mintUrl);

  log.info(`Total balance on mint ${mintUrl}: ${totalBalance(proofs)} sats`);

  const byKeyset: Record<string, { count: number; sats: number }> = {};
  for (const p of proofs) {
    if (!byKeyset[p.id]) {
      byKeyset[p.id] = { count: 0, sats: 0 };
    }

    byKeyset[p.id].count++;
    byKeyset[p.id].sats += p.amount;
  }

  for (const [id, info] of Object.entries(byKeyset)) {
    log.info(`  keyset ${id}: ${info.count} proof(s) = ${info.sats} sats`);
  }

  return { balanceSats: totalBalance(proofs) };
}

export function saveProofs(
  db: WalletDb,
  mintUrl: string,
  proofs: Proof[],
): void {
  const now = Date.now();

  const insert = db.prepare(`
    INSERT OR REPLACE INTO proofs (secret, keyset_id, amount, C, mint, updatedAt) 
    VALUES ($secret, $keyset_id, $amount, $C, $mint, $updatedAt)
  `);

  const insertMany = db.transaction((ps: Proof[]) => {
    for (const p of ps) {
      insert.run({
        $secret: p.secret,
        $keyset_id: p.id,
        $amount: p.amount,
        $C: p.C,
        $mint: mintUrl,
        $updatedAt: now,
      });
    }
  });

  insertMany(proofs);

  log.ok(`Saved ${proofs.length} proof(s) to DB for mint ${mintUrl}`);
}

export function deleteProofs(db: WalletDb, proofs: Proof[]): void {
  if (proofs.length === 0) {
    return;
  }

  const stmt = db.prepare('DELETE FROM proofs WHERE secret = ?');
  for (const proof of proofs) {
    stmt.run(proof.secret);
  }
}

export function totalBalance(proofs: Proof[]): number {
  return proofs.reduce((sum, p) => sum + p.amount, 0);
}

export function loadCounters(
  db: WalletDb,
  mintUrl: string,
): Record<string, number> {
  const normalizedMintUrl = normalizeMintUrl(mintUrl);

  const filteredRows = db
    .query(
      `
        SELECT keyset_id, MAX(next) as next
        FROM counters
        WHERE mint IN (?, '')
        GROUP BY keyset_id
      `,
    )
    .all(normalizedMintUrl) as {
    keyset_id: string;
    next: number;
  }[];

  const counters: Record<string, number> = {};

  for (const row of filteredRows) {
    counters[row.keyset_id] = row.next;
  }

  log.info(`Loaded counters: ${JSON.stringify(counters)}`);

  return counters;
}

export type WalletCounterRow = {
  mint: string;
  keyset_id: string;
  next: number;
};

export function getWalletCounterRows(db: WalletDb): WalletCounterRow[] {
  return db
    .prepare(
      `
        SELECT mint, keyset_id, next
        FROM counters
        WHERE mint != ''
        ORDER BY mint, keyset_id
      `,
    )
    .all() as WalletCounterRow[];
}

type UpsertWalletCounterRowsProps = {
  db: WalletDb;
  rows: WalletCounterRow[];
};

export function upsertWalletCounterRows({
  db,
  rows,
}: UpsertWalletCounterRowsProps): void {
  const stmt = db.prepare(`
    INSERT INTO counters (mint, keyset_id, next)
    VALUES ($mint, $keyset_id, $next)
    ON CONFLICT(mint, keyset_id) DO UPDATE SET next = MAX(next, excluded.next)
  `);

  const insertMany = db.transaction((counterRows: WalletCounterRow[]) => {
    for (const row of counterRows) {
      stmt.run({
        $mint: normalizeMintUrl(row.mint),
        $keyset_id: row.keyset_id,
        $next: row.next,
      });
    }
  });

  insertMany(rows);
}

type PersistCounterProps = {
  db: WalletDb;
  mintUrl: string;
  op: OperationCounters;
};

export function persistCounter({ db, mintUrl, op }: PersistCounterProps): void {
  const normalizedMintUrl = normalizeMintUrl(mintUrl);

  // OperationCounters = { keysetId: string, start: number, count: number, next: number }
  // `next` is the value to use for the NEXT operation — always persist this.
  log.info(
    `  countersReserved: mint=${normalizedMintUrl} keyset=${op.keysetId} start=${op.start} count=${op.count} next=${op.next}`,
  );

  db.run(
    'INSERT OR REPLACE INTO counters (mint, keyset_id, next) VALUES (?, ?, ?)',
    [normalizedMintUrl, op.keysetId, op.next],
  );

  log.ok(`  Counter for ${op.keysetId} persisted → next=${op.next}`);
}

export function bumpCounters(db: WalletDb, mintUrl: string): void {
  db.run("UPDATE counters SET next = next + 1 WHERE mint IN (?, '')", [
    normalizeMintUrl(mintUrl),
  ]);
}

export type WalletHistoryRow = {
  ts: number;
  mint_url: string;
  operation: 'in' | 'out';
  amount: number;
  fee: number;
  token: string;
};

type LogWalletOperationProps = Omit<WalletHistoryRow, 'ts'> & {
  ts: number | null;
};

export function logWalletOperation(
  db: WalletDb,
  props: LogWalletOperationProps,
): void {
  const { ts, mint_url, operation, amount, fee, token } = props;

  db.run(
    'INSERT INTO wallet_log (ts, mint_url, operation, amount, fee, token) VALUES (?, ?, ?, ?, ?, ?)',
    [ts ?? Date.now(), mint_url, operation, amount, fee, token],
  );
}

export function getWalletHistory(db: WalletDb, limit = 20): WalletHistoryRow[] {
  return db
    .prepare(
      'SELECT ts, mint_url, operation, amount, fee, token FROM wallet_log ORDER BY ts DESC LIMIT ?',
    )
    .all(limit) as WalletHistoryRow[];
}
