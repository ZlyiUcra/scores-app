import { useCallback, useEffect, useState } from 'react';
import type { AuditLogEntry, Paginated } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { useI18n } from '../../../i18n';

const defaultPageSize = 20;

/** Loads a page of the audit trail (not socket-fed). All state lives here so
 * the component renders only. */
export function useAdminAudit() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [data, setData] = useState<Paginated<AuditLogEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.listAudit({ page, pageSize }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminAudit.errorLoad'));
    }
  }, [page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changing the page size always returns to the first page - otherwise a
  // mid-list page can land past the new total.
  function setPageSize(value: number) {
    setPage(1);
    setPageSizeState(value);
  }

  return { data, error, page, pageSize, setPage, setPageSize };
}
