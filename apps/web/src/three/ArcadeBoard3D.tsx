import {
  SPORT_FIELD,
  TEAM_META,
  type ArcadeSportId,
  type ArcadeSportSnapshot,
  type PublicPlayer,
  type TeamId,
} from '@arcade/shared';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  canvasTexture,
  createStage,
  disposeTree,
  fitCamera,
  glow,
  mesh,
  setKeyLight,
  std,
  type Stage,
} from './stage.js';

/**
 * Air Hockey y Tenis de mesa en 3D, vistos desde detrás del propio lado.
 *
 * Disco, bola y palas salen de los snapshots del servidor. El puntero se
 * proyecta sobre la mesa y se devuelve como punto del campo (0..1), que la
 * vista convierte en el mismo `sport:input` que envía la 2D.
 */

interface Props {
  game: ArcadeSportId;
  getSnapshot: () => ArcadeSportSnapshot;
  players: PublicPlayer[];
  meId: string;
  /** Lado del jugador; sin equipo (espectador) la mesa se ve de lado. */
  myTeam: TeamId | undefined;
  /** Punto señalado, en fracciones del campo completo (x a lo largo, y a lo ancho). */
  onAim: (fieldX: number, fieldY: number) => void;
  onGiveUp: (reason: string) => void;
}

const F = SPORT_FIELD;
const S = 0.003;
const HX = (F.width * S) / 2;
const HZ = (F.height * S) / 2;
const toX = (x: number) => (x - F.width / 2) * S;
const toZ = (y: number) => (y - F.height / 2) * S;

interface PaddleVisual {
  group: THREE.Group;
  x: number;
  y: number;
}

