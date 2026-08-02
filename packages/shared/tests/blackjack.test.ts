import { describe, expect, it } from 'vitest';
import {
  BLACKJACK_RANKS,
  BLACKJACK_SUITS,
  createBlackjackDeck,
  valueBlackjackHand,
  type BlackjackCard,
} from '../src/index.js';

const card = (rank: BlackjackCard['rank'], suit: BlackjackCard['suit'] = 'spades') => ({
  rank,
  suit,
});

describe('reglas de blackjack', () => {
  it('crea una baraja completa sin cartas repetidas', () => {
    const deck = createBlackjackDeck();
    expect(deck).toHaveLength(BLACKJACK_RANKS.length * BLACKJACK_SUITS.length);
    expect(new Set(deck.map((entry) => entry.rank + '-' + entry.suit)).size).toBe(52);
  });

  it('degrada los ases de once a uno para evitar pasarse', () => {
    expect(valueBlackjackHand([card('A'), card('9'), card('8')])).toMatchObject({
      total: 18,
      soft: false,
      bust: false,
    });
    expect(valueBlackjackHand([card('A'), card('6')])).toMatchObject({
      total: 17,
      soft: true,
    });
  });

  it('solo considera blackjack natural una mano inicial de dos cartas', () => {
    expect(valueBlackjackHand([card('A'), card('K')]).blackjack).toBe(true);
    expect(valueBlackjackHand([card('7'), card('7'), card('7')]).blackjack).toBe(false);
    expect(valueBlackjackHand([card('K'), card('Q'), card('2')]).bust).toBe(true);
  });
});
