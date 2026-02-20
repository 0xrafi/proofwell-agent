import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "agent.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      tx_hash TEXT,
      amount_usdc REAL DEFAULT 0,
      amount_eth REAL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS revenue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      tx_hash TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      category TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// Actions
export function logAction(
  type: string,
  description: string,
  txHash?: string,
  amountUsdc = 0,
  amountEth = 0,
  success = true
) {
  getDb()
    .prepare(
      `INSERT INTO actions (type, description, tx_hash, amount_usdc, amount_eth, success) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(type, description, txHash ?? null, amountUsdc, amountEth, success ? 1 : 0);
}

// Revenue
export function logRevenue(source: string, amountUsdc: number, txHash?: string, description?: string) {
  getDb()
    .prepare(`INSERT INTO revenue (source, amount_usdc, tx_hash, description) VALUES (?, ?, ?, ?)`)
    .run(source, amountUsdc, txHash ?? null, description ?? null);
}

// Costs
export function logCost(category: string, amountUsdc: number, description?: string) {
  getDb()
    .prepare(`INSERT INTO costs (category, amount_usdc, description) VALUES (?, ?, ?)`)
    .run(category, amountUsdc, description ?? null);
}

// State KV
export function getState(key: string): string | undefined {
  const row = getDb().prepare(`SELECT value FROM state WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setState(key: string, value: string) {
  getDb()
    .prepare(`INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
    .run(key, value);
}

// Queries
export function getTotalRevenue(): number {
  const row = getDb().prepare(`SELECT COALESCE(SUM(amount_usdc), 0) as total FROM revenue`).get() as { total: number };
  return row.total;
}

export function getTotalCosts(): number {
  const row = getDb().prepare(`SELECT COALESCE(SUM(amount_usdc), 0) as total FROM costs`).get() as { total: number };
  return row.total;
}

export function getRecentActions(limit = 50): Array<{
  id: number;
  timestamp: string;
  type: string;
  description: string;
  tx_hash: string | null;
  amount_usdc: number;
  amount_eth: number;
  success: number;
}> {
  return getDb()
    .prepare(`SELECT * FROM actions ORDER BY id DESC LIMIT ?`)
    .all(limit) as any;
}

export function getRevenueBySource(): Array<{ source: string; total: number }> {
  return getDb()
    .prepare(`SELECT source, SUM(amount_usdc) as total FROM revenue GROUP BY source ORDER BY total DESC`)
    .all() as any;
}

export function getCostsByCategory(): Array<{ category: string; total: number }> {
  return getDb()
    .prepare(`SELECT category, SUM(amount_usdc) as total FROM costs GROUP BY category ORDER BY total DESC`)
    .all() as any;
}