export default function ArcadeBoard3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const refit = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: Stage;
    try {
      stage = createStage(canvas, {
        onFrame: (dt) => frame(dt),
        onResize: () => fit(),
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    const hockey = latest.current.game === 'air-hockey';
    scene.background = new THREE.Color(0x080a16);
    scene.fog = new THREE.Fog(0x080a16, 7, 22);
    stage.hemi.intensity = 0.7;
    stage.key.intensity = 1.9;
    setKeyLight(stage.key, [1, 5, 2], [0, 0, 0], 3, 12);
    buildTable(scene, hockey);

    const paddles = new Map<string, PaddleVisual>();
    const ballRadius = (hockey ? F.hockeyPuckRadius : F.tennisBallRadius) * S;
    const ball = mesh(
      hockey
        ? new THREE.CylinderGeometry(ballRadius, ballRadius, 0.02, 24)
        : new THREE.SphereGeometry(ballRadius * 1.25, 18, 12),
      hockey
        ? std(0xe8faff, 0.3, 0, { emissive: 0x67e8f9, emissiveIntensity: 0.5 })
        : std(0xfb923c, 0.4),
    );
    scene.add(ball);
    const smoothBall = { x: F.width / 2, y: F.height / 2, ready: false };

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const aimAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      if (Math.abs(ray.ray.direction.y) < 1e-4) return;
      const t = -ray.ray.origin.y / ray.ray.direction.y;
      if (t <= 0) return;
      const x = ray.ray.origin.x + ray.ray.direction.x * t;
      const z = ray.ray.origin.z + ray.ray.direction.z * t;
      latest.current.onAim(
        Math.max(0, Math.min(1, (x + HX) / (HX * 2))),
        Math.max(0, Math.min(1, (z + HZ) / (HZ * 2))),
      );
    };
    const onDown = (event: PointerEvent) => {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* Sin captura el gesto sigue funcionando dentro del lienzo. */
      }
      aimAt(event);
    };
    const onMove = (event: PointerEvent) => {
      if (event.buttons > 0 || event.pointerType === 'touch') aimAt(event);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);

    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    function fit() {
      const team = latest.current.myTeam;
      const portrait = camera.aspect < 1;
      camera.fov = portrait ? 52 : 42;
      camera.updateProjectionMatrix();
      // Rojo defiende la izquierda del campo (x negativo) y azul la derecha.
      const side = team === 'rojo' ? -1 : team === 'azul' ? 1 : 0;
      fitCamera(
        camera,
        side === 0 ? [0, 1, 0.85] : [side, portrait ? 0.95 : 0.6, 0],
        [0, 0, 0],
        [-HX - 0.1, 0, -HZ - 0.1, HX + 0.1, 0.2, HZ + 0.1],
        camGoal,
      );
      camera.position.copy(camGoal.position);
      camera.lookAt(camGoal.look);
    }
    refit.current = fit;
    fit();

    function frame(dt: number) {
      const { getSnapshot, players, meId } = latest.current;
      const snapshot = getSnapshot();
      const k = stage.reducedMotion ? 1 : 1 - Math.exp(-24 * dt);
      if (
        !smoothBall.ready ||
        Math.hypot(snapshot.ball.x - smoothBall.x, snapshot.ball.y - smoothBall.y) > 320
      ) {
        smoothBall.x = snapshot.ball.x;
        smoothBall.y = snapshot.ball.y;
        smoothBall.ready = true;
      }
      smoothBall.x += (snapshot.ball.x - smoothBall.x) * k;
      smoothBall.y += (snapshot.ball.y - smoothBall.y) * k;
      // En tenis la bola bota una vez en cada campo; es solo aspecto, no cambia el punto.
      const hop = hockey
        ? 0.012
        : ballRadius * 1.25 +
          0.16 * Math.abs(Math.cos((Math.PI * (smoothBall.x - F.width / 2)) / (F.width / 2)));
      ball.position.set(toX(smoothBall.x), hop, toZ(smoothBall.y));

      const seen = new Set<string>();
      for (const paddle of snapshot.paddles) {
        seen.add(paddle.playerId);
        let visual = paddles.get(paddle.playerId);
        if (!visual) {
          const player = players.find((entry) => entry.id === paddle.playerId);
          visual = {
            group: makePaddle(
              hockey,
              TEAM_META[paddle.team].color,
              player?.color ?? '#ffffff',
              paddle.playerId === meId,
            ),
            x: paddle.x,
            y: paddle.y,
          };
          scene.add(visual.group);
          paddles.set(paddle.playerId, visual);
        }
        visual.x += (paddle.x - visual.x) * k;
        visual.y += (paddle.y - visual.y) * k;
        visual.group.position.set(toX(visual.x), 0, toZ(visual.y));
      }
      for (const [id, visual] of paddles) {
        if (seen.has(id)) continue;
        scene.remove(visual.group);
        disposeTree(visual.group);
        paddles.delete(id);
      }
    }

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  useEffect(() => {
    refit.current();
  }, [props.myTeam]);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      className="block aspect-[4/5] w-full touch-none bg-black sm:aspect-[5/3]"
      aria-label={
        (props.game === 'air-hockey' ? 'Mesa de Air Hockey' : 'Mesa de tenis') +
        ' en 3D. Mueve el dedo o el ratón sobre tu lado para colocar la pala; también con WASD o flechas.'
      }
    />
  );
}

function makePaddle(hockey: boolean, team: string, accent: string, mine: boolean): THREE.Group {
  const group = new THREE.Group();
  if (hockey) {
    const radius = F.hockeyPaddleRadius * S;
    group.add(
      mesh(new THREE.CylinderGeometry(radius, radius, 0.035, 28), std(team, 0.3, 0.2), 0, 0.018, 0),
    );
    group.add(
      mesh(
        new THREE.CylinderGeometry(radius * 0.42, radius * 0.5, 0.08, 20),
        std(accent, 0.3, 0.2),
        0,
        0.07,
        0,
      ),
    );
    if (mine) {
      group.add(
        mesh(
          new THREE.TorusGeometry(radius * 1.05, 0.006, 6, 32).rotateX(Math.PI / 2),
          glow(0xffffff, 2),
          0,
          0.04,
          0,
          'none',
        ),
      );
    }
  } else {
    const width = F.tennisPaddleWidth * S;
    const length = F.tennisPaddleHeight * S;
    group.add(mesh(new THREE.BoxGeometry(width, 0.11, length), std(team, 0.45), 0, 0.065, 0));
    group.add(
      mesh(
        new THREE.BoxGeometry(width * 1.1, 0.02, length * 1.02),
        mine ? glow(0xffffff, 2) : std(accent, 0.4),
        0,
        0.18,
        0,
        'none',
      ),
    );
  }
  return group;
}

