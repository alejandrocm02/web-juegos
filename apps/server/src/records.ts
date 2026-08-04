import {
  SOLO_RECORD_META,
  improvesRecord,
  soloRecordValue,
  type BotDifficulty,
  type GameId,
  type MatchResult,
  type SoloOutcome,
  type SoloRecord,
} from '@arcade/shared';
import { logger } from './logger.js';
import { getStats } from './stats.js';

export interface SoloFinishInput {
  profileId: string;
  playerId: string;
  result: MatchResult;
  difficulty: BotDifficulty | null;
}

/**
 * Cierra una partida en solitario.
 *
 * Calcula la marca de la partida, la compara con la mejor guardada para ese
 * perfil anonimo y devuelve el desenlace ya listo para el cliente. Todo el
 * calculo vive en el servidor: el navegador solo recibe el veredicto.
 */
export async function recordSoloMatch(input: SoloFinishInput): Promise<SoloOutcome | null> {
  const { profileId, playerId, result, difficulty } = input;
  const game: GameId = result.game;
  const measured = soloRecordValue(result, playerId);
  const won = result.winnerIds.includes(playerId);
  const stats = getStats();

  let previous: SoloRecord | null = null;
  try {
    previous = await stats.getRecord(profileId, game);
  } catch (error) {
    logger.warn('No se pudo leer la marca personal', String(error));
  }

  // Sin marca medible (por ejemplo, dardos sin cierre) solo cuenta la partida.
  if (!measured) {
    if (!previous) return null;
    const record: SoloRecord = {
      ...previous,
      plays: previous.plays + 1,
      wins: previous.wins + (won ? 1 : 0),
      updatedAt: result.finishedAt,
    };
    await save(profileId, record);
    return {
      game,
      value: previous.value,
      detail: 'Partida sin marca válida',
      won,
      improved: false,
      previousValue: previous.value,
      record,
    };
  }

  const improved = improvesRecord(game, measured.value, previous?.value ?? null);
  const record: SoloRecord = {
    game,
    value: improved ? measured.value : (previous?.value ?? measured.value),
    detail: improved ? measured.detail : (previous?.detail ?? measured.detail),
    difficulty: improved ? difficulty : (previous?.difficulty ?? difficulty),
    plays: (previous?.plays ?? 0) + 1,
    wins: (previous?.wins ?? 0) + (won ? 1 : 0),
    updatedAt: result.finishedAt,
  };

  await save(profileId, record);

  return {
    game,
    value: measured.value,
    detail: measured.detail,
    won,
    improved,
    previousValue: previous?.value ?? null,
    record,
  };
}

async function save(profileId: string, record: SoloRecord): Promise<void> {
  try {
    await getStats().saveRecord(profileId, record);
  } catch (error) {
    logger.warn('No se pudo guardar la marca personal', String(error));
  }
}

/** Marcas de un perfil ordenadas como se muestran en la interfaz. */
export async function listSoloRecords(profileId: string): Promise<SoloRecord[]> {
  try {
    const records = await getStats().listRecords(profileId);
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    logger.warn('No se pudieron leer las marcas personales', String(error));
    return [];
  }
}

/** Texto corto para el aviso que se envía al terminar. */
export function describeOutcome(outcome: SoloOutcome): string {
  const meta = SOLO_RECORD_META[outcome.game];
  if (outcome.improved && outcome.previousValue !== null) {
    return '¡Nuevo récord! ' + meta.label + ': ' + outcome.detail;
  }
  if (outcome.improved) return 'Primera marca registrada: ' + outcome.detail;
  return 'Tu récord sigue siendo ' + outcome.record.detail;
}
