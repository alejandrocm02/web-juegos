import type { QuizPublicState } from '@arcade/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../store.js';
import { Panel, PlayerIconGlyph, ProgressBar, Scoreboard } from '../components/ui.js';

export default function QuizView({ state }: { state: QuizPublicState }) {
  const { sendAction, session, room } = useApp();
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPicked(null);
  }, [state.questionIndex, state.phase]);

  const remaining = Math.max(0, state.deadline - now);
  const total = state.phase === 'question' ? remaining / Math.max(1, state.deadline - now + 1) : 0;
  const secondsLeft = Math.ceil(remaining / 1000);
  const answered = new Set(state.answeredPlayerIds);
  const myAnswer = state.breakdown.find((entry) => entry.playerId === session?.playerId) ?? null;

  const choose = (index: number) => {
    if (state.phase !== 'question' || picked !== null) return;
    setPicked(index);
    sendAction({ type: 'quiz:answer', questionIndex: state.questionIndex, answerIndex: index });
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <Panel>
          <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
            <span>
              Pregunta {Math.min(state.questionIndex + 1, state.totalQuestions)} /{' '}
              {state.totalQuestions}
            </span>
            {state.question && <span className="chip capitalize">{state.question.category}</span>}
            <span className="font-display text-lg tabular-nums text-neon-pink">{secondsLeft}s</span>
          </div>
          <ProgressBar
            value={
              state.phase === 'question'
                ? remaining / (state.deadline - now + remaining || 1)
                : total
            }
            color="#f472b6"
          />

          {state.phase === 'countdown' && (
            <p className="py-12 text-center font-display text-2xl">Preparados...</p>
          )}

          {state.question && (
            <>
              <h2 className="mb-5 mt-5 font-display text-xl font-bold sm:text-2xl">
                {state.question.text}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
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
                        'rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-default ' +
                        (revealing && isCorrect
                          ? 'border-neon-lime bg-neon-lime/15 text-neon-lime'
                          : revealing && isMine
                            ? 'border-rose-400 bg-rose-500/10 text-rose-200'
                            : isMine
                              ? 'border-neon-cyan bg-neon-cyan/10'
                              : 'border-white/10 bg-white/5 hover:bg-white/10')
                      }
                    >
                      <span className="mr-2 font-display font-bold text-slate-400">
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
