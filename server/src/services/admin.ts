import type { AdminUserView, Paginated, Role } from '../../../shared/types.js';
import { userRepository } from '../storage/index.js';
import { toAdminUserView } from '../storage/mapping.js';
import { AppError, requireFound } from '../errors.js';
import { withMutationLock } from './mutationLock.js';

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
export async function listUsers(query: ListUsersQuery): Promise<Paginated<AdminUserView>> {
  const q = query.q?.trim().toLowerCase();
  const all = await userRepository.listAll();

  const filtered = q ? all.filter((u) => u.usernameLower.includes(q)) : all;
  filtered.sort((a, b) => {
    const byName = a.username.localeCompare(b.username);
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });

  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize).map(toAdminUserView);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** The actor must STILL be an active admin at the moment the mutation runs.
 * requireAdmin checked before the request queued on the mutation lock; another
 * admin may have deactivated/demoted the actor while it waited — without this
 * re-check the parked mutation would still land. */
async function assertActorIsActiveAdmin(actorId: string): Promise<void> {
  const actor = await userRepository.getById(actorId);
  if (!actor || !actor.active || actor.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'Admin role required.', 403);
  }
}

/** Refuse an action that would drop the LAST active admin. Shared by update
 * (demote/deactivate) and delete; the caller decides whether its action removes
 * an active admin and supplies the verb for the message. */
async function assertNotLastActiveAdmin(removesActiveAdmin: boolean, message: string): Promise<void> {
  if (removesActiveAdmin && (await userRepository.countActiveAdmins()) <= 1) {
    throw new AppError('LAST_ADMIN', message, 409);
  }
}

/** Admin: patch a user's active/role. Self-lockout and last-admin guards run
 * here, inside the mutation lock, atomically with the write. */
export function updateUser(
  id: string,
  actorId: string,
  patch: { active?: boolean; role?: Role },
): Promise<AdminUserView> {
  return withMutationLock(async () => {
    await assertActorIsActiveAdmin(actorId);
    const user = requireFound(await userRepository.getById(id), 'User not found.');

    const willBeActive = patch.active ?? user.active;
    const willBeRole = patch.role ?? user.role;
    const losesAdmin = user.role === 'admin' && user.active && (willBeRole !== 'admin' || !willBeActive);

    if (id === actorId && losesAdmin) {
      throw new AppError('SELF_LOCKOUT', 'You cannot demote or deactivate your own admin account.', 400);
    }
    await assertNotLastActiveAdmin(losesAdmin, 'Cannot remove the last active admin.');
    return toAdminUserView(await userRepository.update(id, patch));
  });
}

/** Admin: delete a user (guards as in updateUser; cannot delete yourself). */
export function deleteUser(id: string, actorId: string): Promise<void> {
  return withMutationLock(async () => {
    await assertActorIsActiveAdmin(actorId);
    const user = requireFound(await userRepository.getById(id), 'User not found.');
    if (id === actorId) {
      throw new AppError('SELF_LOCKOUT', 'You cannot delete your own account.', 400);
    }
    await assertNotLastActiveAdmin(user.role === 'admin' && user.active, 'Cannot delete the last active admin.');
    await userRepository.remove(id);
  });
}
