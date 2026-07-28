/** Diferencia de golpes respecto al par, en formato de marcador de golf. */
export function relativeToPar(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff === 0) return 'Par';
  return diff > 0 ? '+' + diff : String(diff);
}
