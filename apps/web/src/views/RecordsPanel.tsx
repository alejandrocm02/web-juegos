import {
  BOT_DIFFICULTY_META,
  GAME_META,
  SOLO_RECORD_META,
  formatSoloRecord,
  type GameId,
  type SoloRecord,
} from '@arcade/shared';
import { GameIcon } from '../components/ui.js';

/** Fecha corta y legible, sin depender del huso del servidor. */
function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function RecordRow({ record }: { record: SoloRecord }) {
  const meta = SOLO_RECORD_META[record.game];
  const game = GAME_META[record.game];
  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/2 px-3 py-2.5"
      style={{ borderLeftColor: game.accent + '80', borderLeftWidth: 3 }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        style={{ color: game.accent }}
      >
        <GameIcon game={record.game} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{game.name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {meta.label} · {record.plays} {record.plays === 1 ? 'partida' : 'partidas'}
          {record.difficulty ? ' · ' + BOT_DIFFICULTY_META[record.difficulty].name : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-base font-black" style={{ color: game.accent }}>
          {formatSoloRecord(record.game, record.value)}
        </p>
        <p className="text-[10px] text-slate-600">{formatDate(record.updatedAt)}</p>
      </div>
    </li>
  );
}

export function RecordsPanel({
  records,
  highlight,
  className = 'flex flex-col gap-2',
}: {
  records: SoloRecord[];
  /** Juego que se resalta arriba del todo, si está entre las marcas. */
  highlight?: GameId;
  /** Disposición de la lista: una columna en paneles, rejilla en el inicio. */
  className?: string;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-slate-300">Aún no tienes marcas</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Termina una partida en solitario y aquí aparecerá tu mejor resultado de cada juego.
        </p>
      </div>
    );
  }

  const ordered = highlight
    ? [
        ...records.filter((record) => record.game === highlight),
        ...records.filter((record) => record.game !== highlight),
      ]
    : records;

  return (
    <ul className={className}>
      {ordered.map((record) => (
        <RecordRow key={record.game} record={record} />
      ))}
    </ul>
  );
}
