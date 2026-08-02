/**
 * Melodías para Songless.
 *
 * Son composiciones de dominio público interpretadas con síntesis WebAudio;
 * no se distribuyen grabaciones, partituras ni recursos de terceros.
 */

export interface SonglessTrack {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  /** Notas MIDI. `null` representa un silencio de una corchea. */
  notes: readonly (number | null)[];
}

export interface SonglessPublicTrack {
  bpm: number;
  notes: (number | null)[];
  candidates: [string, string, string, string];
  index: number;
  total: number;
}

export interface SonglessAnswerBreakdown {
  playerId: string;
  answerIndex: number | null;
  correct: boolean;
  gained: number;
  clipLevel: number | null;
  timeMs: number | null;
}

export const SONGLESS_TRACKS: readonly SonglessTrack[] = [
  {
    id: 'joy',
    title: 'Himno de la alegría',
    composer: 'Ludwig van Beethoven',
    bpm: 112,
    notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, null],
  },
  {
    id: 'elise',
    title: 'Para Elisa',
    composer: 'Ludwig van Beethoven',
    bpm: 118,
    notes: [76, 75, 76, 75, 76, 71, 74, 72, 69, null, 60, 64, 69, 71, null, 64],
  },
  {
    id: 'twinkle',
    title: 'Estrellita, ¿dónde estás?',
    composer: 'Melodía tradicional',
    bpm: 104,
    notes: [60, 60, 67, 67, 69, 69, 67, null, 65, 65, 64, 64, 62, 62, 60, null],
  },
  {
    id: 'frere',
    title: 'Frère Jacques',
    composer: 'Melodía tradicional francesa',
    bpm: 116,
    notes: [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, null, 64, 65, 67, null],
  },
  {
    id: 'jingle',
    title: 'Jingle Bells',
    composer: 'James Lord Pierpont',
    bpm: 126,
    notes: [64, 64, 64, null, 64, 64, 64, null, 64, 67, 60, 62, 64, null, 65, 65],
  },
  {
    id: 'bridge',
    title: 'El puente de Londres',
    composer: 'Canción infantil tradicional',
    bpm: 112,
    notes: [67, 69, 67, 65, 64, 65, 67, null, 62, 64, 65, null, 64, 65, 67, null],
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    composer: 'Melodía tradicional',
    bpm: 108,
    notes: [64, 62, 60, 62, 64, 64, 64, null, 62, 62, 62, null, 64, 67, 67, null],
  },
  {
    id: 'row',
    title: 'Row, Row, Row Your Boat',
    composer: 'Melodía tradicional',
    bpm: 100,
    notes: [60, 60, 60, 62, 64, null, 64, 62, 64, 65, 67, null, 72, 72, 72, null],
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'Melodía tradicional inglesa',
    bpm: 92,
    notes: [69, 72, 74, 76, 77, 76, 74, 71, 67, 69, 71, 72, 69, 68, 69, null],
  },
  {
    id: 'canon',
    title: 'Canon en re',
    composer: 'Johann Pachelbel',
    bpm: 96,
    notes: [74, 73, 74, 69, 71, 66, 67, 62, 67, 69, 71, 67, 71, 74, 76, null],
  },
  {
    id: 'danube',
    title: 'El Danubio azul',
    composer: 'Johann Strauss II',
    bpm: 90,
    notes: [60, 64, 67, 67, null, 67, 71, 74, 74, null, 74, 76, 71, 67, 64, null],
  },
  {
    id: 'swan',
    title: 'El lago de los cisnes',
    composer: 'Piotr Ilich Chaikovski',
    bpm: 88,
    notes: [66, 69, 71, 72, 74, 72, 71, 69, 66, 69, 71, 72, 69, 66, 62, null],
  },
] as const;

export const SONGLESS_CLIP_NOTES = [4, 8, 16] as const;
