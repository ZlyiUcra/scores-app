import type { AdminUserView, Paginated, Role } from '../../../shared/types.js';
import { toAdminView, userRepository } from '../repos/users.js';

/** Validated query for the paginated admin user list (q = username filter). */
export interface ListUsersQuery {
  q?: string;
  page: number;
  pageSize: number;
}

/**
 * Admin user listing — a COLD path (admin-only, human-triggered), so a plain
 * in-memory filter + stable sort + slice is fine at this scale. Sort is stable
 * by (username, id) so pages don't reorder between requests.
 */
export function listUsers(query: ListUsersQuery): Paginated<AdminUserView> {
  const q = query.q?.trim().toLowerCase();
  const all = userRepository.listAll();

  const filtered = q ? all.filter((u) => u.usernameLower.includes(q)) : all;
  filtered.sort((a, b) => {
    const byName = a.username.localeCompare(b.username);
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });

  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize).map(toAdminView);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Admin: patch a user's active/role. Self-lockout and last-admin guards live
 * in the repository, atomically with the write. */
export function updateUser(
  id: string,
  actorId: string,
  patch: { active?: boolean; role?: Role },
): AdminUserView {
  return toAdminView(userRepository.update(id, actorId, patch));
}

/** Admin: delete a user (guards as in updateUser; cannot delete yourself). */
export function deleteUser(id: string, actorId: string): void {
  userRepository.remove(id, actorId);
}