function buildTable(scene: THREE.Scene, hockey: boolean): void {
  scene.add(
    mesh(
      new THREE.CircleGeometry(24, 48).rotateX(-Math.PI / 2),
      std(0x13172a, 0.55, 0.15),
      0,
      -0.8,
      0,
      'receive',
    ),
  );
  const margin = F.margin * S;
  const red = TEAM_META.rojo.color;
  const blue = TEAM_META.azul.color;
  const top = canvasTexture(1000, 600, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    if (hockey) {
      gradient.addColorStop(0, '#f3dfe2');
      gradient.addColorStop(0.5, '#eef4ff');
      gradient.addColorStop(1, '#dde8fb');
    } else {
      gradient.addColorStop(0, '#16407e');
      gradient.addColorStop(1, '#1b3f86');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hockey ? 'rgba(30,60,120,0.75)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(F.margin, F.margin, w - F.margin * 2, h - F.margin * 2);
    ctx.beginPath();
    ctx.moveTo(w / 2, F.margin);
    ctx.lineTo(w / 2, h - F.margin);
    ctx.stroke();
    if (hockey) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 92, 0, Math.PI * 2);
      ctx.stroke();
      for (const [x, color] of [
        [F.margin, red],
        [w - F.margin, blue],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(x, h / 2 - F.goalHalfHeight);
        ctx.lineTo(x, h / 2 + F.goalHalfHeight);
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(F.margin, h / 2);
      ctx.lineTo(w - F.margin, h / 2);
      ctx.stroke();
    }
  });
  // La textura se pinta con x a lo largo de la mesa e y a lo ancho, igual que el campo.
  const surface = mesh(
    new THREE.PlaneGeometry(HX * 2, HZ * 2).rotateX(-Math.PI / 2),
    std(0xffffff, hockey ? 0.2 : 0.4, 0.05, { map: top }),
    0,
    0,
    0,
    'receive',
  );
  scene.add(surface);
  scene.add(
    mesh(
      new THREE.BoxGeometry(HX * 2 + 0.16, 0.5, HZ * 2 + 0.16),
      std(0x0f172a, 0.5, 0.2),
      0,
      -0.26,
      0,
    ),
  );
  const rail = std(0x1e293b, 0.4, 0.3);
  for (const side of [-1, 1]) {
    scene.add(
      mesh(
        new THREE.BoxGeometry(HX * 2 + 0.16, 0.09, 0.08),
        rail,
        0,
        0.03,
        side * (HZ + 0.04 - margin * 0.3),
      ),
    );
    scene.add(
      mesh(
        new THREE.BoxGeometry(HX * 2, 0.02, 0.02),
        glow(0x22d3ee, 2.4),
        0,
        0.085,
        side * (HZ + 0.04 - margin * 0.3),
        'none',
      ),
    );
    const color = side < 0 ? red : blue;
    if (hockey) {
      const goal = F.goalHalfHeight * S;
      const piece = HZ - goal;
      for (const end of [-1, 1]) {
        scene.add(
          mesh(
            new THREE.BoxGeometry(0.08, 0.09, piece),
            rail,
            side * (HX + 0.04 - margin * 0.3),
            0.03,
            end * (goal + piece / 2),
          ),
        );
      }
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.05, 0.03, goal * 2),
          glow(color, 3),
          side * (HX + 0.03),
          0.0,
          0,
          'none',
        ),
      );
    } else {
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.03, 0.03, HZ * 2),
          glow(color, 2.6),
          side * (HX + 0.03),
          0.0,
          0,
          'none',
        ),
      );
    }
    const light = new THREE.PointLight(color, 3.5, 6, 1.6);
    light.position.set(side * (HX + 0.4), 0.8, 0);
    scene.add(light);
  }
  if (!hockey) {
    scene.add(
      mesh(
        new THREE.BoxGeometry(0.012, 0.14, HZ * 2 + 0.1),
        std(0xf8fafc, 0.8, 0, { transparent: true, opacity: 0.55 }),
        0,
        0.07,
        0,
        'cast',
      ),
    );
    scene.add(
      mesh(new THREE.BoxGeometry(0.02, 0.015, HZ * 2 + 0.12), std(0xf8fafc, 0.5), 0, 0.145, 0),
    );
  }
  const lamp = new THREE.PointLight(0xfff1c9, 5, 7, 1.6);
  lamp.position.set(0, 2, 0);
  scene.add(lamp);
}
