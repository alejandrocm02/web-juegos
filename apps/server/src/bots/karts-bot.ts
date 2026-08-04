import { gateCenter, type GameAction, type GamePublicState, type KartPoint } from '@arcade/shared';
import { angleDelta, clamp, jitter, type BotBrain, type BotThinkContext } from './types.js';

/**
 * Piloto automatico.
 *
 * El circuito ya describe el trazado como una lista ordenada de puertas, asi
 * que la IA no necesita un mapa aparte: apunta al centro de la siguiente
 * puerta y, cuanto mejor conduce, mas lejos mira para trazar las curvas antes
 * de llegar a ellas. La direccion se traduce en el mismo evento `karts:input`
 * que envia un humano.
 */
export class KartsBot implements BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[] {
    if (state.game !== 'karts' || state.phase !== 'racing') return [];
    const kart = state.karts.find((entry) => entry.playerId === ctx.botId);
    if (!kart || kart.finished || kart.eliminated) return [];

    const gates = state.track.gates;
    if (gates.length === 0) return [];

    // Un piloto habil mira una puerta mas alla y corta la curva.
    const lookahead = ctx.meta.skill > 0.8 ? 2 : 1;
    const nearIndex = (kart.gate + 1) % gates.length;
    const farIndex = (kart.gate + lookahead) % gates.length;
    const near = gateCenter(gates[nearIndex]!);
    const far = gateCenter(gates[farIndex]!);
    const blend = clamp(ctx.meta.skill, 0, 1) * 0.45;
    const target: KartPoint = {
      x: near.x + (far.x - near.x) * blend,
      y: near.y + (far.y - near.y) * blend,
    };

    const desired = Math.atan2(target.y - kart.y, target.x - kart.x);
    const error = angleDelta(kart.heading, desired) + jitter(ctx.random, ctx.meta.noise * 0.45);

    // Giro proporcional al error, saturado en el maximo que acepta el servidor.
    const steer = clamp(error * 2.2, -1, 1);

    // En curva cerrada se levanta el pie; con poca destreza se frena tarde.
    const sharpness = Math.abs(error);
    const distance = Math.hypot(target.x - kart.x, target.y - kart.y);
    const braking = sharpness > 1.05 && kart.speed > 210 * ctx.meta.skill;
    let throttle = 1;
    if (sharpness > 0.75) throttle = 0.55 + ctx.meta.skill * 0.3;
    else if (sharpness > 0.4) throttle = 0.75 + ctx.meta.skill * 0.2;
    if (distance < 60) throttle = Math.min(throttle, 0.85);

    // Un fallo ocasional evita que la carrera sea una linea perfecta.
    if (ctx.random() < ctx.meta.noise * 0.05) throttle *= 0.5;

    return [
      {
        type: 'karts:input',
        throttle: clamp(throttle, -1, 1),
        steer,
        braking,
      },
    ];
  }
}
