import { memo } from 'react';
import { useNotices } from '../store.js';
import { ErrorBanner, Toasts } from './ui.js';

/**
 * Avisos que se pintan por encima de todo.
 *
 * Leen el contexto de avisos por su cuenta en lugar de recibirlo por props.
 * Asi un `game:state` a dos por segundo no los re-renderiza: solo cambian
 * cuando cambia realmente un aviso o un error.
 */

export const ToastStack = memo(function ToastStack() {
  const { toasts } = useNotices();
  return <Toasts toasts={toasts} />;
});

/** Banda de error flotante durante la partida, donde no hay hueco en el flujo. */
export const FloatingErrorBanner = memo(function FloatingErrorBanner() {
  const { error, dismissError } = useNotices();
  if (!error) return null;
  return (
    <div className="fixed left-1/2 top-20 z-[60] w-[min(92vw,42rem)] -translate-x-1/2">
      <ErrorBanner error={error} onDismiss={dismissError} />
    </div>
  );
});
