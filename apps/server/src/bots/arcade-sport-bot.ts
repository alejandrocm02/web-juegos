import { SPORT_FIELD, type GameAction, type GamePublicState, type TeamId } from '@arcade/shared';
import { clamp, jitter, type BotBrain, type BotThinkContext } from './types.js';

/**
 * Pala automatica para air hockey y tenis de mesa.
 *
 * El bot predice donde cruzara la bola su linea de defensa integrando la
 * velocidad actual y rebotando contra las bandas. Con poca destreza la
 * prediccion se acorta y se sustituye por seguimiento directo, que llega tarde
 * a los tiros cruzados. La accion enviada es la misma `sport:input`
 * normalizada que manda el cliente, asi que el servidor la acota igual.
 */
export class ArcadeSportBot implements BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[] {
    if (state.game !== 'air-hockey' && state.game !== 'table-tennis') return [];
    if (state.phase !== 'playing') return [];
    const paddle = state.paddles.find((entry) => entry.playerId === ctx.botId);
    if (!paddle) return [];

    const team: TeamId = paddle.team;
    const defendsLeft = team === 'rojo';
    const ball = state.ball;

    // Linea vertical sobre la que el bot intercepta.
    const guardX = defendsLeft
      ? SPORT_FIELD.margin + SPORT_FIELD.width * 0.1
      : SPORT_FIELD.width - SPORT_FIELD.margin - SPORT_FIELD.width * 0.1;

    const incoming = defendsLeft ? ball.vx < 0 : ball.vx > 0;
    const predictionStrength = incoming ? ctx.meta.skill : ctx.meta.skill * 0.35;
    const predicted = this.predictY(ball, guardX, predictionStrength);
    const targetY = clamp(
      predicted + jitter(ctx.random, ctx.meta.noise * SPORT_FIELD.height * 0.22),
      SPORT_FIELD.margin,
      SPORT_FIELD.height - SPORT_FIELD.margin,
    );

    // En air hockey el bot avanza para golpear cuando la bola entra en su campo.
    let normalizedX = 0.16;
    if (state.game === 'air-hockey') {
      const inOwnHalf = defendsLeft
        ? ball.x < SPORT_FIELD.width * 0.5
        : ball.x > SPORT_FIELD.width * 0.5;
      const aggression = inOwnHalf && !incoming ? 0.55 + ctx.meta.skill * 0.35 : 0.12;
      normalizedX = clamp(aggression + jitter(ctx.random, ctx.meta.noise * 0.2), 0, 1);
    }

    const normalizedY = clamp(
      (targetY - SPORT_FIELD.margin) / (SPORT_FIELD.height - SPORT_FIELD.margin * 2),
      0,
      1,
    );

    return [
      {
        type: 'sport:input',
        game: state.game,
        x: normalizedX,
        y: normalizedY,
      },
    ];
  }

  /**
   * Estima la altura de la bola al llegar a `guardX`.
   *
   * `strength` mezcla entre seguir la posicion actual (0) y confiar del todo en
   * la prediccion con rebotes (1): es lo que separa a un bot facil de uno duro.
   */
  private predictY(
    ball: { x: number; y: number; vx: number; vy: number },
    guardX: number,
    strength: number,
  ): number {
    if (Math.abs(ball.vx) < 1) return ball.y;
    const time = (guardX - ball.x) / ball.vx;
    if (time <= 0) return ball.y;

    const top = SPORT_FIELD.margin;
    const bottom = SPORT_FIELD.height - SPORT_FIELD.margin;
    const span = bottom - top;
    let y = ball.y + ball.vy * time;

    // Reflexion en las bandas: se pliega la trayectoria sobre el doble del alto.
    if (span > 0) {
      const folded = Math.abs(((y - top) % (span * 2)) + (y < top ? span * 2 : 0)) % (span * 2);
      y = top + (folded <= span ? folded : span * 2 - folded);
    }
    return ball.y + (y - ball.y) * clamp(strength, 0, 1);
  }
}
