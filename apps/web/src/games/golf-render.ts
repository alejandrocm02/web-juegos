import {
  GOLF,
  GOLF_SURFACE_COLORS,
  motionOffsetPublic,
  type GolfBallState,
  type GolfLevel,
} from '@arcade/shared';
import { resetToViewport, type Viewport } from '../lib/canvas.js';

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

interface CoursePalette {
  skyA: string;
  skyB: string;
  ground: string;
  rail: string;
  railLight: string;
  accent: string;
  scenery: 'park' | 'forest' | 'quarry' | 'sky' | 'crystal' | 'clock' | 'finale';
}

/**
 * Dibuja un fotograma completo del minigolf.
 *
 * El borrado ocurre aqui una unica vez: si cada capa limpiara el view por su
 * cuenta, la ultima en dibujarse borraria a las anteriores y el nivel no se
 * veria (justo lo que ocurria antes de extraer este modulo).
 */
export function drawGolfFrame(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  frame: GolfFrame,
): void {
  resetToViewport(ctx, view);
  ctx.clearRect(0, 0, view.width, view.height);
  const palette = paletteFor(frame.level.id);
  const backdrop = ctx.createLinearGradient(0, 0, view.width, view.height);
  backdrop.addColorStop(0, palette.skyA);
  backdrop.addColorStop(0.58, palette.skyB);
  backdrop.addColorStop(1, '#03050a');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, view.width, view.height);
  drawScreenAtmosphere(ctx, view, frame.level.id, palette);

  drawLevel(ctx, view, frame.level, frame.camera, frame.time, palette);
  drawBalls(ctx, view, frame.balls, frame.camera, frame.colorOf, frame.myId);
  if (frame.aim) drawAim(ctx, view, frame.camera, frame.aim.ball, frame.aim.drag);
}

