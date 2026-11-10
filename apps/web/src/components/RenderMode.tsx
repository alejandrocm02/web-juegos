import { Component, Suspense, type ReactNode } from 'react';
import { fallBackTo2D, setRenderMode, useRenderMode } from '../lib/renderMode.js';

/**
 * Envoltorio de una vista 3D: mientras descarga su código se ve `loading`, y
 * si la descarga o el render fallan, la sesión vuelve a la vista 2D en lugar
 * de dejar el tablero en blanco. La partida no se entera: sigue en el servidor.
 */
export class Board3D extends Component<
  { loading: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    fallBackTo2D('error al cargar la vista 3D');
    console.error('[3d]', error);
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.loading;
    return <Suspense fallback={this.props.loading}>{this.props.children}</Suspense>;
  }
}

/** Botón para alternar 2D y 3D, con el aviso de por qué se volvió a 2D. */
export function RenderModeToggle() {
  const render = useRenderMode();
  if (!render.available) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        className="btn-ghost min-h-11 px-3 text-xs"
        aria-pressed={render.mode === '3d'}
        onClick={() => setRenderMode(render.mode === '3d' ? '2d' : '3d')}
      >
        {render.mode === '3d' ? 'Volver a la vista 2D' : 'Probar la vista 3D (beta)'}
      </button>
      <span role="status" className="text-slate-400">
        {render.fallback ? `Vista 2D: ${render.fallback}.` : ''}
      </span>
    </div>
  );
}
