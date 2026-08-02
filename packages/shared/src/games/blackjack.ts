export const BLACKJACK_SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const BLACKJACK_RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

export type BlackjackSuit = (typeof BLACKJACK_SUITS)[number];
export type BlackjackRank = (typeof BLACKJACK_RANKS)[number];

export interface BlackjackCard {
  suit: BlackjackSuit;
  rank: BlackjackRank;
}

export interface BlackjackHandValue {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
}

export type BlackjackHandStatus = 'playing' | 'stood' | 'bust' | 'blackjack';
export type BlackjackRoundResult = 'win' | 'loss' | 'push' | 'blackjack';

export interface BlackjackPlayerHand extends BlackjackHandValue {
  cards: BlackjackCard[];
  status: BlackjackHandStatus;
}

export function createBlackjackDeck(): BlackjackCard[] {
  return BLACKJACK_SUITS.flatMap((suit) => BLACKJACK_RANKS.map((rank) => ({ suit, rank })));
}

export function shuffleBlackjackDeck(
  random: () => number = Math.random,
  deck: BlackjackCard[] = createBlackjackDeck(),
): BlackjackCard[] {
  const shuffled = deck.map((card) => ({ ...card }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

/** Calcula el valor óptimo de la mano degradando ases de 11 a 1 cuando hace falta. */
export function valueBlackjackHand(cards: BlackjackCard[]): BlackjackHandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      total += 11;
      aces += 1;
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  soft = soft && aces > 0;
  return {
    total,
    soft,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}
