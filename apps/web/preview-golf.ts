/**
 * Banco de pruebas del renderizador del minigolf.
 *
 * Dibuja un hoyo completo con una camara fija, sin servidor ni partida, para
 * poder juzgar un cambio visual de un vistazo. El juego real encuadra pegado a
 * la bola, y a ese zoom no se ven ni los muros ni los obstaculos, que es justo
 * donde se nota el relieve.
 *
 * Solo se sirve en desarrollo (`vite dev`); no entra en el bundle de produccion.
 */
import { getGolfLevel } from '@arcade/shared';
import { drawGolfFrame, type PlayerLook, type RenderBall } from './src/games/golf-render.js';

const canvas = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const levelId = Number(new URLSearchParams(location.search).get('hoyo') ?? 3);
const level = getGolfLevel(levelId);

const looks = new Map<string, PlayerLook>([
  ['a', { color: '#38bdf8', icon: 'circle', name: 'Ana' }],
  ['b', { color: '#f472b6', icon: 'triangle', name: 'Bea' }],
]);

function ball(playerId: string, x: number, y: number, z = 0): RenderBall {
  return {
    playerId,
    x,
    y,
    vx: 0,
    vy: 0,
    z,
    airborne: z > 0,
    strokes: 2,
    holed: false,
    holedAtMs: null,
    ace: false,
    aceEligible: true,
    outOfBounds: false,
    finished: false,
    rx: x,
    ry: y,
  };
}

// Encuadre que abarca todo el hoyo, para ver muros, obstaculos y bandera.
const bounds = level.pads.reduce(
  (acc, pad) => ({
    minX: Math.min(acc.minX, pad.rect.x),
    minY: Math.min(acc.minY, pad.rect.y),
    maxX: Math.max(acc.maxX, pad.rect.x + pad.rect.w),
    maxY: Math.max(acc.maxY, pad.rect.y + pad.rect.h),
  }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
);
const zoom = Math.min(
  (canvas.width * 0.92) / (bounds.maxX - bounds.minX),
  (canvas.height * 0.92) / (bounds.maxY - bounds.minY),
);

drawGolfFrame(ctx, canvas, {
  level,
  balls: [
    ball('a', level.start.x, level.start.y),
    ball('b', level.start.x + 46, level.start.y - 18, 22),
  ],
  camera: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, zoom },
  time: 1.2,
  colorOf: looks,
  myId: 'a',
  aim: null,
});
