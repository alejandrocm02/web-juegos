import { GAME_META, GAME_IDS, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@arcade/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../store.js';
import { loadName } from '../lib/session.js';
import { ErrorBanner } from '../components/ui.js';

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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <p className="chip mb-4">Sala recreativa online</p>
        <h1 className="font-display text-4xl font-black tracking-tight sm:text-6xl">
          Parque <span className="text-neon-cyan">Arcade</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          Cuatro minijuegos para jugar con amigos, cada uno desde su ordenador. Crea una sala,
          comparte el codigo y a jugar.
        </p>
      </header>

      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <form onSubmit={submit} className="card">
          <ErrorBanner error={error} onDismiss={dismissError} />

          <div className="mb-4 flex rounded-xl border border-white/10 bg-night-900/60 p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ' +
                (mode === 'create' ? 'bg-neon-cyan text-night-900' : 'text-slate-300')
              }
            >
              Crear sala
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className={
                'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ' +
                (mode === 'join' ? 'bg-neon-cyan text-night-900' : 'text-slate-300')
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
            className="btn-primary mt-6 w-full"
            disabled={!connected || !nameValid || (mode === 'join' && !codeValid)}
          >
            {mode === 'create' ? 'Crear sala privada' : 'Entrar en la sala'}
          </button>

          <p className="mt-3 text-center text-xs text-slate-500">
            {connected ? 'Conectado al servidor' : 'Conectando con el servidor...'}
          </p>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          {GAME_IDS.map((id) => (
            <article
              key={id}
              className="card flex flex-col justify-between"
              style={{ borderColor: GAME_META[id].accent + '33' }}
            >
              <div>
                <span
                  className="chip mb-3"
                  style={{ color: GAME_META[id].accent, borderColor: GAME_META[id].accent + '55' }}
                >
                  {GAME_META[id].name}
                </span>
                <p className="text-sm text-slate-300">{GAME_META[id].tagline}</p>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {id === 'golf'
                  ? '10 hoyos originales, colisiones opcionales y hoyo en uno'
                  : id === 'quiz'
                    ? '10 preguntas en espanol con bonus por rapidez'
                    : id === 'darts'
                      ? 'Modalidad 301 con dobles, triples y bust'
                      : 'Fisica de bolas, troneras y turnos'}
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
