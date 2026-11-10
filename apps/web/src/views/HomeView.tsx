import {
  GAME_META,
  GAME_IDS,
  GAME_MODE_CATALOG,
  type GameId,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  botRangeFor,
  defaultSoloConfig,
} from '@arcade/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../store.js';
import { loadName } from '../lib/session.js';
import { ErrorBanner, GameIcon } from '../components/ui.js';
import { GameScene } from '../components/GameScene.js';
import { SoloSetup, type SoloSetupValue } from './SoloSetup.js';
import { RecordsPanel } from './RecordsPanel.js';

type HomeMode = 'create' | 'join' | 'solo';

export default function HomeView() {
  const { createRoom, createSoloRoom, joinRoom, error, dismissError, connected, records } =
    useApp();
  const [name, setName] = useState(loadName());
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<HomeMode>('create');
  const [solo, setSolo] = useState<SoloSetupValue>({
    game: 'karts',
    config: defaultSoloConfig('karts'),
  });

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
    else if (mode === 'solo') {
      const range = botRangeFor(solo.game);
      createSoloRoom(name.trim(), solo.game, {
        ...solo.config,
        // Última red de seguridad: el servidor vuelve a acotarlo de todos modos.
        botCount: Math.min(range.max, Math.max(range.min, solo.config.botCount)),
      });
    } else if (codeValid) joinRoom(code.trim().toUpperCase(), name.trim());
  };

  /** Lleva al formulario con el modo ya elegido y el nombre listo para escribir. */
  const openForm = (next: HomeMode) => {
    setMode(next);
    const input = document.getElementById('name');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    input?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  /** Las máquinas de la portada abren la práctica de su juego. */
  const practice = (game: GameId) => {
    setSolo({ game, config: defaultSoloConfig(game) });
    openForm('solo');
  };

  const submitLabel =
    mode === 'create'
      ? 'Crear sala privada'
      : mode === 'solo'
        ? 'Empezar a practicar'
        : 'Entrar en la sala';

  return (
    <main className="arcade-home mx-auto min-h-screen w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
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

      <section className="arcade-hero grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.15fr)_420px] lg:gap-16 lg:py-20">
        <header>
          <p className="eyebrow mb-5 flex items-center gap-3">
            <span className="h-px w-8 flex-none bg-neon-cyan/70" />
            Tu sala recreativa, estés donde estés
          </p>
          <h1 className="hero-title">
            Entra en el arcade,
            <span className="text-gradient block">vive cada partida.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            Reúne de 2 a 5 amigos en una sala privada y competid en {GAME_IDS.length} juegos en
            tiempo real. Un enlace, cero cuentas y toda la tensión de una recreativa. ¿Estás solo?
            Practica cualquiera de los {GAME_IDS.length} contra rivales del servidor.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
            {['Salas privadas', 'Multijugador en vivo', 'Modo individual'].map((item) => (
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
              {mode === 'solo'
                ? 'Entrena a tu ritmo y bate tus propias marcas.'
                : 'Estaréis jugando en menos de un minuto.'}
            </p>
          </div>
          <ErrorBanner error={error} onDismiss={dismissError} />

          <div className="mb-5 flex rounded-xl border border-white/10 bg-black/20 p-1">
            {(
              [
                ['create', 'Crear sala'],
                ['join', 'Unirse'],
                ['solo', 'Practicar'],
              ] as [HomeMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={
                  'flex-1 rounded-lg px-2 py-2.5 text-sm font-bold transition ' +
                  (mode === id
                    ? 'bg-white/10 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-300')
                }
              >
                {label}
              </button>
            ))}
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

          {mode === 'solo' && (
            <div className="mt-5">
              <SoloSetup value={solo} records={records} onChange={setSolo} />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary mt-6 w-full py-3"
            disabled={!connected || !nameValid || (mode === 'join' && !codeValid)}
          >
            {submitLabel}
          </button>

          <p className="mt-4 text-center text-[11px] leading-5 text-slate-600">
            Sin registro. Tu alias solo identifica esta partida.
          </p>
        </form>
      </section>

      {records.length > 0 && (
        <section aria-labelledby="records-heading" className="mb-14">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Modo individual</p>
              <h2 id="records-heading" className="mt-1 font-display text-2xl font-bold sm:text-3xl">
                Tus marcas personales
              </h2>
            </div>
            <p className="max-w-md text-sm text-slate-500">
              Guardadas en este navegador con un identificador anónimo. Ni cuentas ni datos
              personales.
            </p>
          </div>
          <RecordsPanel records={records} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" />
        </section>
      )}

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

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {GAME_IDS.map((id, index) => (
            <article
              key={id}
              className="game-card arcade-machine flex flex-col"
              style={
                {
                  '--game-accent': GAME_META[id].accent,
                  '--game-glow': GAME_META[id].accent + '24',
                } as React.CSSProperties
              }
            >
              <div className="arcade-machine-screen">
                <GameScene game={id} />
                <span className="arcade-machine-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-3.5 sm:p-5">
                <h3 className="flex items-center gap-2 font-display text-base font-bold sm:text-xl">
                  <span className="arcade-machine-icon" aria-hidden="true">
                    <GameIcon game={id} />
                  </span>
                  <button
                    type="button"
                    className="arcade-machine-link"
                    onClick={() => practice(id)}
                  >
                    {GAME_META[id].name}
                    <span className="sr-only">: practicar en solitario</span>
                  </button>
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                  {GAME_META[id].tagline}
                </p>
                <p className="mt-auto hidden items-center gap-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:flex">
                  <span
                    className="h-1 w-1 flex-none rounded-full"
                    style={{ background: GAME_META[id].accent }}
                  />
                  <span className="truncate">
                    {GAME_MODE_CATALOG[id]
                      .slice(0, 3)
                      .map((entry) => entry.name)
                      .join(' · ')}
                  </span>
                </p>
              </div>
            </article>
          ))}

          <article
            className="game-card arcade-machine arcade-machine-extra flex flex-col justify-between p-3.5 sm:p-5"
            style={{ '--game-accent': '#a78bfa' } as React.CSSProperties}
          >
            <span className="arcade-machine-glyph" aria-hidden="true">
              ?
            </span>
            <div>
              <h3 className="font-display text-base font-bold sm:text-xl">
                <button
                  type="button"
                  className="arcade-machine-link"
                  onClick={() =>
                    practice(GAME_IDS[Math.floor(Math.random() * GAME_IDS.length)] ?? 'karts')
                  }
                >
                  Sorpréndeme
                </button>
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                ¿No sabes a qué jugar? Elegimos un juego al azar para practicar.
              </p>
            </div>
          </article>

          <article
            className="game-card arcade-machine arcade-machine-extra flex flex-col justify-between p-3.5 sm:p-5"
            style={{ '--game-accent': '#fbbf24' } as React.CSSProperties}
          >
            <span className="arcade-machine-glyph" aria-hidden="true">
              ★
            </span>
            <div>
              <h3 className="font-display text-base font-bold sm:text-xl">
                <button
                  type="button"
                  className="arcade-machine-link"
                  onClick={() => openForm('create')}
                >
                  Modo torneo
                </button>
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                De 3 a 5 pruebas encadenadas con clasificación general. Crea una sala y actívalo.
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
