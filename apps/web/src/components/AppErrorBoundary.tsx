import React from 'react';

interface State {
  failed: boolean;
}

/**
 * Un error de renderizado no debe dejar al jugador ante un fondo vacío.
 * La recarga conserva el token de la sala y permite que el servidor lo readmita.
 */
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="eyebrow">La partida sigue guardada</p>
        <h1 className="font-display text-3xl font-black">No hemos podido mostrar esta pantalla</h1>
        <p className="max-w-md text-slate-400">
          Recarga la interfaz para volver a conectarte a la misma sala.
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Recuperar partida
        </button>
      </main>
    );
  }
}
