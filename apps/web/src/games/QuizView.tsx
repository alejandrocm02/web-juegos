import type { QuizPublicState } from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import { useMatch, useRoom } from '../store.js';
import { Panel, PlayerIconGlyph, ProgressBar, Scoreboard } from '../components/ui.js';
import { quizCategoryLabel } from '../lib/format.js';

export default function QuizView({ state }: { state: QuizPublicState }) {
  const { session, room } = useRoom();
  const { sendAction } = useMatch();
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
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-2 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Panel className="quiz-show-card overflow-hidden">
          <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-neon-pink/10 blur-3xl" />
          <div className="game-hud relative mb-4">
            <span className="hud-stat">
              <span className="hud-stat-label">Ronda</span>
              <span className="hud-stat-value">
                {Math.min(state.questionIndex + 1, state.totalQuestions)} / {state.totalQuestions}
              </span>
            </span>
            {state.question && (
              <span className="hud-stat">
                <span className="hud-stat-label">Categoría</span>
                <span className="hud-stat-value">{quizCategoryLabel(state.question.category)}</span>
              </span>
            )}
            <span className="ml-auto hud-stat quiz-clock">
              <span className="hud-stat-label">Tiempo</span>
              <span
                className={
                  'hud-stat-value tabular-nums ' +
                  (secondsLeft <= 5 ? 'text-rose-300' : 'text-neon-pink')
                }
              >
                {secondsLeft}s
              </span>
            </span>
          </div>
          <ProgressBar value={remaining / phaseDuration.current} color="#f472b6" />

          {state.phase === 'countdown' && (
            <div className="py-16 text-center">
              <div className="game-countdown">
                <span className="game-countdown-label">Comienza en</span>
                <span className="game-countdown-value">{secondsLeft}</span>
                <p className="mt-3 font-display text-2xl font-bold">Preparad la respuesta</p>
                <p className="text-sm text-slate-500">La primera pregunta está a punto de salir.</p>
              </div>
            </div>
          )}

          {state.question && (
            <>
              <p className="mb-2 mt-7 text-[10px] font-black uppercase tracking-[0.2em] text-neon-pink/70">
                Pregunta en juego
              </p>
              <h2 className="quiz-question mb-7 max-w-3xl font-display text-2xl font-bold leading-tight sm:text-4xl">
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
                      style={
                        {
                          '--answer-accent': ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa'][index],
                        } as React.CSSProperties
                      }
                      className={
                        'quiz-answer group ' +
                        (revealing && isCorrect
                          ? 'is-correct'
                          : revealing && isMine
                            ? 'is-wrong'
                            : isMine
                              ? 'is-selected'
                              : '')
                      }
                    >
                      <span className="quiz-answer-key">{['A', 'B', 'C', 'D'][index]}</span>
                      <span>{answer}</span>
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

      <Panel title="Clasificación">
        <Scoreboard rows={state.scoreboard} />
      </Panel>
    </div>
  );
}
