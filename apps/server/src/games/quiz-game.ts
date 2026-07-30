import {
  QUIZ_BASE_POINTS,
  QUIZ_QUESTIONS,
  QUIZ_SPEED_BONUS,
  assignTeams,
  createRng,
  isTeamMode,
  shuffleWithRng,
  type GameAction,
  type QuizAnswerBreakdown,
  type QuizPublicState,
  type QuizQuestion,
  type QuizSettings,
  type TeamId,
} from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const REVEAL_MS = 4500;
const COUNTDOWN_MS = 3000;

export class QuizGame implements GameRunner {
  readonly id = 'quiz' as const;
  private questions: QuizQuestion[] = [];
  private index = -1;
  private phase: QuizPublicState['phase'] = 'countdown';
  private deadline = 0;
  private scores = new Map<string, number>();
  private answers = new Map<string, { answerIndex: number; atMs: number }>();
  private breakdown: QuizAnswerBreakdown[] = [];
  private timer: NodeJS.Timeout | null = null;
  private questionStartedAt = 0;
  private teams: Record<string, TeamId> = {};
  /** Jugadores fuera de juego en el modo eliminacion. */
  private eliminated = new Set<string>();

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: QuizSettings,
  ) {}

  /** Segundos por pregunta segun el modo: el rapido juega con la mitad. */
  private get secondsPerQuestion(): number {
    const base = this.settings.secondsPerQuestion;
    return this.settings.mode === 'rapido' ? Math.max(5, Math.round(base / 2)) : base;
  }

  /** El modo rapido dobla la bonificacion por responder pronto. */
  private get speedBonus(): number {
    return this.settings.mode === 'rapido' ? QUIZ_SPEED_BONUS * 2 : QUIZ_SPEED_BONUS;
  }

  start(): void {
    const rng = createRng(Date.now() % 2147483647);
    if (isTeamMode('quiz', this.settings.mode)) {
      this.teams = assignTeams(this.ctx.players().map((player) => player.id));
    }
    const pool =
      this.settings.categories.length > 0
        ? QUIZ_QUESTIONS.filter((q) => this.settings.categories.includes(q.category))
        : QUIZ_QUESTIONS;
    const usable = pool.length >= this.settings.questionCount ? pool : QUIZ_QUESTIONS;
    this.questions = shuffleWithRng(usable, rng).slice(0, this.settings.questionCount);
    for (const player of this.ctx.players()) this.scores.set(player.id, 0);

    this.phase = 'countdown';
    this.deadline = Date.now() + COUNTDOWN_MS;
    this.push();
    this.schedule(COUNTDOWN_MS, () => this.nextQuestion());
  }

  private schedule(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  private nextQuestion(): void {
    this.index += 1;
    if (this.index >= this.questions.length) {
      this.finish();
      return;
    }
    this.answers.clear();
    this.breakdown = [];
    this.phase = 'question';
    this.questionStartedAt = Date.now();
    this.deadline = this.questionStartedAt + this.secondsPerQuestion * 1000;
    this.push();
    this.schedule(this.secondsPerQuestion * 1000 + 250, () => this.reveal());
  }

  private reveal(): void {
    if (this.phase !== 'question') return;
    const question = this.questions[this.index]!;
    const windowMs = this.secondsPerQuestion * 1000;

    this.breakdown = this.ctx.players().map((player) => {
      if (this.eliminated.has(player.id)) {
        return { playerId: player.id, answerIndex: null, correct: false, gained: 0, timeMs: null };
      }
      const answer = this.answers.get(player.id);
      const correct = answer?.answerIndex === question.correctIndex;
      let gained = 0;
      if (correct && answer) {
        const elapsed = Math.max(0, answer.atMs - this.questionStartedAt);
        const speedRatio = Math.max(0, 1 - elapsed / windowMs);
        gained = QUIZ_BASE_POINTS + Math.round(this.speedBonus * speedRatio);
      }
      // En eliminacion, fallar o no contestar deja al jugador fuera.
      if (this.settings.mode === 'eliminacion' && !correct) this.eliminated.add(player.id);
      this.scores.set(player.id, (this.scores.get(player.id) ?? 0) + gained);
      return {
        playerId: player.id,
        answerIndex: answer?.answerIndex ?? null,
        correct,
        gained,
        timeMs: answer ? answer.atMs - this.questionStartedAt : null,
      };
    });

    this.phase = 'reveal';
    this.deadline = Date.now() + REVEAL_MS;
    this.push();

    if (this.settings.mode === 'eliminacion' && this.survivors().length <= 1) {
      this.schedule(REVEAL_MS, () => this.finish());
      return;
    }
    this.schedule(REVEAL_MS, () => this.nextQuestion());
  }

  /** Jugadores que siguen vivos en el modo eliminacion. */
  private survivors(): string[] {
    return this.ctx
      .players()
      .filter((player) => !this.eliminated.has(player.id))
      .map((player) => player.id);
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'quiz:answer') return;
    if (this.phase !== 'question') return;
    if (this.eliminated.has(playerId)) return;
    if (Date.now() > this.deadline) {
      this.reveal();
      return;
    }
    if (action.questionIndex !== this.index) return;
    if (this.answers.has(playerId)) return;
    if (!this.ctx.players().some((p) => p.id === playerId)) return;

    this.answers.set(playerId, { answerIndex: action.answerIndex, atMs: Date.now() });
    this.push();

    const connected = this.ctx
      .players()
      .filter((p) => p.connection === 'connected' && !this.eliminated.has(p.id));
    if (connected.every((p) => this.answers.has(p.id))) this.schedule(300, () => this.reveal());
  }

  onPlayerLeft(playerId: string): void {
    this.answers.delete(playerId);
    this.scores.delete(playerId);
    this.eliminated.delete(playerId);
    delete this.teams[playerId];
    this.push();
  }

  onPlayerRejoined(): void {
    this.push();
  }

  private scoreboard() {
    const teamMode = isTeamMode('quiz', this.settings.mode);
    return rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const own = this.scores.get(player.id) ?? 0;
        const team = this.teams[player.id];
        const score = teamMode && team ? this.teamTotal(team) : own;
        const detail = teamMode && team ? 'Equipo ' + team : undefined;
        return {
          playerId: player.id,
          score,
          detail: this.eliminated.has(player.id) ? 'Eliminado' : detail,
        };
      }),
    );
  }

  private teamTotal(team: TeamId): number {
    return this.ctx
      .players()
      .filter((player) => this.teams[player.id] === team)
      .reduce((sum, player) => sum + (this.scores.get(player.id) ?? 0), 0);
  }

  publicState(): QuizPublicState {
    const question = this.questions[this.index];
    return {
      game: 'quiz',
      phase: this.phase,
      mode: this.settings.mode,
      teams: this.teams,
      question:
        question && this.phase !== 'countdown'
          ? {
              id: question.id,
              category: question.category,
              text: question.text,
              answers: question.answers,
              index: this.index,
              total: this.questions.length,
            }
          : null,
      deadline: this.deadline,
      answeredPlayerIds: [...this.answers.keys()],
      correctIndex: this.phase === 'reveal' && question ? question.correctIndex : null,
      breakdown: this.phase === 'reveal' ? this.breakdown : [],
      scoreboard: this.scoreboard(),
      questionIndex: Math.max(0, this.index),
      totalQuestions: this.questions.length,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    const rows = this.scoreboard();
    this.push();
    this.ctx.finish({
      game: 'quiz',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
