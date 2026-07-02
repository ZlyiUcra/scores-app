/** Minimal audit trail. A file/DB-backed log is a documented fast-follow. */
export function audit(actor: string, action: string, target: string): void {
  console.log(`[audit] ${new Date().toISOString()} actor=${actor} action=${action} target=${target}`);
}
