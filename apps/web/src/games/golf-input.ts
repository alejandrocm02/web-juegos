import { GOLF, type GolfBallState, type GolfSnapshot } from '@arcade/shared';

/**
 * Decide si la bola indicada puede golpearse ahora mismo.
 *
 * Es la misma condicion que aplica el servidor en GolfWorld.shoot, replicada
 * aqui solo para no dejar pulsar cuando se sabe que se va a rechazar. La
 * autoridad sigue siendo del servidor.
 */
export function canShootBall(ball: GolfBallState | null | undefined): boolean {
  if (!ball) return false;
  if (ball.holed || ball.finished || ball.outOfBounds || ball.airborne) return false;
  return Math.hypot(ball.vx, ball.vy) <= GOLF.stopSpeed;
}

/**
 * Devuelve la bola mas reciente que conoce el cliente.
 *
 * Los snapshots llegan a 20 Hz y el estado publico solo cuando hay novedades o
 * una vez por segundo. Si se decide con el estado publico, tras detenerse la
 * bola el jugador puede esperar hasta un segundo con el golpe bloqueado, o
 * apuntar desde una posicion vieja. Por eso el snapshot manda cuando existe.
 */
export function pickLiveBall(
  snapshot: GolfSnapshot | null | undefined,
  stateBalls: GolfBallState[],
  playerId: string | undefined,
): GolfBallState | null {
  if (!playerId) return null;
  const fromSnapshot =
    snapshot && Array.isArray(snapshot.balls)
      ? snapshot.balls.find((ball) => ball.playerId === playerId)
      : undefined;
  if (fromSnapshot) return fromSnapshot;
  return stateBalls.find((ball) => ball.playerId === playerId) ?? null;
}
