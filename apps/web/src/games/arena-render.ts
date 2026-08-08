import {
  ARENA,
  ARENA_OBSTACLES,
  ARENA_PICKUP_META,
  type ArenaFighterState,
  type ArenaPublicState,
} from '@arcade/shared';
import type { Viewport } from '../lib/canvas.js';

/**
 * Interpolacion y dibujo del Battle Royale.
 *
 * Se separa de la vista por el mismo motivo que golf-render: el componente se
 * ocupa de estado, entrada y ciclo de vida, y el modulo de render es una
 * funcion pura del fotograma, facil de leer y de probar por su cuenta.
 */

export function interpolate(
  store: Map<string, { x: number; y: number; facing: number }>,
  fighters: ArenaFighterState[],
  dt: number,
): void {
  const alpha = 1 - Math.pow(0.002, dt);
  for (const fighter of fighters) {
    const current = store.get(fighter.playerId);
    if (!current) {
      store.set(fighter.playerId, { x: fighter.x, y: fighter.y, facing: fighter.facing });
      continue;
    }
    current.x += (fighter.x - current.x) * alpha;
    current.y += (fighter.y - current.y) * alpha;
    current.facing = fighter.facing;
  }
  for (const id of [...store.keys()]) {
    if (!fighters.some((fighter) => fighter.playerId === id)) store.delete(id);
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  fighters: ArenaFighterState[],
  render: Map<string, { x: number; y: number; facing: number }>,
  zone: ArenaPublicState['zone'],
  pickups: ArenaPublicState['pickups'],
  players: { id: string; name: string; color: string }[],
  myId?: string,
): void {
  const scale = view.width / ARENA.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.save();
  ctx.scale(scale, scale);

  // Tormenta y terreno táctico.
  const storm = ctx.createRadialGradient(
    zone.x,
    zone.y,
    zone.radius * 0.45,
    zone.x,
    zone.y,
    ARENA.width * 0.72,
  );
  storm.addColorStop(0, 'rgba(29, 78, 216, 0.12)');
  storm.addColorStop(0.55, 'rgba(88, 28, 135, 0.35)');
  storm.addColorStop(1, 'rgba(190, 18, 60, 0.5)');
  ctx.fillStyle = storm;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.clip();
  const safeGround = ctx.createRadialGradient(
    zone.x,
    zone.y,
    0,
    zone.x,
    zone.y,
    Math.max(1, zone.radius),
  );
  safeGround.addColorStop(0, '#10242a');
  safeGround.addColorStop(0.7, '#0b171d');
  safeGround.addColorStop(1, '#10151c');
  ctx.fillStyle = safeGround;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  // Retícula del campo, recortada dentro de la zona segura.
  ctx.strokeStyle = 'rgba(103,232,249,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= ARENA.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ARENA.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.shadowColor = 'rgba(96, 165, 250, 0.9)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const obstacle of ARENA_OBSTACLES) {
    ctx.beginPath();
    ctx.ellipse(
      obstacle.x + 5,
      obstacle.y + obstacle.radius * 0.55,
      obstacle.radius,
      obstacle.radius * 0.58,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    const rock = ctx.createRadialGradient(
      obstacle.x - obstacle.radius * 0.35,
      obstacle.y - obstacle.radius * 0.35,
      obstacle.radius * 0.1,
      obstacle.x,
      obstacle.y,
      obstacle.radius,
    );
    rock.addColorStop(0, '#394653');
    rock.addColorStop(0.58, '#1d2833');
    rock.addColorStop(1, '#0b1118');
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      obstacle.x - obstacle.radius * 0.12,
      obstacle.y - obstacle.radius * 0.1,
      obstacle.radius * 0.58,
      0.3,
      Math.PI * 1.45,
    );
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  for (const pickup of pickups) {
    if (!pickup.active) continue;
    const meta = ARENA_PICKUP_META[pickup.kind];
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, ARENA.pickupRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,10,16,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, ARENA.pickupRadius, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      pickup.kind === 'botiquin'
        ? '+'
        : pickup.kind === 'escudo'
          ? 'S'
          : pickup.kind === 'velocidad'
            ? '»'
            : '×',
      pickup.x,
      pickup.y + 0.5,
    );
  }

  for (const fighter of fighters) {
    const view = render.get(fighter.playerId) ?? fighter;
    const player = players.find((entry) => entry.id === fighter.playerId);
    if (!fighter.alive) continue;

    // Cono de ataque del propio jugador, para entender el alcance.
    if (fighter.playerId === myId) {
      const attackReady = fighter.attackCooldownMs <= 0;
      ctx.beginPath();
      ctx.moveTo(view.x, view.y);
      ctx.arc(
        view.x,
        view.y,
        ARENA.attackRange,
        view.facing - ARENA.attackArc,
        view.facing + ARENA.attackArc,
      );
      ctx.closePath();
      ctx.fillStyle = attackReady ? 'rgba(103,232,249,0.13)' : 'rgba(255,255,255,0.045)';
      ctx.fill();
      ctx.strokeStyle = attackReady ? 'rgba(103,232,249,0.3)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(
      view.x + 2,
      view.y + ARENA.playerRadius * 0.7,
      ARENA.playerRadius * 0.95,
      ARENA.playerRadius * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    const fighterFill = ctx.createRadialGradient(
      view.x - ARENA.playerRadius * 0.35,
      view.y - ARENA.playerRadius * 0.45,
      1,
      view.x,
      view.y,
      ARENA.playerRadius * 1.1,
    );
    fighterFill.addColorStop(0, '#ffffff');
    fighterFill.addColorStop(0.25, player?.color ?? '#ffffff');
    fighterFill.addColorStop(1, '#111827');
    ctx.shadowColor = player?.color ?? '#ffffff';
    ctx.shadowBlur = fighter.playerId === myId ? 14 : 6;
    ctx.beginPath();
    ctx.arc(view.x, view.y, ARENA.playerRadius, 0, Math.PI * 2);
    ctx.fillStyle = fighterFill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = fighter.playerId === myId ? 3 : 1.5;
    ctx.strokeStyle = fighter.playerId === myId ? '#ffffff' : 'rgba(255,255,255,0.4)';
    ctx.stroke();

    // Morro que indica hacia donde mira.
    ctx.beginPath();
    ctx.moveTo(view.x, view.y);
    ctx.lineTo(
      view.x + Math.cos(view.facing) * (ARENA.playerRadius + 8),
      view.y + Math.sin(view.facing) * (ARENA.playerRadius + 8),
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (fighter.shield > 0) {
      ctx.shadowColor = 'rgba(96,165,250,0.8)';
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(view.x, view.y, ARENA.playerRadius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(143,182,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Barra de vida sobre el personaje.
    const barWidth = 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(view.x - barWidth / 2, view.y - ARENA.playerRadius - 13, barWidth, 4.5);
    ctx.fillStyle = fighter.health > 40 ? '#34d399' : '#e11d2e';
    ctx.fillRect(
      view.x - barWidth / 2,
      view.y - ARENA.playerRadius - 13,
      (barWidth * fighter.health) / ARENA.maxHealth,
      4.5,
    );
  }

  ctx.restore();
}
