import type { SonglessPublicState } from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { Panel, PlayerIconGlyph, ProgressBar, Scoreboard } from '../components/ui.js';
import { playSonglessClip } from '../lib/songless-audio.js';
import { useApp } from '../store.js';

const ANSWER_KEYS = ['A', 'B', 'C', 'D'] as const;

export default function SonglessView({ state }: { state: SonglessPublicState }) {
  const { room, session, sendAction, pushToast } = useApp();
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopAudio = useRef<(() => void) | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPicked(null);
    stopAudio.current?.();
    stopAudio.current = null;
    setPlaying(false);
  }, [state.roundIndex]);

  useEffect(
    () => () => {
      stopAudio.current?.();
    },
    [],
  );

  const remaining = Math.max(0, state.deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  const answered = new Set(state.answeredPlayerIds);
  const alreadyAnswered = session ? answered.has(session.playerId) : false;
  const myBreakdown = state.breakdown.find((entry) => entry.playerId === session?.playerId) ?? null;
  const visibleNotes = state.track?.notes ?? [];

  const play = async () => {
    if (!state.track || playing) return;
    stopAudio.current?.();
    try {
      setPlaying(true);
      stopAudio.current = await playSonglessClip(state.track.notes, state.track.bpm);
      const stepMs = (60 / state.track.bpm) * 500;
      window.setTimeout(() => setPlaying(false), state.track.notes.length * stepMs + 350);
    } catch {
      setPlaying(false);
      pushToast('El navegador no pudo iniciar el audio. Revisa que el sonido esté activado.');
    }
  };

  const choose = (answerIndex: number) => {
    if (state.phase !== 'listening' || picked !== null || alreadyAnswered) return;
    setPicked(answerIndex);
    sendAction({ type: 'songless:answer', roundIndex: state.roundIndex, answerIndex });
  };

  if (state.phase === 'countdown') {
    return (
      <div className="mx-auto w-full max-w-4xl px-3 py-10">
        <Panel className="overflow-hidden text-center">
          <p className="eyebrow text-violet-300">Calibra el oído</p>
          <p className="mt-5 font-display text-7xl font-black text-violet-200">{seconds}</p>
          <h2 className="mt-3 font-display text-2xl font-bold">Primer fragmento en camino</h2>
          <p className="mt-2 text-sm text-slate-400">
            El audio se genera en tu navegador. Pulsa reproducir cuando aparezca la ronda.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-4">
        <Panel className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative">
            <div className="game-hud mb-5">
              <span className="hud-stat">
                <span className="hud-stat-label">Melodía</span>
                <span className="hud-stat-value">
                  {state.roundIndex + 1} / {state.totalRounds}
                </span>
              </span>
              <span className="hud-stat">
                <span className="hud-stat-label">Fragmento</span>
                <span className="hud-stat-value text-violet-200">
                  {state.phase === 'reveal'
                    ? 'Completo'
                    : state.clipLevel + '/' + state.maxClipLevel}
                </span>
              </span>
              <span className="ml-auto hud-stat">
                <span className="hud-stat-label">Tiempo</span>
                <span
                  className={'hud-stat-value tabular-nums ' + (seconds <= 4 ? 'text-rose-300' : '')}
                >
                  {seconds}s
                </span>
              </span>
            </div>
            <ProgressBar
              value={
                state.phase === 'reveal'
                  ? remaining / 3_800
                  : remaining /
                    ((state.mode === 'relampago'
                      ? 3_000
                      : state.mode === 'oido-fino'
                        ? 12_000
                        : 5_000) *
                      state.maxClipLevel)
              }
              color="#b16cff"
            />

            <div className="my-7 rounded-[1.5rem] border border-violet-300/15 bg-[radial-gradient(circle_at_center,rgba(124,58,237,.2),rgba(3,7,18,.88))] px-4 py-8 text-center">
              <div
                className="mx-auto flex h-24 max-w-xl items-center justify-center gap-1"
                aria-hidden="true"
              >
                {visibleNotes.map((note, index) => (
                  <span
                    key={index}
                    className={
                      'w-2 rounded-full transition-all duration-300 ' +
                      (playing ? 'animate-pulse' : '')
                    }
                    style={{
                      height: note === null ? 8 : 24 + ((note - 58) % 12) * 4,
                      background: note === null ? '#334155' : index % 2 ? '#d946ef' : '#8b5cf6',
                      animationDelay: index * 45 + 'ms',
                      boxShadow: note === null ? 'none' : '0 0 14px rgba(177,108,255,.45)',
                    }}
                  />
                ))}
              </div>
              <button
                className="btn-primary mt-5 min-w-52"
                onClick={play}
                disabled={!state.track || playing}
              >
                {playing
                  ? 'Reproduciendo…'
                  : state.phase === 'reveal'
                    ? 'Reproducir completa'
                    : 'Escuchar fragmento'}
              </button>
              <p className="mt-3 text-xs text-slate-500">
                {state.phase === 'listening'
                  ? state.maxClipLevel === 1
                    ? 'Oído fino: estas cuatro notas son tu única pista.'
                    : 'Si esperas, el fragmento crecerá, pero valdrá menos puntos.'
                  : 'Melodía de dominio público recreada con síntesis local.'}
              </p>
            </div>

            {state.track && (
              <div className="grid gap-3 sm:grid-cols-2">
                {state.track.candidates.map((candidate, index) => {
                  const correct = state.correctIndex === index;
                  const selected = picked === index || myBreakdown?.answerIndex === index;
                  return (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => choose(index)}
                      disabled={state.phase !== 'listening' || picked !== null || alreadyAnswered}
                      className={
                        'quiz-answer group ' +
                        (state.phase === 'reveal' && correct
                          ? 'is-correct'
                          : state.phase === 'reveal' && selected
                            ? 'is-wrong'
                            : selected
                              ? 'is-selected'
                              : '')
                      }
                    >
                      <span className="quiz-answer-key">{ANSWER_KEYS[index]}</span>
                      <span>{candidate}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {state.phase === 'reveal' && state.correctIndex !== null && state.track && (
              <div className="mt-5 rounded-xl border border-violet-300/15 bg-violet-400/[0.07] p-4">
                <p className="text-sm text-slate-300">
                  Era{' '}
                  <strong className="text-violet-200">
                    {state.track.candidates[state.correctIndex]}
                  </strong>
                  {state.correctComposer ? ' · ' + state.correctComposer : ''}
                </p>
                {myBreakdown && (
                  <p
                    className={
                      'mt-1 text-sm ' + (myBreakdown.correct ? 'text-neon-lime' : 'text-rose-300')
                    }
                  >
                    {myBreakdown.correct
                      ? 'Acertaste con el fragmento ' +
                        myBreakdown.clipLevel +
                        ': +' +
                        myBreakdown.gained +
                        ' puntos'
                      : myBreakdown.answerIndex === null
                        ? 'No respondiste esta ronda.'
                        : 'Esta vez no era esa melodía.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Quién ya respondió"
          subtitle="Las elecciones permanecen ocultas hasta el final"
        >
          <div className="flex flex-wrap gap-2">
            {room?.players.map((player) => (
              <span
                key={player.id}
                className={
                  'chip ' + (answered.has(player.id) ? 'border-violet-300/50 text-violet-200' : '')
                }
              >
                <PlayerIconGlyph icon={player.icon} color={player.color} size={14} />
                {player.name} {answered.has(player.id) ? '· listo' : '· escuchando'}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Clasificación" subtitle="Reconocer antes vale más">
        <Scoreboard rows={state.scoreboard} />
        <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
          {state.mode === 'oido-fino' ? (
            <p>Fragmento único: hasta 500 pts</p>
          ) : (
            <>
              <p>Primer fragmento: hasta {state.mode === 'relampago' ? 400 : 350} pts</p>
              <p>Segundo: hasta {state.mode === 'relampago' ? 275 : 250} pts</p>
              <p>Completo: hasta 150 pts</p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
