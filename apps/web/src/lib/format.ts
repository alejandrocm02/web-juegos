import type { QuizCategory } from '@arcade/shared';

/** Diferencia de golpes respecto al par, en formato de marcador de golf. */
export function relativeToPar(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff === 0) return 'Par';
  return diff > 0 ? '+' + diff : String(diff);
}

const QUIZ_CATEGORY_LABELS: Record<QuizCategory, string> = {
  'cultura general': 'Cultura general',
  ciencia: 'Ciencia',
  historia: 'Historia',
  geografia: 'Geografía',
  cine: 'Cine',
  musica: 'Música',
  tecnologia: 'Tecnología',
};

/** Etiqueta española visible, separada del identificador estable del protocolo. */
export function quizCategoryLabel(category: QuizCategory): string {
  return QUIZ_CATEGORY_LABELS[category];
}