function applyCamera(ctx: CanvasRenderingContext2D, view: Viewport, camera: Camera) {
  resetToViewport(ctx, view);
  ctx.translate(view.width / 2, view.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  level: GolfLevel,
  camera: Camera,
  time: number,
  palette: CoursePalette,
): void {
  applyCamera(ctx, view, camera);
  drawWorldScenery(ctx, level, time, palette);

  for (const pad of level.pads) {
    const offset = pad.motion ? motionOffsetPublic(pad.motion, time) : { x: 0, y: 0 };
    const x = pad.rect.x + offset.x;
    const y = pad.rect.y + offset.y;
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(x + 7, y + 10, pad.rect.w, pad.rect.h);
    ctx.fillStyle = palette.rail;
    ctx.fillRect(x - 4, y - 4, pad.rect.w + 8, pad.rect.h + 8);
    ctx.fillStyle = palette.railLight;
    ctx.fillRect(x - 2, y - 2, pad.rect.w + 4, 2);
    const surface = ctx.createLinearGradient(x, y, x, y + pad.rect.h);
    surface.addColorStop(0, GOLF_SURFACE_COLORS[pad.surface]);
    surface.addColorStop(1, colorShade(pad.surface));
    ctx.fillStyle = surface;
    ctx.fillRect(x, y, pad.rect.w, pad.rect.h);
    drawSurfaceTexture(ctx, pad.surface, x, y, pad.rect.w, pad.rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
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
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    const horizontal = Math.abs(ramp.dir.x) >= Math.abs(ramp.dir.y);
    for (let step = 0.2; step <= 0.8; step += 0.2) {
      ctx.beginPath();
      if (horizontal) {
        const px = ramp.rect.x + ramp.rect.w * step;
        ctx.moveTo(px - Math.sign(ramp.dir.x || 1) * 7, ramp.rect.y + ramp.rect.h * 0.35);
        ctx.lineTo(px, ramp.rect.y + ramp.rect.h * 0.5);
        ctx.lineTo(px - Math.sign(ramp.dir.x || 1) * 7, ramp.rect.y + ramp.rect.h * 0.65);
      } else {
        const py = ramp.rect.y + ramp.rect.h * step;
        ctx.moveTo(ramp.rect.x + ramp.rect.w * 0.35, py - Math.sign(ramp.dir.y || 1) * 7);
        ctx.lineTo(ramp.rect.x + ramp.rect.w * 0.5, py);
        ctx.lineTo(ramp.rect.x + ramp.rect.w * 0.65, py - Math.sign(ramp.dir.y || 1) * 7);
      }
      ctx.stroke();
    }
  }

  for (const checkpoint of level.checkpoints) {
    ctx.fillStyle = 'rgba(74,222,128,0.08)';
    ctx.fillRect(checkpoint.rect.x, checkpoint.rect.y, checkpoint.rect.w, checkpoint.rect.h);
    ctx.strokeStyle = 'rgba(74,222,128,0.7)';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(checkpoint.rect.x, checkpoint.rect.y, checkpoint.rect.w, checkpoint.rect.h);
    ctx.setLineDash([]);
  }

  // Hoyo
  ctx.beginPath();
  ctx.arc(level.hole.x, level.hole.y, GOLF.holeRadius + 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
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
  ctx.beginPath();
  ctx.moveTo(level.hole.x + 18, level.hole.y - 34);
  ctx.lineTo(level.hole.x + 13, level.hole.y - 29);
  ctx.lineTo(level.hole.x + 18, level.hole.y - 24);
  ctx.fillStyle = '#fb7185';
  ctx.fill();

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
  ctx.strokeStyle = palette.railLight;
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
    const obstacle = ctx.createLinearGradient(
      circle.pos.x - circle.radius,
      circle.pos.y - circle.radius,
      circle.pos.x + circle.radius,
      circle.pos.y + circle.radius,
    );
    obstacle.addColorStop(0, circle.kind === 'bumper' ? '#f9a8d4' : '#aeb9c8');
    obstacle.addColorStop(0.45, circle.kind === 'bumper' ? '#ec4899' : '#64748b');
    obstacle.addColorStop(1, circle.kind === 'bumper' ? '#831843' : '#1e293b');
    ctx.fillStyle = obstacle;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (const blade of level.blades) {
    ctx.save();
    ctx.translate(blade.center.x, blade.center.y);
    ctx.rotate(blade.phase + blade.angularSpeed * time);
    const bladeGradient = ctx.createLinearGradient(0, 0, blade.armLength, 0);
    bladeGradient.addColorStop(0, palette.rail);
    bladeGradient.addColorStop(0.5, palette.railLight);
    bladeGradient.addColorStop(1, palette.accent);
    ctx.fillStyle = bladeGradient;
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

  ctx.strokeStyle = 'rgba(226,232,240,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, level.size.w, level.size.h);
}

function drawScreenAtmosphere(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  levelId: number,
  palette: CoursePalette,
): void {
  ctx.fillStyle = palette.ground;
  ctx.globalAlpha = 0.16;
  for (let y = 14; y < view.height; y += 34) {
    for (let x = (y / 34) % 2 === 0 ? 14 : 31; x < view.width; x += 42) {
      const size = 1 + ((x * 7 + y * 11 + levelId) % 3);
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.globalAlpha = 1;

  const glow = ctx.createLinearGradient(0, 0, view.width, 0);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.5, palette.accent + '18');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.width, 4);
}

function drawWorldScenery(
  ctx: CanvasRenderingContext2D,
  level: GolfLevel,
  time: number,
  palette: CoursePalette,
): void {
  ctx.fillStyle = palette.ground;
  ctx.fillRect(-80, -80, level.size.w + 160, level.size.h + 160);

  for (let index = 0; index < 34; index += 1) {
    const x = 28 + ((index * 173 + level.id * 97) % Math.max(60, level.size.w - 56));
    const y = 28 + ((index * 109 + level.id * 61) % Math.max(60, level.size.h - 56));
    if (nearPlayableArea(level, x, y, 34)) continue;
    drawSceneryItem(ctx, palette.scenery, x, y, index, time, palette);
  }
}

function nearPlayableArea(level: GolfLevel, x: number, y: number, margin: number): boolean {
  if (Math.hypot(x - level.start.x, y - level.start.y) < margin * 1.4) return true;
  if (Math.hypot(x - level.hole.x, y - level.hole.y) < margin * 1.4) return true;
  return level.pads.some(
    (pad) =>
      x >= pad.rect.x - margin &&
      x <= pad.rect.x + pad.rect.w + margin &&
      y >= pad.rect.y - margin &&
      y <= pad.rect.y + pad.rect.h + margin,
  );
}

function drawSceneryItem(
  ctx: CanvasRenderingContext2D,
  kind: CoursePalette['scenery'],
  x: number,
  y: number,
  index: number,
  time: number,
  palette: CoursePalette,
): void {
  ctx.save();
  ctx.translate(x, y + (kind === 'sky' ? Math.sin(time * 0.8 + index) * 5 : 0));

  if (kind === 'quarry') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-13, 7, 30, 7);
    ctx.beginPath();
    ctx.moveTo(-14, 8);
    ctx.lineTo(-7, -11);
    ctx.lineTo(8, -15);
    ctx.lineTo(16, 8);
    ctx.fillStyle = index % 2 === 0 ? '#596271' : '#3f4856';
    ctx.fill();
  } else if (kind === 'sky') {
    ctx.globalAlpha = 0.45 + (index % 3) * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, 2 + (index % 3), 0, Math.PI * 2);
    ctx.fillStyle = index % 2 === 0 ? '#e0f2fe' : palette.accent;
    ctx.fill();
  } else if (kind === 'crystal') {
    ctx.beginPath();
    ctx.moveTo(0, -15 - (index % 7));
    ctx.lineTo(8, 3);
    ctx.lineTo(0, 12);
    ctx.lineTo(-7, 3);
    ctx.fillStyle = index % 2 === 0 ? '#67e8f9' : '#a78bfa';
    ctx.globalAlpha = 0.55;
    ctx.fill();
  } else if (kind === 'clock') {
    const radius = 8 + (index % 5);
    ctx.strokeStyle = index % 2 === 0 ? '#d6b36a' : '#8994a7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let tooth = 0; tooth < 6; tooth += 1) {
      ctx.save();
      ctx.rotate((tooth * Math.PI) / 3 + time * 0.12);
      ctx.fillStyle = '#576173';
      ctx.fillRect(radius - 1, -2, 5, 4);
      ctx.restore();
    }
  } else if (kind === 'finale') {
    ctx.rotate(index * 1.7);
    ctx.fillStyle = index % 3 === 0 ? '#fbbf24' : index % 3 === 1 ? '#f472b6' : '#67e8f9';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-2, -9, 4, 18);
  } else if (kind === 'forest') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-13, 7, 27, 6);
    ctx.beginPath();
    ctx.arc(-6, 1, 10 + (index % 3), 0, Math.PI * 2);
    ctx.arc(5, -2, 12 + (index % 4), 0, Math.PI * 2);
    ctx.arc(12, 5, 8 + (index % 3), 0, Math.PI * 2);
    ctx.fillStyle = index % 2 === 0 ? '#14532d' : '#166534';
    ctx.fill();
  } else {
    ctx.fillStyle = '#263445';
    ctx.fillRect(-2, -9, 4, 18);
    ctx.beginPath();
    ctx.arc(0, -11, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -11, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(253,230,138,0.24)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSurfaceTexture(
  ctx: CanvasRenderingContext2D,
  surface: keyof typeof GOLF_SURFACE_COLORS,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.save();
  if (surface === 'green') {
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let stripe = 14; stripe < width; stripe += 28) {
      ctx.fillRect(x + stripe, y, 10, height);
    }
  } else if (surface === 'sand') {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#5f421f';
    for (let dot = 0; dot < Math.max(4, Math.floor((width * height) / 1800)); dot += 1) {
      const dx = (dot * 37 + width) % Math.max(1, width);
      const dy = (dot * 61 + height) % Math.max(1, height);
      ctx.fillRect(x + dx, y + dy, 2, 2);
    }
  } else if (surface === 'ice') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let crack = 18; crack < width; crack += 42) {
      ctx.beginPath();
      ctx.moveTo(x + crack, y + 4);
      ctx.lineTo(x + crack - 7, y + height * 0.45);
      ctx.lineTo(x + crack + 5, y + height - 4);
      ctx.stroke();
    }
  } else if (surface === 'turbo') {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    for (let chevron = 16; chevron < width; chevron += 28) {
      ctx.beginPath();
      ctx.moveTo(x + chevron - 6, y + height * 0.35);
      ctx.lineTo(x + chevron, y + height * 0.5);
      ctx.lineTo(x + chevron - 6, y + height * 0.65);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let seam = 24; seam < width; seam += 34) {
      ctx.beginPath();
      ctx.moveTo(x + seam, y);
      ctx.lineTo(x + seam, y + height);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBalls(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  balls: RenderBall[],
  camera: Camera,
  colorOf: Map<string, PlayerLook>,
  myId?: string,
): void {
  applyCamera(ctx, view, camera);
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
  view: Viewport,
  camera: Camera,
  ball: RenderBall,
  drag: { x: number; y: number },
): void {
  applyCamera(ctx, view, camera);
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

function paletteFor(levelId: number): CoursePalette {
  const palettes: CoursePalette[] = [
    {
      skyA: '#071521',
      skyB: '#0b2530',
      ground: '#0b2b25',
      rail: '#3f2b1d',
      railLight: '#c18a4e',
      accent: '#67e8f9',
      scenery: 'park',
    },
    {
      skyA: '#111425',
      skyB: '#17263a',
      ground: '#102920',
      rail: '#293444',
      railLight: '#d8b66e',
      accent: '#fde68a',
      scenery: 'park',
    },
    {
      skyA: '#071810',
      skyB: '#10271a',
      ground: '#092519',
      rail: '#203d2c',
      railLight: '#65a878',
      accent: '#86efac',
      scenery: 'forest',
    },
    {
      skyA: '#101321',
      skyB: '#252033',
      ground: '#12271d',
      rail: '#56351f',
      railLight: '#d8a36b',
      accent: '#fbbf24',
      scenery: 'forest',
    },
    {
      skyA: '#07150f',
      skyB: '#122b1d',
      ground: '#082318',
      rail: '#32402d',
      railLight: '#799461',
      accent: '#4ade80',
      scenery: 'forest',
    },
    {
      skyA: '#17130f',
      skyB: '#28221c',
      ground: '#27231f',
      rail: '#4c3c31',
      railLight: '#a78d76',
      accent: '#fb923c',
      scenery: 'quarry',
    },
    {
      skyA: '#07111f',
      skyB: '#121637',
      ground: '#07101d',
      rail: '#26334b',
      railLight: '#94a3b8',
      accent: '#60a5fa',
      scenery: 'sky',
    },
    {
      skyA: '#061728',
      skyB: '#102849',
      ground: '#0b2539',
      rail: '#304965',
      railLight: '#a5f3fc',
      accent: '#67e8f9',
      scenery: 'crystal',
    },
    {
      skyA: '#16120f',
      skyB: '#29211a',
      ground: '#211b17',
      rail: '#463b33',
      railLight: '#d6b36a',
      accent: '#f59e0b',
      scenery: 'clock',
    },
    {
      skyA: '#160d25',
      skyB: '#17233e',
      ground: '#101c2c',
      rail: '#3b314d',
      railLight: '#c4b5fd',
      accent: '#f472b6',
      scenery: 'finale',
    },
  ];
  return palettes[Math.max(0, Math.min(palettes.length - 1, levelId - 1))]!;
}
