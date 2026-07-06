import { AppError, AppErrorCode } from '../../errors.js';
import type { AuditEntry, AuditRepository } from '../contracts.js';
import type { AuditLogEntry } from '../../../../shared/types.js';
import type { SqliteContext } from './db.js';

/**
 * SQLite audit trail. Append-only with a DIRECT INSERT per record - NOT the
 * Map + rewrite-all persist the other repos use: the audit log only ever grows
 * and is never re-read by the app, so caching it in memory or rewriting the
 * whole table per write would be O(n) for nothing. Parameterized columns make
 * the structured record injection-proof by construction (a newline in `target`
 * is data, never a forged row); the human-readable console line sanitizes.
 */
export class SqliteAuditRepository implements AuditRepository {
  constructor(private ctx: SqliteContext) {}

  async append(entry: AuditEntry): Promise<void> {
    try {
      this.ctx.db
        .prepare(
          'INSERT INTO audit_log (ts, actorId, username, action, target) VALUES (?, ?, ?, ?, ?)',
        )
        .run(entry.ts, entry.actorId, entry.username, entry.action, entry.target);
    } catch (err) {
      // Map a raw driver failure to the storage error contract; the caller
      // (audit) swallows it, so the underlying cause rides the message.
      throw new AppError(
        AppErrorCode.StoreWriteFailed,
        `Could not append the audit record (${String(err)})`,
        500,
      );
    }
  }

  async list(limit: number): Promise<AuditLogEntry[]> {
    const rows = this.ctx.db
      .prepare(
        'SELECT id, ts, actorId, username, action, target FROM audit_log ORDER BY id DESC LIMIT ?',
      )
      .all(limit) as Array<{
      id: number;
      ts: string;
      actorId: string;
      username: string;
      action: string;
      target: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      actorId: r.actorId,
      username: r.username,
      action: r.action,
      target: r.target,
    }));
  }
}
