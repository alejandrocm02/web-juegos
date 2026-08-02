import {
  SONGLESS_CLIP_NOTES,
  SONGLESS_TRACKS,
  shuffleWithRng,
  type GameAction,
  type SonglessAnswerBreakdown,
  type SonglessPublicState,
  type SonglessSettings,
  type SonglessTrack,
} from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const COUNTDOWN_MS = 2_400;
const REVEAL_MS = 3_800;

interface SubmittedAnswer {
  answerIndex: number;
  atMs: number;
  clipLevel: number;
  levelStartedAt: number;
}

/** Juego musical simultáneo. El servidor decide la pieza, los tiempos y la puntuación. */
export class SonglessGame implements GameRunner {
  readonly id = 'songless' as const;
  private phase: SonglessPublicState['phase'] = 'countdown';
  private tracks: SonglessTrack[] = [];
  private roundIndex = -1;
  private clipLevel = 1;
  private currentTrack: SonglessTrack | null = null;
  private candidates: [string, string, string, string] | null = null;
  private correctIndex: number | null = null;
  private scores = new Map<string, number>();
  private correctAnswers = new Map<string, number>();
  private answers = new Map<string, SubmittedAnswer>();
  private breakdown: SonglessAnswerBreakdown[] = [];
  private deadline = 0;
  private levelStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: SonglessSettings,
    private readonly random: () => number = Math.random,
  ) {}

  private get totalRounds(): number {
    return this.settings.mode === 'relampago' ? 5 : this.settings.rounds;
  }

  private get maxClipLevel(): number {
    return this.settings.mode === 'oido-fino' ? 1 : 3;
  }

  private get levelDurationMs(): number {
    if (this.settings.mode === 'relampago') return 3_000;
    if (this.settings.mode === 'oido-fino') return 12_000;
    return 5_000;
  }

  start(): void {
    this.tracks = shuffleWithRng(SONGLESS_TRACKS, this.random).slice(0, this.totalRounds);
    for (const player of this.ctx.players()) {
      this.scores.set(player.id, 0);
      this.correctAnswers.set(player.id, 0);
    }
    this.phase = 'countdown';
    this.deadline = Date.now() + COUNTDOWN_MS;
    this.push();
    this.schedule(COUNTDOWN_MS, () => this.beginRound());
  }

  private beginRound(): void {
    this.roundIndex += 1;
    if (this.roundIndex >= this.tracks.length) {
      this.finish();
      return;
    }
    this.phase = 'listening';
    this.clipLevel = 1;
    this.currentTrack = this.tracks[this.roundIndex]!;
    this.answers.clear();
    this.breakdown = [];
    this.buildCandidates();
    this.levelStartedAt = Date.now();
    this.deadline = this.levelStartedAt + this.levelDurationMs * this.maxClipLevel;
    this.push();
    this.schedule(this.levelDurationMs, () => this.advanceClip());
  }

  private buildCandidates(): void {
    const track = this.currentTrack!;
    const distractors = shuffleWithRng(
      SONGLESS_TRACKS.filter((entry) => entry.id !== track.id),
      this.random,
    )
      .slice(0, 3)
      .map((entry) => entry.title);
    const shuffled = shuffleWithRng([track.title, ...distractors], this.random) as [
      string,
      string,
      string,
      string,
    ];
    this.candidates = shuffled;
    this.correctIndex = shuffled.indexOf(track.title);
  }

  private advanceClip(): void {
    if (this.phase !== 'listening') return;
    if (this.clipLevel >= this.maxClipLevel) {
      this.reveal();
      return;
    }
    this.clipLevel += 1;
    this.levelStartedAt = Date.now();
    this.push();
    this.schedule(this.levelDurationMs, () => this.advanceClip());
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'songless:answer' || this.phase !== 'listening') return;
    if (action.roundIndex !== this.roundIndex || this.answers.has(playerId)) return;
    if (!this.ctx.players().some((player) => player.id === playerId)) return;
    if (Date.now() > this.deadline) {
      this.reveal();
      return;
    }

    this.answers.set(playerId, {
      answerIndex: action.answerIndex,
      atMs: Date.now(),
      clipLevel: this.clipLevel,
      levelStartedAt: this.levelStartedAt,
    });
    this.push();

    const connected = this.ctx.players().filter((player) => player.connection === 'connected');
    if (connected.every((player) => this.answers.has(player.id))) {
      this.schedule(450, () => this.reveal());
    }
  }

  private pointsFor(answer: SubmittedAnswer): number {
    const base =
      this.settings.mode === 'oido-fino'
        ? 450
        : this.settings.mode === 'relampago'
          ? [350, 225, 100][answer.clipLevel - 1]!
          : [300, 200, 100][answer.clipLevel - 1]!;
    const elapsed = Math.max(0, answer.atMs - answer.levelStartedAt);
    const speedRatio = Math.max(0, 1 - elapsed / this.levelDurationMs);
    return base + Math.round(speedRatio * 50);
  }

  private reveal(): void {
    if (this.phase !== 'listening' || this.correctIndex === null) return;
    this.clearTimer();
    this.breakdown = this.ctx.players().map((player) => {
      const answer = this.answers.get(player.id);
      const correct = answer?.answerIndex === this.correctIndex;
      const gained = correct && answer ? this.pointsFor(answer) : 0;
      if (correct) {
        this.correctAnswers.set(player.id, (this.correctAnswers.get(player.id) ?? 0) + 1);
        this.scores.set(player.id, (this.scores.get(player.id) ?? 0) + gained);
        this.ctx.broadcastEvent({
          kind: 'songless-hit',
          playerId: player.id,
          clipLevel: answer?.clipLevel,
          points: gained,
          atMs: Date.now(),
        });
      }
      return {
        playerId: player.id,
        answerIndex: answer?.answerIndex ?? null,
        correct,
        gained,
        clipLevel: answer?.clipLevel ?? null,
        timeMs: answer
          ? answer.atMs - (this.deadline - this.levelDurationMs * this.maxClipLevel)
          : null,
      };
    });
    this.phase = 'reveal';
    this.deadline = Date.now() + REVEAL_MS;
    this.push();
    this.schedule(REVEAL_MS, () => this.beginRound());
  }

  private scoreboard() {
    return rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => ({
        playerId: player.id,
        score: this.scores.get(player.id) ?? 0,
        tiebreak: -(this.correctAnswers.get(player.id) ?? 0),
        detail: (this.correctAnswers.get(player.id) ?? 0) + ' melodías reconocidas',
      })),
    );
  }

  publicState(): SonglessPublicState {
    const reveal = this.phase === 'reveal' || this.phase === 'finished';
    const noteCount = reveal
      ? SONGLESS_CLIP_NOTES.at(-1)!
      : SONGLESS_CLIP_NOTES[Math.max(0, this.clipLevel - 1)]!;
    return {
      game: 'songless',
      phase: this.phase,
      mode: this.settings.mode,
      roundIndex: Math.max(0, this.roundIndex),
      totalRounds: this.totalRounds,
      clipLevel: this.clipLevel,
      maxClipLevel: this.maxClipLevel,
      track:
        this.currentTrack && this.candidates
          ? {
              bpm: this.currentTrack.bpm,
              notes: this.currentTrack.notes.slice(0, noteCount),
              candidates: this.candidates,
              index: this.roundIndex,
              total: this.totalRounds,
            }
          : null,
      answeredPlayerIds: [...this.answers.keys()],
      correctIndex: reveal ? this.correctIndex : null,
      correctComposer: reveal ? (this.currentTrack?.composer ?? null) : null,
      breakdown: reveal ? this.breakdown : [],
      scoreboard: this.scoreboard(),
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.clearTimer();
    this.phase = 'finished';
    const rows = this.scoreboard();
    this.push();
    this.ctx.finish({
      game: 'songless',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
      extra: { rounds: this.totalRounds },
    });
  }

  onPlayerLeft(playerId: string): void {
    this.answers.delete(playerId);
    this.scores.delete(playerId);
    this.correctAnswers.delete(playerId);
    this.push();
  }

  onPlayerRejoined(): void {
    this.push();
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.clearTimer();
  }
}
