import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Dialogo de confirmacion accesible.
 *
 * Se monta solo cuando hace falta, devuelve el foco al boton que lo abrio y
 * se cierra con Escape. No usa dependencias externas.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'neutral';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950 p-6 shadow-2xl"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-white">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-slate-300">
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={tone === 'danger' ? 'btn-danger min-h-11' : 'btn-primary min-h-11'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ExitAction {
  label: string;
  /** Texto del dialogo. Si falta, la accion se ejecuta sin confirmar. */
  confirm?: { title: string; description: string; confirmLabel: string };
  run: () => void;
}

/**
 * Boton de retroceso.
 *
 * No usa el historial del navegador: opera sobre el estado real de la sala, de
 * modo que abandonar una partida avisa al servidor y no deja jugadores fantasma.
 */
export function BackButton({ action, className = '' }: { action: ExitAction; className?: string }) {
  const [asking, setAsking] = useState(false);

  const trigger = useCallback(() => {
    if (action.confirm) setAsking(true);
    else action.run();
  }, [action]);

  return (
    <>
      <button
        type="button"
        onClick={trigger}
        aria-label={action.label}
        className={'btn-secondary min-h-11 min-w-11 gap-2 px-3 sm:px-4 ' + className}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">{action.label}</span>
      </button>

      {action.confirm && (
        <ConfirmDialog
          open={asking}
          title={action.confirm.title}
          description={action.confirm.description}
          confirmLabel={action.confirm.confirmLabel}
          onConfirm={() => {
            setAsking(false);
            action.run();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
