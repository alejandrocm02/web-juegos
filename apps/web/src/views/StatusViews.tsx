export function DisconnectedOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500/90 px-4 py-2 text-center text-sm font-semibold text-night-900">
      Conexion perdida. Reintentando... tu plaza se guarda unos segundos.
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="max-w-md text-slate-400">{description}</p>
    </main>
  );
}
