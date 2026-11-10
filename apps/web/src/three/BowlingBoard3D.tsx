import {
  BOWLING_LANE,
  bowlingPinLayout,
  type BowlingBallState,
  type BowlingPinState,
} from '@arcade/shared';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { canvasTexture, createStage, glow, mesh, setKeyLight, std, type Stage } from './stage.js';

/**
 * Pista de bolos en 3D, con la cámara detrás de la bola.
 *
 * Igual que la mesa de billar, solo pinta lo que dice el servidor: la bola y
 * los bolos llegan por `getLive`. La dirección y el efecto se siguen eligiendo
 * con los deslizadores HTML de la vista, que ya son accesibles; aquí solo se
 * dibuja la trayectoria prevista.
 */

interface Props {
  getLive: () => { ball: BowlingBallState; pins: BowlingPinState[] };
  /** Punto de salida elegido (-1..1), o null si no es el turno del jugador. */
  aim: number | null;
  spin: number;
  onGiveUp: (reason: string) => void;
}

const S = 0.01;
const LENGTH = BOWLING_LANE.length * S;
const HALF = (BOWLING_LANE.width * S) / 2;
const GUTTER = BOWLING_LANE.gutterWidth * S;
const RB = BOWLING_LANE.ballRadius * S;
const RP = BOWLING_LANE.pinRadius * S;
const toX = (x: number) => x * S - HALF;
/** La línea de falta queda en z = LENGTH / 2 y los bolos hacia z negativo. */
const toZ = (y: number) => LENGTH / 2 - y * S;
const START_X = (aim: number) =>
  BOWLING_LANE.width / 2 +
  aim * ((BOWLING_LANE.width - BOWLING_LANE.gutterWidth * 2) / 2 - BOWLING_LANE.ballRadius);

interface PinVisual {
  pivot: THREE.Group;
  homeX: number;
  homeY: number;
  fall: number;
  axisX: number;
  axisZ: number;
}

