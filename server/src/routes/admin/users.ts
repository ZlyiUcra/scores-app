import { Router } from 'express';
import { listUsersQuerySchema, parseOrThrow, updateUserSchema } from '../../validation.js';
import { AppError, AppErrorCode } from '../../errors.js';
import { audit } from '../../audit.js';
import { deleteUser, listUsers, updateUser } from '../../services/admin.js';
import { disconnectUser } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin user management: list/search, role + active toggles, delete.
 * Mounted under /api/admin (auth applied once in the parent router). */
export const adminUsersRouter = Router();

adminUsersRouter.get('/users', async (req, res, next) => {
  try {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(AppErrorCode.BadRequest, 'Invalid query.', 400);
    }
    res.json(await listUsers(parsed.data));
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.patch('/users/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const parsed = parseOrThrow(updateUserSchema, req.body, 'Invalid body.');
    const actor = req.user!.id;
    const view = await updateUser(req.params.id, actor, parsed);
    // Revocation: if we just deactivated them, cut their live sockets now.
    if (parsed.active === false) disconnectUser(req.params.id);
    audit(req.user!, `user.update(${JSON.stringify(parsed)})`, req.params.id);
    res.json({ user: view });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.delete('/users/:id', adminMutationLimiter, async (req, res, next) => {
  try {
    const actor = req.user!.id;
    await deleteUser(req.params.id, actor);
    disconnectUser(req.params.id); // revoke live sockets of the deleted user
    audit(req.user!, 'user.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
