import { HEAD_SPORT_FIELD, type GameAction, type GamePublicState } from '@arcade/shared';
import { clamp, jitter, type BotBrain, type BotThinkContext } from './types.js';

/**
 * Cabezon automatico para head soccer y head basketball.
 *
 * El simulador dispara el salto y el remate por flanco (solo cuentan cuando el
 * boton pasa de suelto a pulsado), asi que el bot recuerda en su memoria si ya
 * los tenia pulsados y los suelta un tick antes de volver a usarlos. Sin eso,
 * mantener `jump: true` no haria absolutamente nada.
 */
export class HeadSportBot implements BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[] {
    if (state.game !== 'head-soccer' && state.game !== 'head-basketball') return [];
    if (state.phase !== 'playing') return [];
    const me = state.players.find((entry) => entry.playerId === ctx.botId);
    if (!me) return [];

    const attacksRight = me.team === 'rojo';
    const ball = state.ball;

    // Punto donde conviene colocarse: detras de la bola para empujarla al gol.
    const behindOffset = HEAD_SPORT_FIELD.playerRadius * 0.85;
    const desiredX = ball.x + (attacksRight ? -behindOffset : behindOffset);

    // Si la bola ya pasó de largo, primero se recupera la posicion defensiva.
    const overrun = attacksRight ? me.x > ball.x + 12 : me.x < ball.x - 12;
    const homeX = attacksRight ? HEAD_SPORT_FIELD.width * 0.22 : HEAD_SPORT_FIELD.width * 0.78;
    const targetX = overrun
      ? attacksRight
        ? Math.min(desiredX, homeX)
        : Math.max(desiredX, homeX)
      : desiredX;

    let moveX = clamp((targetX - me.x) / 42, -1, 1);
    moveX += jitter(ctx.random, ctx.meta.noise * 0.4);
    moveX = clamp(moveX, -1, 1);

    const distance = Math.hypot(ball.x - me.x, ball.y - me.y);
    const ballIsHigh = ball.y < HEAD_SPORT_FIELD.groundY - HEAD_SPORT_FIELD.playerRadius * 1.6;

    // Salta para cabecear cuando la bola llega alta y cerca.
    const wantsJump =
      me.onGround &&
      distance < HEAD_SPORT_FIELD.playerRadius * 3.2 &&
      ballIsHigh &&
      ctx.random() < 0.25 + ctx.meta.skill * 0.6;

    // Remata cuando la tiene al alcance y mirando hacia la porteria rival.
    const facingGoal = attacksRight ? ball.x >= me.x - 8 : ball.x <= me.x + 8;
    const wantsKick =
      distance < HEAD_SPORT_FIELD.playerRadius * 2.3 &&
      facingGoal &&
      me.kickMs <= 0 &&
      ctx.random() < 0.3 + ctx.meta.skill * 0.65;

    // Flanco: si el boton ya estaba pulsado se suelta este tick.
    const jumpHeld = ctx.memory.jumpHeld === true;
    const kickHeld = ctx.memory.kickHeld === true;
    const jump = wantsJump && !jumpHeld;
    const kick = wantsKick && !kickHeld;
    ctx.memory.jumpHeld = jump;
    ctx.memory.kickHeld = kick;

    return [
      {
        type: 'head-sport:input',
        game: state.game,
        moveX,
        jump,
        kick,
      },
    ];
  }
}