export default function BowlingBoard3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: Stage;
    try {
      stage = createStage(canvas, {
        onFrame: (dt) => frame(dt),
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    scene.background = new THREE.Color(0x070914);
    scene.fog = new THREE.Fog(0x070914, 12, 34);
    stage.hemi.intensity = 0.5;
    stage.key.intensity = 1.4;
    setKeyLight(stage.key, [1.5, 7, 2], [0, 0, -2], 11, 26);

    buildLane(scene);

    const ballMesh = mesh(
      new THREE.SphereGeometry(RB, 32, 24),
      std(0xffffff, 0.15, 0.2, {
        map: canvasTexture(128, 64, (ctx, w, h) => {
          const gradient = ctx.createLinearGradient(0, 0, w, h);
          gradient.addColorStop(0, '#1d4ed8');
          gradient.addColorStop(0.5, '#22d3ee');
          gradient.addColorStop(1, '#4c1d95');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#050816';
          for (const [x, y] of [
            [58, 26],
            [70, 26],
            [64, 37],
          ] as const) {
            ctx.beginPath();
            ctx.arc(x, y, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }),
      }),
    );
    scene.add(ballMesh);

    const profile = (
      [
        [0, 0],
        [0.6, 0],
        [0.97, 0.07],
        [1, 0.12],
        [0.83, 0.19],
        [0.45, 0.26],
        [0.4, 0.29],
        [0.57, 0.335],
        [0.52, 0.365],
        [0.27, 0.385],
        [0, 0.388],
      ] as const
    ).map(([radius, height]) => new THREE.Vector2(radius * RP, height));
    const pinGeometry = new THREE.LatheGeometry(profile, 20);
    const bandGeometry = new THREE.CylinderGeometry(RP * 0.46, RP * 0.44, 0.022, 16);
    const pinMaterial = std(0xf8fafc, 0.25);
    const bandMaterial = std(0xdc2626, 0.4);
    const pins = new Map<number, PinVisual>();
    for (const home of bowlingPinLayout()) {
      const pivot = new THREE.Group();
      pivot.add(
        mesh(pinGeometry, pinMaterial),
        mesh(bandGeometry, bandMaterial, 0, 0.275, 0, 'none'),
      );
      scene.add(pivot);
      pins.set(home.id, { pivot, homeX: home.x, homeY: home.y, fall: 0, axisX: 1, axisZ: 0 });
    }

    // Trayectoria prevista: puntos sobre la misma curva que dibuja la vista 2D.
    const dotGeometry = new THREE.SphereGeometry(0.022, 8, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
    const dots = Array.from({ length: 22 }, () => {
      const dot = mesh(dotGeometry, dotMaterial, 0, 0.03, 0, 'none');
      scene.add(dot);
      return dot;
    });

    const axis = new THREE.Vector3();
    let lastX = 0;
    let lastY = 0;
    let camZ = toZ(0) + 2.5;

    function frame(dt: number) {
      const state = latest.current;
      const { ball, pins: livePins } = state.getLive();

      // Antes de lanzar, la bola espera en el punto de salida elegido.
      const waiting = !ball.rolling && state.aim !== null;
      const bx = waiting ? START_X(state.aim ?? 0) : ball.x;
      const by = waiting ? 0 : ball.y;
      const dx = (bx - lastX) * S;
      const dz = -(by - lastY) * S;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-5 && moved < 0.6) {
        axis.set(dz / moved, 0, -dx / moved);
        ballMesh.rotateOnWorldAxis(axis, moved / RB);
      }
      lastX = bx;
      lastY = by;
      ballMesh.position.set(toX(bx), ball.gutter ? RB - 0.035 : RB, toZ(by));
      ballMesh.visible = by < BOWLING_LANE.length + 130;

      for (const visual of pins.values()) visual.pivot.visible = false;
      for (const pin of livePins) {
        const visual = pins.get(pin.id);
        if (!visual) continue;
        visual.pivot.visible = true;
        visual.pivot.position.set(toX(pin.x), 0, toZ(pin.y));
        if (pin.standing) {
          visual.fall = 0;
          visual.pivot.quaternion.identity();
          continue;
        }
        if (visual.fall === 0) {
          // Cae hacia donde lo han empujado; si no se ha movido, hacia el fondo.
          const px = (pin.x - visual.homeX) * S;
          const pz = -(pin.y - visual.homeY) * S;
          const length = Math.hypot(px, pz);
          const fx = length > 1e-4 ? px / length : 0;
          const fz = length > 1e-4 ? pz / length : -1;
          visual.axisX = fz;
          visual.axisZ = -fx;
        }
        visual.fall = stage.reducedMotion ? 1 : Math.min(1, visual.fall + dt * 3.6);
        const angle = (Math.PI / 2) * (1 - (1 - visual.fall) * (1 - visual.fall));
        visual.pivot.quaternion.setFromAxisAngle(axis.set(visual.axisX, 0, visual.axisZ), angle);
        visual.pivot.position.y = Math.sin(angle) * RP * 0.9;
      }

      const showPath = state.aim !== null && !ball.rolling;
      const startX = START_X(state.aim ?? 0);
      // Mismos desvíos que la 2D (90 y 150 px sobre 360 de ancho), en centímetros.
      const scale = BOWLING_LANE.width / 360;
      dots.forEach((dot, index) => {
        dot.visible = showPath;
        if (!showPath) return;
        const t = (index + 1) / (dots.length + 1);
        const controlX = startX + state.spin * 90 * scale;
        const endX = startX + state.spin * 150 * scale;
        const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
        const y =
          (1 - t) * (1 - t) * 20 +
          2 * (1 - t) * t * BOWLING_LANE.length * 0.55 +
          t * t * BOWLING_LANE.length;
        dot.position.set(toX(x), 0.03, toZ(y));
      });

      // Cámara detrás de la bola: la acompaña y se detiene antes de los bolos.
      const portrait = camera.aspect < 1;
      const back = portrait ? 2.7 : 2.3;
      const follow = Math.max(toZ(BOWLING_LANE.length) + 4.4, toZ(by) + back);
      camZ += (follow - camZ) * (stage.reducedMotion ? 1 : Math.min(1, dt * 5));
      camera.fov = portrait ? 52 : 44;
      camera.updateProjectionMatrix();
      camera.position.set(0, portrait ? 1.2 : 0.95, camZ);
      camera.lookAt(0, 0.15, camZ - 7.5);
    }

    return () => {
      pinGeometry.dispose();
      bandGeometry.dispose();
      dotGeometry.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      role="img"
      className="block aspect-[360/520] w-full bg-black"
      aria-label="Pista de bolos en 3D"
    />
  );
}

function buildLane(scene: THREE.Scene): void {
  const from = toZ(-140);
  const to = toZ(BOWLING_LANE.length + 110);
  const length = from - to;
  const centre = (from + to) / 2;
  const playable = HALF - GUTTER;

  scene.add(
    mesh(
      new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2),
      std(0x0d1020, 0.55, 0.15),
      0,
      -0.06,
      0,
      'receive',
    ),
  );
  const planks = canvasTexture(256, 1024, (ctx, w, h) => {
    for (let i = 0; i < 13; i++) {
      const tone = 196 + Math.round(Math.random() * 26);
      ctx.fillStyle = `rgb(${tone + 18},${tone - 26},${tone - 96})`;
      ctx.fillRect((i * w) / 13, 0, w / 13 + 1, h);
      ctx.fillStyle = 'rgba(80,40,10,0.35)';
      ctx.fillRect((i * w) / 13, 0, 1.2, h);
    }
    // Flechas de referencia y línea de falta, donde las tiene una pista real.
    ctx.fillStyle = 'rgba(60,30,10,0.75)';
    for (let i = -3; i <= 3; i++) {
      const x = w / 2 + i * 30;
      const y = h * 0.74 + Math.abs(i) * 14;
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x - 6, y + 9);
      ctx.lineTo(x + 6, y + 9);
      ctx.fill();
    }
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(0, h * (1 - 140 / (BOWLING_LANE.length + 250)) - 2, w, 4);
  });
  scene.add(
    mesh(
      new THREE.BoxGeometry(playable * 2, 0.06, length),
      std(0xffffff, 0.22, 0.05, { map: planks }),
      0,
      -0.03,
      centre,
      'receive',
    ),
  );
  // Zona de aproximación: sin ella la pista parecía un tablón flotando en negro.
  scene.add(
    mesh(
      new THREE.BoxGeometry(3.4, 0.06, 5),
      std(0x8a5a2b, 0.35, 0.05),
      0,
      -0.034,
      from + 2.5 - 0.02,
      'receive',
    ),
  );
  const dark = std(0x0a0c14, 0.5, 0.3);
  for (const side of [-1, 1]) {
    scene.add(
      mesh(
        new THREE.BoxGeometry(GUTTER, 0.03, length),
        dark,
        side * (playable + GUTTER / 2),
        -0.045,
        centre,
        'receive',
      ),
    );
    scene.add(
      mesh(
        new THREE.BoxGeometry(0.5, 0.16, length),
        std(0x151a2e, 0.5, 0.2),
        side * (HALF + 0.25),
        0.02,
        centre,
        'receive',
      ),
    );
    scene.add(
      mesh(
        new THREE.BoxGeometry(0.03, 0.03, length),
        glow(side < 0 ? 0x22d3ee : 0xf472b6, 3),
        side * (HALF + 0.03),
        0.115,
        centre,
        'none',
      ),
    );
    for (const z of [3, -3]) {
      const tube = new THREE.PointLight(side < 0 ? 0x22d3ee : 0xf472b6, 3, 7, 1.6);
      tube.position.set(side * 1.1, 0.5, z);
      scene.add(tube);
    }
  }
  // Plataforma de bolos a todo el ancho: la fila más ancha no cabe en la calle.
  const deckFrom = toZ(BOWLING_LANE.length - 3 * BOWLING_LANE.pinSpacing - 25);
  scene.add(
    mesh(
      new THREE.BoxGeometry(HALF * 2, 0.064, deckFrom - to),
      std(0xf1d9a8, 0.3),
      0,
      -0.03,
      (deckFrom + to) / 2,
      'receive',
    ),
  );
  scene.add(
    mesh(new THREE.BoxGeometry(2.6, 1.5, 0.3), std(0x0b0e1a, 0.7), 0, 0.72, to - 0.2, 'receive'),
  );
  scene.add(
    mesh(new THREE.BoxGeometry(2.6, 0.5, 1.6), std(0x10152a, 0.6), 0, 1.3, to + 0.7, 'none'),
  );
  scene.add(
    mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), glow(0xfbbf24, 3), 0, 1.02, to + 1.45, 'none'),
  );
  const deck = new THREE.SpotLight(0xfff4d6, 30, 7, 0.6, 0.5, 1.4);
  deck.position.set(0, 2.3, to + 3.4);
  deck.target.position.set(0, 0, to + 0.9);
  scene.add(deck, deck.target);
}
