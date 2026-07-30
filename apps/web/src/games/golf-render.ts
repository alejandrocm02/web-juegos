import {
  GOLF,
  GOLF_SURFACE_COLORS,
  motionOffsetPublic,
  type GolfBallState,
  type GolfLevel,
} from '@arcade/shared';

/** Longitud de arrastre (en unidades del mundo) que equivale a potencia maxima. */
export const MAX_DRAG = 170;

export interface RenderBall extends GolfBallState {
  /** Posicion interpolada que se dibuja, distinta de la autoritativa del servidor. */
  rx: number;
  ry: number;
}

export interface PlayerLook {
  color: string;
  icon: string;
  name: string;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface GolfFrame {
  level: GolfLevel;
  balls: RenderBall[];
  camera: Camera;
  /** Segundos transcurridos del nivel, para los obstaculos moviles. */
  time: number;
  colorOf: Map<string, PlayerLook>;
  myId?: string;
  aim?: { ball: RenderBall; drag: { x: number; y: number } } | null;
}

/**
 * Dibuja un fotograma completo del minigolf.
 *
 * El borrado ocurre aqui una unica vez: si cada capa limpiara el canvas por su
 * cuenta, la ultima en dibujarse borraria a las anteriores y el nivel no se
 * veria (justo lo que ocurria antes de extraer este modulo).
 */
export function drawGolfFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: GolfFrame,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const backdrop = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  backdrop.addColorStop(0, '#071019');
  backdrop.addColorStop(0.55, '#09131d');
  backdrop.addColorStop(1, '#05080f');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(103,232,249,0.025)';
  for (let x = 0; x < canvas.width; x += 44) ctx.fillRect(x, 0, 1, canvas.height);
  for (let y = 0; y < canvas.height; y += 44) ctx.fillRect(0, y, canvas.width, 1);

  drawLevel(ctx, canvas, frame.level, frame.camera, frame.time);
  drawBalls(ctx, canvas, frame.balls, frame.camera, frame.colorOf, frame.myId);
  if (frame.aim) drawAim(ctx, canvas, frame.camera, frame.aim.ball, frame.aim.drag);
}

function applyCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: Camera) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: GolfLevel,
  camera: Camera,
  time: number,
): void {
  applyCamera(ctx, canvas, camera);

  for (const pad of level.pads) {
    const offset = pad.motion ? motionOffsetPublic(pad.motion, time) : { x: 0, y: 0 };
    const x = pad.rect.x + offset.x;
    const y = pad.rect.y + offset.y;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 5, y + 7, pad.rect.w, pad.rect.h);
    const surface = ctx.createLinearGradient(x, y, x, y + pad.rect.h);
    surface.addColorStop(0, GOLF_SURFACE_COLORS[pad.surface]);
    surface.addColorStop(1, colorShade(pad.surface));
    ctx.fillStyle = surface;
    ctx.fillRect(x, y, pad.rect.w, pad.rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, pad.rect.w, pad.rect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(x + 1, y + 1, pad.rect.w - 2, Math.min(3, pad.rect.h - 2));
  }

  for (const ramp of level.ramps) {
    const gradient = ctx.createLinearGradient(ramp.rect.x, 0, ramp.rect.x + ramp.rect.w, 0);
    gradient.addColorStop(0, 'rgba(168,85,247,0.15)');
    gradient.addColorStop(1, 'rgba(168,85,247,0.6)');
    ctx.fillStyle = gradient;
    ctx.fillRect(ramp.rect.x, ramp.rect.y, ramp.rect.w, ramp.rect.h);
    ctx.strokeStyle = 'rgba(216,180,254,0.7)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(ramp.rect.x, ramp.rect.y, ramp.rect.w, ramp.rect.h);
  }

  for (const checkpoint of level.checkpoints) {
    ctx.strokeStyle = 'rgba(74,222,128,0.5)';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(checkpoint.rect.x, checkpoint.rect.y, checkpoint.rect.w, checkpoint.rect.h);
    ctx.setLineDash([]);
  }

  // Hoyo
  ctx.beginPath();
  ctx.arc(level.hole.x, level.hole.y, GOLF.holeRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#010204';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(level.hole.x, level.hole.y);
  ctx.lineTo(level.hole.x, level.hole.y - 34);
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(level.hole.x, level.hole.y - 34, 18, 10);

  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const wall of level.walls) {
    const offset = wall.motion ? motionOffsetPublic(wall.motion, time) : { x: 0, y: 0 };
    ctx.beginPath();
    ctx.moveTo(wall.a.x + offset.x, wall.a.y + offset.y);
    ctx.lineTo(wall.b.x + offset.x, wall.b.y + offset.y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b7c2cf';
  ctx.lineWidth = 3.5;
  for (const wall of level.walls) {
    const offset = wall.motion ? motionOffsetPublic(wall.motion, time) : { x: 0, y: 0 };
    ctx.beginPath();
    ctx.moveTo(wall.a.x + offset.x, wall.a.y + offset.y);
    ctx.lineTo(wall.b.x + offset.x, wall.b.y + offset.y);
    ctx.stroke();
  }

  for (const circle of level.circles) {
    ctx.beginPath();
    ctx.arc(circle.pos.x + 3, circle.pos.y + 4, circle.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(circle.pos.x, circle.pos.y, circle.radius, 0, Math.PI * 2);
    ctx.fillStyle = circle.kind === 'bumper' ? '#f472b6' : '#6f7d91';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (const blade of level.blades) {
    ctx.save();
    ctx.translate(blade.center.x, blade.center.y);
    ctx.rotate(blade.phase + blade.angularSpeed * time);
    ctx.fillStyle = '#dbe4ee';
    for (let i = 0; i < blade.arms; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / blade.arms);
      ctx.fillRect(0, -blade.armRadius, blade.armLength, blade.armRadius * 2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, blade.armRadius * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(226,232,240,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, level.size.w, level.size.h);
}

function drawBalls(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  balls: RenderBall[],
  camera: Camera,
  colorOf: Map<string, PlayerLook>,
  myId?: string,
): void {
  applyCamera(ctx, canvas, camera);
  for (const ball of balls) {
    if (ball.holed) continue;
    const info = colorOf.get(ball.playerId);
    const isMine = ball.playerId === myId;
    const radius = GOLF.ballRadius * (1 + ball.z / 90);

    if (ball.z > 0.5) {
      ctx.beginPath();
      ctx.arc(ball.rx, ball.ry + ball.z * 0.25, GOLF.ballRadius * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(ball.rx + 1.5, ball.ry + 2.5, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ball.rx, ball.ry, radius, 0, Math.PI * 2);
    ctx.fillStyle = info?.color ?? '#e2e8f0';
    ctx.globalAlpha = isMine ? 1 : 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = isMine ? 2.5 : 1;
    ctx.strokeStyle = isMine ? '#f8fafc' : 'rgba(248,250,252,0.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      ball.rx - radius * 0.3,
      ball.ry - radius * 0.35,
      Math.max(1, radius * 0.22),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ball.strokes), ball.rx, ball.ry);

    if (info) {
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.font = '10px sans-serif';
      ctx.fillText(info.name, ball.rx, ball.ry - radius - 8);
    }
  }
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  ball: RenderBall,
  drag: { x: number; y: number },
): void {
  applyCamera(ctx, canvas, camera);
  const dx = ball.rx - drag.x;
  const dy = ball.ry - drag.y;
  const distance = Math.min(MAX_DRAG, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);

  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(34,211,238,0.9)';
  ctx.beginPath();
  ctx.moveTo(ball.rx, ball.ry);
  ctx.lineTo(
    ball.rx + Math.cos(angle) * distance * 1.6,
    ball.ry + Math.sin(angle) * distance * 1.6,
  );
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(248,250,252,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ball.rx, ball.ry);
  ctx.lineTo(drag.x, drag.y);
  ctx.stroke();

  const ratio = distance / MAX_DRAG;
  ctx.beginPath();
  ctx.arc(ball.rx, ball.ry, GOLF.ballRadius + 6, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.strokeStyle = ratio > 0.8 ? '#f43f5e' : ratio > 0.5 ? '#fbbf24' : '#4ade80';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function colorShade(surface: keyof typeof GOLF_SURFACE_COLORS): string {
  switch (surface) {
    case 'green':
      return '#14532d';
    case 'sand':
      return '#9a6c2c';
    case 'ice':
      return '#397c9c';
    case 'turbo':
      return '#075985';
    case 'stone':
      return '#374151';
    default:
      return GOLF_SURFACE_COLORS[surface];
  }
}
