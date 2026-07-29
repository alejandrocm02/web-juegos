import type { QuizPublicState } from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph, ProgressBar, Scoreboard } from '../components/ui.js';

export default function QuizView({ state }: { state: QuizPublicState }) {
  const { sendAction, session, room } = useApp();
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const phaseDuration = useRef(1);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPicked(null);
    phaseDuration.current = Math.max(1, state.deadline - Date.now());
  }, [state.questionIndex, state.phase]);

  const remaining = Math.max(0, state.deadline - now);
  const secondsLeft = Math.ceil(remaining / 1000);
  const answered = new Set(state.answeredPlayerIds);
  const myAnswer = state.breakdown.find((entry) => entry.playerId === session?.playerId) ?? null;

  const choose = (index: number) => {
    if (state.phase !== 'question' || picked !== null) return;
    setPicked(index);
    sendAction({ type: 'quiz:answer', questionIndex: state.questionIndex, answerIndex: index });
  };

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
      <div className="space-y-4">
        <Panel className="overflow-hidden">
          <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-neon-pink/10 blur-3xl" />
          <div className="relative mb-4 flex items-center justify-between gap-3 text-sm text-slate-400">
            <span className="eyebrow">
              Pregunta {Math.min(state.questionIndex + 1, state.totalQuestions)} /{' '}
              {state.totalQuestions}
            </span>
            {state.question && <span className="chip capitalize">{state.question.category}</span>}
            <span
              className={
                'font-display text-xl font-black tabular-nums ' +
                (secondsLeft <= 5 ? 'text-rose-300' : 'text-neon-pink')
              }
            >
              {secondsLeft}s
            </span>
          </div>
          <ProgressBar value={remaining / phaseDuration.current} color="#f472b6" />

          {state.phase === 'countdown' && (
            <div className="py-16 text-center">
              <span className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full border border-neon-pink/30 bg-neon-pink/10 font-display text-2xl font-black text-neon-pink">
                {secondsLeft}
              </span>
              <p className="mt-4 font-display text-2xl font-bold">Preparados...</p>
              <p className="mt-1 text-sm text-slate-500">
                La primera pregunta está a punto de salir.
              </p>
            </div>
          )}

          {state.question && (
            <>
              <h2 className="mb-7 mt-7 max-w-3xl font-display text-2xl font-bold leading-tight sm:text-3xl">
                {state.question.text}
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {state.question.answers.map((answer, index) => {
                  const isCorrect = state.correctIndex === index;
                  const isMine = (picked ?? myAnswer?.answerIndex) === index;
                  const revealing = state.phase === 'reveal';
                  return (
                    <button
                      key={index}
                      onClick={() => choose(index)}
                      disabled={state.phase !== 'question' || picked !== null}
                      className={
                        'group flex min-h-20 items-center rounded-2xl border px-4 py-4 text-left text-sm font-medium transition duration-200 disabled:cursor-default ' +
                        (revealing && isCorrect
                          ? 'border-neon-lime bg-neon-lime/15 text-neon-lime'
                          : revealing && isMine
                            ? 'border-rose-400 bg-rose-500/10 text-rose-200'
                            : isMine
                              ? 'border-neon-cyan bg-neon-cyan/10'
                              : 'border-white/[0.08] bg-white/[0.035] hover:-translate-y-0.5 hover:border-neon-pink/25 hover:bg-neon-pink/[0.06]')
                      }
                    >
                      <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 font-display font-black text-slate-400 transition group-hover:border-neon-pink/30 group-hover:text-neon-pink">
                        {['A', 'B', 'C', 'D'][index]}
                      </span>
                      {answer}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {state.phase === 'reveal' && myAnswer && (
            <p className="mt-4 text-sm">
              {myAnswer.correct ? (
                <span className="text-neon-lime">Correcto: +{myAnswer.gained} puntos</span>
              ) : (
                <span className="text-rose-300">
                  {myAnswer.answerIndex === null ? 'Sin respuesta' : 'Fallaste esta pregunta'}
                </span>
              )}
            </p>
          )}
        </Panel>

        <Panel title="Estado de la sala">
          <div className="flex flex-wrap gap-2">
            {room?.players.map((player) => (
              <span
                key={player.id}
                className={
                  'chip ' + (answered.has(player.id) ? 'border-neon-lime/50 text-neon-lime' : '')
                }
              >
                <PlayerIconGlyph icon={player.icon} color={player.color} size={14} />
                {player.name}
                {answered.has(player.id) ? ' listo' : ''}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Clasificacion">
        <Scoreboard rows={state.scoreboard} />
      </Panel>
    </div>
  );
}
