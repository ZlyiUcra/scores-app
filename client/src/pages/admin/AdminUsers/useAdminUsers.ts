import { useCallback, useEffect, useState } from 'react';
import type { AdminUserView, Paginated } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';

const defaultPageSize = 20;

/**
 * All behavior and state for the AdminUsers panel, kept out of the component
 * so it renders only. Owns the paginated search, the per-row action runner
 * (activate/deactivate, promote/demote, delete) and the delete confirm. This
 * data is not socket-fed, so every action refetches the page it acted on.
 */
export function useAdminUsers() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [data, setData] = useState<Paginated<AdminUserView> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.listUsers({ q: q.trim() || undefined, page, pageSize }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errorLoad'));
    }
  }, [q, page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminUsers.errorAction'));
    } finally {
      setBusyId(null);
    }
  }

  // Typing in the search box, or changing the page size, always returns to
  // the first page - otherwise a mid-list page can land past the new total.
  function search(value: string) {
    setPage(1);
    setQ(value);
  }

  function setPageSize(value: number) {
    setPage(1);
    setPageSizeState(value);
  }

  const toggleActive = (u: AdminUserView) =>
    act(u.id, () => adminApi.updateUser(u.id, { active: !u.active }));
  const toggleRole = (u: AdminUserView) =>
    act(u.id, () => adminApi.updateUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }));

  // Delete is gated by a confirm modal: the row button only stages the id, and
  // the component renders <ConfirmDialog {...deleteConfirm} /> while pending.
  const { request, dialog: deleteConfirm } = useConfirmDialog();
  const requestDelete = (id: string) =>
    request({ message: t('common.deleteConfirm'), tone: 'danger', onConfirm: () => act(id, () => adminApi.deleteUser(id)) });

  return {
    data,
    error,
    busyId,
    q,
    page,
    pageSize,
    search,
    setPage,
    setPageSize,
    toggleActive,
    toggleRole,
    requestDelete,
    deleteConfirm,
  };
}
