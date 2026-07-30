import { GAME_META, GAME_IDS, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@arcade/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../store.js';
import { loadName } from '../lib/session.js';
import { ErrorBanner, GameIcon } from '../components/ui.js';

export default function HomeView() {
  const { createRoom, joinRoom, error, dismissError, connected } = useApp();
  const [name, setName] = useState(loadName());
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('code');
    if (invite) {
      setCode(invite.toUpperCase());
      setMode('join');
    }
  }, []);

  const nameValid = name.trim().length >= NAME_MIN_LENGTH && name.trim().length <= NAME_MAX_LENGTH;
  const codeValid = /^[A-Z0-9]{4,8}$/.test(code.trim().toUpperCase());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameValid) return;
    if (mode === 'create') createRoom(name.trim());
    else if (codeValid) joinRoom(code.trim().toUpperCase(), name.trim());
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <nav className="flex items-center justify-between border-b border-white/[0.07] pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-neon-cyan/25 bg-neon-cyan/10 font-display text-sm font-black text-neon-cyan shadow-glow">
            PA
          </span>
          <span className="font-display text-sm font-bold tracking-[-0.02em]">Parque Arcade</span>
        </div>
        <span className="chip">
          <span className={connected ? 'status-dot' : 'h-2 w-2 rounded-full bg-amber-400'} />
          {connected ? 'Servidor online' : 'Conectando'}
        </span>
      </nav>

      <section className="grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.15fr)_420px] lg:gap-16 lg:py-20">
        <header>
          <p className="eyebrow mb-5 flex items-center gap-3">
            <span className="h-px w-8 bg-neon-cyan/70" />
            Tu sala recreativa, estés donde estés
          </p>
          <h1 className="hero-title">
            La noche de juegos,
            <span className="text-gradient block">sin instalar nada.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            Reúne de 2 a 5 amigos en una sala privada y competid en {GAME_IDS.length} juegos en
            tiempo real. Un enlace, cero cuentas y toda la tensión de una recreativa.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
            {['Salas privadas', 'Multijugador en vivo', 'Móvil y escritorio'].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neon-lime/10 text-[10px] text-neon-lime">
                  ✓
                </span>
                {item}
              </span>
            ))}
          </div>
        </header>

        <form onSubmit={submit} className="card overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-neon-cyan/10 blur-3xl" />
          <div className="relative">
            <p className="eyebrow">Empieza una partida</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Entra al parque</h2>
            <p className="mb-6 mt-1 text-sm text-slate-500">
              Estaréis jugando en menos de un minuto.
            </p>
          </div>
          <ErrorBanner error={error} onDismiss={dismissError} />

          <div className="mb-5 flex rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={
                'flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition ' +
                (mode === 'create'
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300')
              }
            >
              Crear sala
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className={
                'flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition ' +
                (mode === 'join'
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300')
              }
            >
              Unirse
            </button>
          </div>

          <label className="label" htmlFor="name">
            Tu nombre
          </label>
          <input
            id="name"
            className="input"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Alejandro"
            autoComplete="nickname"
          />
          {!nameValid && name.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-300">
              Entre {NAME_MIN_LENGTH} y {NAME_MAX_LENGTH} caracteres.
            </p>
          )}

          {mode === 'join' && (
            <div className="mt-4">
              <label className="label" htmlFor="code">
                Codigo de sala
              </label>
              <input
                id="code"
                className="input font-display text-2xl uppercase tracking-[0.35em]"
                value={code}
                maxLength={8}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABC12"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary mt-6 w-full py-3"
            disabled={!connected || !nameValid || (mode === 'join' && !codeValid)}
          >
            {mode === 'create' ? 'Crear sala privada' : 'Entrar en la sala'}
          </button>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-600">
            Sin registro. Tu alias solo identifica esta partida.
          </p>
        </form>
      </section>

      <section aria-labelledby="games-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{GAME_IDS.length} maneras de ganar</p>
            <h2 id="games-heading" className="mt-1 font-display text-2xl font-bold sm:text-3xl">
              Elige tu terreno de juego
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Cada partida está validada por el servidor para que la victoria dependa de la habilidad,
            no de la conexión.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GAME_IDS.map((id) => (
            <article
              key={id}
              className="game-card flex min-h-52 flex-col justify-between"
              style={
                {
                  '--game-accent': GAME_META[id].accent,
                  '--game-glow': GAME_META[id].accent + '24',
                } as React.CSSProperties
              }
            >
              <div className="flex items-start justify-between">
                <span className="game-icon-shell">
                  <GameIcon game={id} />
                </span>
                <span className="font-display text-xs font-bold text-white/20">
                  0{GAME_IDS.indexOf(id) + 1}
                </span>
              </div>
              <div className="mt-8">
                <h3 className="font-display text-xl font-bold">{GAME_META[id].name}</h3>
                <p className="mt-1 text-sm text-slate-400">{GAME_META[id].tagline}</p>
                <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  <span
                    className="h-1 w-1 rounded-full"
                    style={{ background: GAME_META[id].accent }}
                  />
                  {id === 'golf'
                    ? '10 hoyos originales'
                    : id === 'quiz'
                      ? 'Bonus por rapidez'
                      : id === 'darts'
                        ? '301 · triples · bust'
                        : 'Física autoritativa'}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
