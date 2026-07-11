import type { AuditLogEntry, AuthUser, Paginated } from '../../shared/types.js';
import { auditRepository } from './storage/index.js';

/** Who performed the action - id (joins to users) plus the readable username. */
type Actor = Pick<AuthUser, 'id' | 'username'>;

// U+FFFD replacement char for stripped control chars - built from a code point
// to keep the source ASCII (a literal or escape would land a non-ascii byte).
const replacementChar = String.fromCodePoint(0xfffd);

/** Replace C0 control chars (0x00-0x1F) and DEL (0x7F) with the replacement
 * char so a value can never forge a second log line. Applied to the
 * human-readable console line only - the SQL store is parameterized, so it is
 * injection-proof by construction and keeps the raw value. */
function sanitize(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    out += c <= 0x1f || c === 0x7f ? replacementChar : value[i];
  }
  return out;
}

/**
 * Record an audit event: who did what, and to what.
 *  - Console: one sanitized human-readable line (eyeballing during the event).
 *  - SQL audit_log table: the structured, parameterized record (durable,
 *    queryable, injection-proof by construction - a newline in `target` is just
 *    data in its own column, never a forged second row).
 * Best-effort: a persist failure falls back to console.error and NEVER breaks
 * the request - audit must not take the audited action down with it.
 */
export function audit(actor: Actor, action: string, target: string): void {
  const ts = new Date().toISOString();
  console.log(
    `[audit] ${ts} actor=${sanitize(actor.id)} user=${sanitize(actor.username)} action=${sanitize(action)} target=${sanitize(target)}`,
  );
  // Fire-and-forget: append to the durable store. node:sqlite is synchronous, so
  // the INSERT lands during this call; the .catch only surfaces a persist error.
  void auditRepository
    .append({ ts, actorId: actor.id, username: actor.username, action, target })
    .catch((err: unknown) => console.error('[audit] persist failed:', err));
}

/** Newest-first paginated audit rows for the admin viewer. */
export async function listAudit(page: number, pageSize: number): Promise<Paginated<AuditLogEntry>> {
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    auditRepository.list(pageSize, offset),
    auditRepository.count(),
  ]);
  return { items, total, page, pageSize };
}
