import { Router } from 'express';
import { listUsersQuerySchema, updateUserSchema } from '../../validation.js';
import { audit } from '../../audit.js';
import { deleteUser, listUsers, updateUser } from '../../services/admin.js';
import { disconnectUser } from '../../socket.js';
import { adminMutationLimiter } from './mutationLimiter.js';

/** Admin user management: list/search, role + active toggles, delete.
 * Mounted under /api/admin (auth applied once in the parent router). */
export const adminUsersRouter = Router();

adminUsersRouter.get('/users', (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid query.' } });
    return;
  }
  res.json(listUsers(parsed.data));
});

adminUsersRouter.patch('/users/:id', adminMutationLimiter, (req, res, next) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' } });
    return;
  }
  try {
    const actor = req.user!.id;
    const view = updateUser(req.params.id, actor, parsed.data);
    // Revocation: if we just deactivated them, cut their live sockets now.
    if (parsed.data.active === false) disconnectUser(req.params.id);
    audit(actor, `user.update(${JSON.stringify(parsed.data)})`, req.params.id);
    res.json({ user: view });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.delete('/users/:id', adminMutationLimiter, (req, res, next) => {
  try {
    const actor = req.user!.id;
    deleteUser(req.params.id, actor);
    disconnectUser(req.params.id); // revoke live sockets of the deleted user
    audit(actor, 'user.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
