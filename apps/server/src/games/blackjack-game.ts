import {
  shuffleBlackjackDeck,
  valueBlackjackHand,
  type BlackjackCard,
  type BlackjackHandStatus,
  type BlackjackPlayerHand,
  type BlackjackPublicState,
  type BlackjackRoundResult,
  type BlackjackSettings,
  type GameAction,
} from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const TURN_TIMEOUT_MS = 30_000;
const DEALER_REVEAL_MS = 900;
const ROUND_BREAK_MS = 3_200;

interface InternalHand {
  cards: BlackjackCard[];
  status: BlackjackHandStatus;
}

/** Mesa autoritativa: el cliente nunca conoce el mazo ni decide qué carta recibe. */
export class BlackjackGame implements GameRunner {
  readonly id = 'blackjack' as const;
  private order: string[] = [];
  private activeIndex = -1;
  private phase: BlackjackPublicState['phase'] = 'playing';
  private round = 0;
  private deck: BlackjackCard[] = [];
  private hands = new Map<string, InternalHand>();
  private dealer: BlackjackCard[] = [];
  private points = new Map<string, number>();
  private wins = new Map<string, number>();
  private naturals = new Map<string, number>();
  private roundResults = new Map<string, BlackjackRoundResult>();
  private deadline = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: BlackjackSettings,
    private readonly random: () => number = Math.random,
  ) {}

  private get totalRounds(): number {
    return this.settings.mode === 'rapido' ? 3 : this.settings.rounds;
  }

  private get activePlayerId(): string {
    return this.order[this.activeIndex] ?? '';
  }

  start(): void {
    this.order = this.ctx.players().map((player) => player.id);
    for (const id of this.order) {
      this.points.set(id, 0);
      this.wins.set(id, 0);
      this.naturals.set(id, 0);
    }
    this.beginRound();
  }

  private beginRound(): void {
    this.round += 1;
    this.phase = 'playing';
    this.activeIndex = -1;
    this.roundResults.clear();
    this.deck = shuffleBlackjackDeck(this.random);
    this.hands.clear();
    this.dealer = [];

    for (const id of this.order) this.hands.set(id, { cards: [], status: 'playing' });
    // Reparto alterno para reproducir una mesa real y mantener un orden fácil de auditar.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const id of this.order) this.hands.get(id)?.cards.push(this.draw());
      this.dealer.push(this.draw());
    }

    for (const hand of this.hands.values()) {
      if (valueBlackjackHand(hand.cards).blackjack) hand.status = 'blackjack';
    }
    this.advanceTurn();
  }

  private draw(): BlackjackCard {
    const card = this.deck.pop();
    if (card) return card;
    this.deck = shuffleBlackjackDeck(this.random);
    return this.deck.pop()!;
  }

  handleAction(playerId: string, action: GameAction): void {
    if (this.phase !== 'playing' || playerId !== this.activePlayerId) return;
    if (action.type === 'blackjack:hit') this.hit(playerId);
    if (action.type === 'blackjack:stand') this.stand(playerId);
  }

  private hit(playerId: string): void {
    const hand = this.hands.get(playerId);
    if (!hand || hand.status !== 'playing') return;
    hand.cards.push(this.draw());
    const value = valueBlackjackHand(hand.cards);
    if (value.bust) {
      hand.status = 'bust';
      this.ctx.broadcastEvent({ kind: 'blackjack-bust', playerId, atMs: Date.now() });
      this.advanceTurn();
      return;
    }
    if (value.total === 21) {
      hand.status = 'stood';
      this.advanceTurn();
      return;
    }
    this.armTurn();
    this.push();
  }

  private stand(playerId: string): void {
    const hand = this.hands.get(playerId);
    if (!hand || hand.status !== 'playing') return;
    hand.status = 'stood';
    this.advanceTurn();
  }

  private advanceTurn(): void {
    this.clearTimer();
    for (let index = this.activeIndex + 1; index < this.order.length; index += 1) {
      const hand = this.hands.get(this.order[index]!);
      if (hand?.status === 'playing') {
        this.activeIndex = index;
        this.armTurn();
        this.push();
        return;
      }
    }
    this.activeIndex = -1;
    this.beginDealerTurn();
  }

  private armTurn(): void {
    this.clearTimer();
    this.deadline = Date.now() + TURN_TIMEOUT_MS;
    const playerId = this.activePlayerId;
    this.timer = setTimeout(() => {
      if (this.phase !== 'playing' || playerId !== this.activePlayerId) return;
      this.ctx.toast('Tiempo agotado: te plantas automáticamente', playerId);
      this.stand(playerId);
    }, TURN_TIMEOUT_MS + 100);
  }

  private beginDealerTurn(): void {
    this.phase = 'dealer';
    this.deadline = Date.now() + DEALER_REVEAL_MS;
    this.push();
    this.timer = setTimeout(() => this.resolveDealer(), DEALER_REVEAL_MS);
  }

  private resolveDealer(): void {
    const liveHands = [...this.hands.values()].some((hand) => hand.status !== 'bust');
    if (liveHands) {
      let value = valueBlackjackHand(this.dealer);
      const hitsSoft17 = this.settings.mode === 'alto-riesgo';
      while (value.total < 17 || (hitsSoft17 && value.total === 17 && value.soft)) {
        this.dealer.push(this.draw());
        value = valueBlackjackHand(this.dealer);
      }
    }
    this.settleRound();
  }

  private settleRound(): void {
    const dealer = valueBlackjackHand(this.dealer);
    for (const id of this.order) {
      const hand = this.hands.get(id);
      if (!hand) continue;
      const value = valueBlackjackHand(hand.cards);
      let result: BlackjackRoundResult;
      let gained = 0;

      if (value.bust) {
        result = 'loss';
      } else if (value.blackjack && !dealer.blackjack) {
        result = 'blackjack';
        gained = this.settings.mode === 'alto-riesgo' ? 4 : 3;
        this.naturals.set(id, (this.naturals.get(id) ?? 0) + 1);
        this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
      } else if (dealer.blackjack && !value.blackjack) {
        // Un 21 conseguido con tres o más cartas no empata un blackjack natural.
        result = 'loss';
      } else if (dealer.bust || value.total > dealer.total) {
        result = 'win';
        gained = 2;
        this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
      } else if (value.total === dealer.total) {
        result = 'push';
        gained = 1;
      } else {
        result = 'loss';
      }

      this.roundResults.set(id, result);
      this.points.set(id, (this.points.get(id) ?? 0) + gained);
      this.ctx.broadcastEvent({
        kind: 'blackjack-result',
        playerId: id,
        result,
        points: gained,
        atMs: Date.now(),
      });
    }

    this.phase = 'round-over';
    this.deadline = Date.now() + ROUND_BREAK_MS;
    this.push();
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (this.round >= this.totalRounds) this.finish();
      else this.beginRound();
    }, ROUND_BREAK_MS);
  }

  publicState(): BlackjackPublicState {
    const revealDealer = this.phase !== 'playing';
    const dealerValue = valueBlackjackHand(this.dealer);
    const hands: Record<string, BlackjackPlayerHand> = {};
    for (const [id, hand] of this.hands) {
      hands[id] = {
        ...valueBlackjackHand(hand.cards),
        cards: hand.cards.map((card) => ({ ...card })),
        status: hand.status,
      };
    }
    return {
      game: 'blackjack',
      phase: this.phase,
      mode: this.settings.mode,
      round: this.round,
      totalRounds: this.totalRounds,
      order: this.order.slice(),
      activePlayerId: this.activePlayerId,
      hands,
      dealerCards: revealDealer
        ? this.dealer.map((card) => ({ ...card }))
        : [this.dealer[0] ? { ...this.dealer[0] } : null, null],
      dealerTotal: revealDealer ? dealerValue.total : null,
      dealerSoft: revealDealer && dealerValue.soft,
      points: Object.fromEntries(this.points),
      roundResults: Object.fromEntries(this.roundResults),
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.clearTimer();
    this.phase = 'finished';
    const players = this.ctx.players();
    const rows = rankPlayers(
      players,
      players.map((player) => ({
        playerId: player.id,
        score: this.points.get(player.id) ?? 0,
        tiebreak: -(this.naturals.get(player.id) ?? 0),
        detail:
          (this.wins.get(player.id) ?? 0) +
          ' victorias · ' +
          (this.naturals.get(player.id) ?? 0) +
          ' blackjack',
      })),
    );
    this.push();
    this.ctx.finish({
      game: 'blackjack',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
      extra: { rounds: this.totalRounds },
    });
  }

  onPlayerLeft(playerId: string): void {
    const index = this.order.indexOf(playerId);
    if (index < 0) return;
    const wasActive = this.activePlayerId === playerId;
    this.order.splice(index, 1);
    this.hands.delete(playerId);
    this.points.delete(playerId);
    this.roundResults.delete(playerId);
    if (index <= this.activeIndex) this.activeIndex -= 1;
    if (wasActive && this.phase === 'playing') this.advanceTurn();
    else this.push();
  }

  onPlayerRejoined(): void {
    this.push();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.clearTimer();
  }
}
