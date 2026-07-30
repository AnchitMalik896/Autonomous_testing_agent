/**
 * Read-only DB oracle (RS-3, DB-1). The real enforcement is the SELECT-only DB role;
 * this wrapper is belt-and-suspenders: it rejects anything that isn't a plain read
 * before it ever reaches the driver, so a bug in an authored spec fails loudly here.
 */
import { Pool } from 'pg';

const READ_START = /^\s*(select|with|show|explain)\b/i;
const WRITE_WORDS = /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy|vacuum|call|do)\b/i;

export class ReadOnlyDb {
  constructor(private pool: Pool) {}

  private guard(sql: string): void {
    const body = sql.replace(/;\s*$/, '');
    if (!READ_START.test(body)) {
      throw new Error(`ReadOnlyDb: non-SELECT statement rejected (DB-1): ${body.slice(0, 80)}`);
    }
    if (WRITE_WORDS.test(body)) {
      throw new Error(`ReadOnlyDb: statement contains a write keyword, rejected (DB-1): ${body.slice(0, 80)}`);
    }
    if (body.includes(';')) {
      throw new Error('ReadOnlyDb: multi-statement SQL rejected (DB-1)');
    }
  }

  async many<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.guard(sql);
    const res = await this.pool.query(sql, params as never[]);
    return res.rows as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.many<T>(sql, params);
    if (rows.length !== 1) {
      throw new Error(`ReadOnlyDb.one: expected exactly 1 row, got ${rows.length} — ${sql.slice(0, 80)}`);
    }
    return rows[0];
  }

  async maybeOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.many<T>(sql, params);
    if (rows.length > 1) {
      throw new Error(`ReadOnlyDb.maybeOne: expected 0 or 1 rows, got ${rows.length}`);
    }
    return rows[0] ?? null;
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

export function connectRO(): ReadOnlyDb {
  const url = process.env.DB_URL_RO;
  if (!url) throw new Error('DB_URL_RO not set — the DB oracle needs a SELECT-only connection string');
  return new ReadOnlyDb(new Pool({ connectionString: url, max: 2 }));
}
