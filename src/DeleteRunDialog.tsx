import { t, presentText as tx, useLanguage } from './i18n';
import { useEffect, useRef } from 'react';
import { dateTime, statusLabels, type History } from './types';

export default function DeleteRunDialog({
  target,
  account,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target: History | null;
  account: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (target) ref.current?.showModal();
    else ref.current?.close();
  }, [target]);
  return (
    <dialog
      className="delete-run-dialog"
      ref={ref}
      aria-labelledby="delete-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h3 id="delete-title">{t('Hapus hasil analisis?')}</h3>
      {target && (
        <>
          <p>{account}</p>
          <p>
            {dateTime(target.created_at)} · {statusLabels[target.status]}
          </p>
        </>
      )}
      <p>
        {t(
          'Hasil dan log evaluasi lokal ini akan dihapus permanen. Dataset sumber tetap tersedia.',
        )}
      </p>
      {error && (
        <p className="delete-error" role="alert">
          {tx(error)}
        </p>
      )}
      <div className="delete-actions">
        <button autoFocus disabled={busy} onClick={onCancel}>
          {t('Batal') + ' '}
        </button>
        <button className="danger" disabled={busy} onClick={onConfirm}>
          {busy ? t('Menghapus…') : t('Hapus permanen')}
        </button>
      </div>
    </dialog>
  );
}
