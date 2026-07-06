import { useCallback, useEffect, useState } from 'react';
import type { AuditLogEntry } from '../../../../../shared/types';
import { adminApi } from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { useI18n } from '../../../i18n';

/** Loads the audit trail once on mount (not socket-fed). All state lives here so
 * the component renders only. */
export function useAdminAudit() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries((await adminApi.listAudit()).entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('adminAudit.errorLoad'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, error };
}
