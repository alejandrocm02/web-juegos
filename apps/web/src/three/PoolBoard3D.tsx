import {
  EIGHT_BALL,
  POOL_TABLE,
  groupOfBall,
  poolPockets,
  type PoolBallState,
} from '@arcade/shared';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { slingShot } from './aim.js';
import {
  canvasTexture,
  createStage,
  fitCamera,
  glow,
  mesh,
  setKeyLight,
  std,
  type Stage,
} from './stage.js';

/**
 * Mesa de billar en 3D.
 *
 * Solo dibuja y recoge el gesto: las bolas llegan del servidor (por
 * `getBalls`, que lee el último snapshot) y el golpe sale por `onShoot` con el
 * mismo ángulo y potencia que envía la vista 2D. Ninguna regla vive aquí.
 */

interface Props {
  getBalls: () => PoolBallState[];
  isMyTurn: boolean;
  eightBall: boolean;
  onShoot: (angle: number, power: number) => void;
  onPower: (power: number) => void;
  onGiveUp: (reason: string) => void;
}

/** Centímetros del juego a metros de la escena. */
const S = 0.01;
const HX = (POOL_TABLE.width * S) / 2;
const HZ = (POOL_TABLE.height * S) / 2;
const R = POOL_TABLE.ballRadius * S;
const toX = (x: number) => x * S - HX;
const toZ = (y: number) => y * S - HZ;

type View = { name: string; dir: [number, number, number] };
const VIEWS: View[] = [
  { name: 'lateral', dir: [0, 1.05, 1] },
  { name: 'desde el fondo', dir: [-1, 0.85, 0] },
  { name: 'cenital', dir: [0, 1, 0.02] },
];

interface BallVisual {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  sink: number;
  seen: boolean;
}

export default function PoolBoard3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [view, setView] = useState<number | null>(null);
  const viewRef = useRef<number | null>(null);
  viewRef.current = view;
  const refit = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: Stage;
    try {
      stage = createStage(canvas, {
        onFrame: (dt) => frame(dt),
        onResize: () => fit(true),
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    scene.background = new THREE.Color(0x080b17);
    scene.fog = new THREE.Fog(0x080b17, 7, 24);
    stage.hemi.intensity = 0.55;
    stage.key.intensity = 2.2;
    setKeyLight(stage.key, [1.4, 4.2, 1.8], [0, 0, 0], 2.6, 12);

    buildTable(scene, latest.current.eightBall);

    const sphere = new THREE.SphereGeometry(R, 28, 20);
    const balls = new Map<number, BallVisual>();
    const axis = new THREE.Vector3();

    const guide = new THREE.Group();
    const guideLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    guide.add(guideLine);
    guide.visible = false;
    const stick = mesh(
      new THREE.CylinderGeometry(0.006, 0.012, 1.3, 10).rotateX(Math.PI / 2).translate(0, 0, -0.65),
      std(0xd9b67a, 0.4),
      0,
      0,
      0,
      'cast',
    );
    stick.visible = false;
    scene.add(guide, stick);

    // Puntería: gesto de tirachinas o teclado. `aim` es lo que se va a enviar.
    const aim = { active: false, keyboard: false, sx: 0, sy: 0, x: 0, z: -1, power: 0 };
    const forward = new THREE.Vector3();
    const groundForward = () => {
      camera.getWorldDirection(forward);
      forward.y = 0;
      // Vista cenital: «adelante» es hacia arriba en la pantalla.
      if (forward.lengthSq() < 0.04)
        forward.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
      forward.normalize();
      return { forwardX: forward.x, forwardZ: forward.z };
    };
    const cuePosition = () => balls.get(0);
    const canAim = () => latest.current.isMyTurn && Boolean(cuePosition()?.mesh.visible);
    const clearAim = () => {
      aim.active = false;
      aim.keyboard = false;
      aim.power = 0;
      latest.current.onPower(0);
    };
    const shoot = () => {
      const power = aim.power;
      const angle = Math.atan2(aim.z, aim.x);
      clearAim();
      if (power > 0 && latest.current.isMyTurn)
        latest.current.onShoot(angle, Math.max(0.03, power));
    };

    const onDown = (event: PointerEvent) => {
      if (!canAim()) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* Sin captura el gesto sigue funcionando mientras no salga del lienzo. */
      }
      aim.active = true;
      aim.keyboard = false;
      aim.sx = event.clientX;
      aim.sy = event.clientY;
      aim.power = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (!aim.active) return;
      const reach = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.42;
      const shot = slingShot(
        event.clientX - aim.sx,
        event.clientY - aim.sy,
        reach,
        groundForward(),
      );
      aim.power = shot?.power ?? 0;
      if (shot) {
        aim.x = shot.x;
        aim.z = shot.z;
      }
      latest.current.onPower(aim.power);
    };
    const onUp = () => {
      if (aim.active) shoot();
    };
    const onCancel = () => {
      if (aim.active) clearAim();
    };
    const onKey = (event: KeyboardEvent) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'Escape'];
      if (!keys.includes(event.key)) return;
      if (event.key === 'Escape') return clearAim();
      event.preventDefault();
      if (!canAim()) return;
      if (!aim.keyboard) {
        // Se parte de «hacia el fondo de la pantalla» y a media potencia.
        const basis = groundForward();
        aim.keyboard = true;
        aim.active = false;
        aim.x = basis.forwardX;
        aim.z = basis.forwardZ;
        aim.power = 0.5;
      }
      const turn = (event.shiftKey ? 0.004 : 0.03) * (event.key === 'ArrowLeft' ? -1 : 1);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const angle = Math.atan2(aim.z, aim.x) + turn;
        aim.x = Math.cos(angle);
        aim.z = Math.sin(angle);
      }
      if (event.key === 'ArrowUp') aim.power = Math.min(1, aim.power + 0.05);
      if (event.key === 'ArrowDown') aim.power = Math.max(0.05, aim.power - 0.05);
      latest.current.onPower(aim.power);
      if (event.key === ' ' || event.key === 'Enter') shoot();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onUp);
    canvas.addEventListener('keydown', onKey);

    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    const camLook = new THREE.Vector3();
    function fit(snap: boolean) {
      // En vertical la mesa se mira a lo largo: cabe entera y gana profundidad.
      const index = viewRef.current ?? (camera.aspect < 1 ? 1 : 0);
      camera.fov = camera.aspect < 1 ? 50 : 42;
      camera.updateProjectionMatrix();
      fitCamera(
        camera,
        VIEWS[index]?.dir ?? [0, 1, 1],
        [0, 0, 0],
        [-HX - 0.2, -0.05, -HZ - 0.2, HX + 0.2, 0.12, HZ + 0.2],
        camGoal,
      );
      if (snap || stage.reducedMotion) {
        camera.position.copy(camGoal.position);
        camLook.copy(camGoal.look);
        camera.lookAt(camLook);
      }
    }
    refit.current = () => fit(false);
    fit(true);

    function frame(dt: number) {
      const state = latest.current;
      for (const visual of balls.values()) visual.seen = false;
      for (const ball of state.getBalls()) {
        let visual = balls.get(ball.id);
        if (!visual) {
          const item = mesh(
            sphere,
            ballMaterial(ball, state.eightBall),
            toX(ball.x),
            R,
            toZ(ball.y),
          );
          scene.add(item);
          visual = { mesh: item, x: ball.x, y: ball.y, sink: ball.pocketed ? 1 : 0, seen: true };
          item.visible = !ball.pocketed;
          balls.set(ball.id, visual);
        }
        visual.seen = true;
        if (ball.pocketed) {
          // Se hunde en la tronera en vez de desaparecer de golpe.
          if (visual.sink < 1) {
            visual.sink = Math.min(1, visual.sink + dt * 5);
            visual.mesh.position.y = R - visual.sink * 0.08;
            visual.mesh.scale.setScalar(Math.max(0.01, 1 - visual.sink * 0.7));
            if (visual.sink === 1) visual.mesh.visible = false;
          }
          continue;
        }
        if (visual.sink > 0) {
          visual.sink = 0;
          visual.mesh.visible = true;
          visual.mesh.scale.setScalar(1);
        }
        const dx = (ball.x - visual.x) * S;
        const dz = (ball.y - visual.y) * S;
        const moved = Math.hypot(dx, dz);
        // Un salto grande es una recolocación (blanca repuesta), no un rodar.
        if (moved > 1e-5 && moved < 0.3) {
          axis.set(dz / moved, 0, -dx / moved);
          visual.mesh.rotateOnWorldAxis(axis, moved / R);
        }
        visual.x = ball.x;
        visual.y = ball.y;
        visual.mesh.position.set(toX(ball.x), R, toZ(ball.y));
      }
      for (const visual of balls.values()) if (!visual.seen) visual.mesh.visible = false;

      const cue = cuePosition();
      const showAim = (aim.active || aim.keyboard) && aim.power > 0 && canAim() && cue;
      guide.visible = Boolean(showAim);
      stick.visible = Boolean(showAim);
      if (showAim && cue) {
        const cx = cue.mesh.position.x;
        const cz = cue.mesh.position.z;
        const heading = Math.atan2(aim.x, aim.z);
        guide.position.set(cx, 0.004, cz);
        guide.rotation.y = heading;
        guideLine.scale.set(0.014, 1, 0.25 + aim.power * 0.9);
        const back = R + 0.03 + aim.power * 0.25;
        stick.position.set(cx - aim.x * back, R + 0.012, cz - aim.z * back);
        stick.rotation.set(0, heading, 0);
        stick.rotateX(0.07);
      }
      if (!state.isMyTurn && (aim.active || aim.keyboard)) clearAim();

      const k = stage.reducedMotion ? 1 : Math.min(1, dt * 6);
      camera.position.lerp(camGoal.position, k);
      camLook.lerp(camGoal.look, k);
      camera.lookAt(camLook);
    }

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('keydown', onKey);
      sphere.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  useEffect(() => {
    refit.current();
  }, [view]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        data-render="3d"
        tabIndex={0}
        className={
          'block aspect-[4/5] w-full touch-none rounded-[1.1rem] outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan sm:aspect-[2/1] ' +
          (props.isMyTurn ? 'cursor-crosshair' : '')
        }
        aria-label="Mesa de billar en 3D. Arrastra hacia atrás y suelta para golpear. Con teclado: flechas izquierda y derecha para apuntar, arriba y abajo para la potencia, espacio para golpear."
      />
      <button
        type="button"
        className="btn-ghost absolute right-2 top-2 min-h-11 bg-black/55 px-3 text-xs"
        onClick={() => setView((current) => ((current ?? -1) + 1) % VIEWS.length)}
      >
        Cambiar vista
      </button>
    </div>
  );
}

function ballMaterial(ball: PoolBallState, eightBall: boolean): THREE.MeshStandardMaterial {
  const striped = eightBall && groupOfBall(ball.id) === 'rayadas';
  const base = eightBall && ball.id === EIGHT_BALL.blackId ? '#1b1d24' : ball.color;
  const texture = canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = ball.id === 0 ? '#f8fafc' : striped ? '#f8fafc' : base;
    ctx.fillRect(0, 0, w, h);
    if (striped) {
      // Franja de color sobre blanco: distingue rayadas de lisas sin depender del tono.
      ctx.fillStyle = base;
      ctx.fillRect(0, h * 0.28, w, h * 0.44);
    }
    if (ball.id === 0) return;
    for (const cx of [w * 0.25, w * 0.75]) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(cx, h / 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.id), cx, h / 2 + 1);
    }
  });
  return std(0xffffff, 0.12, 0.05, { map: texture });
}

function buildTable(scene: THREE.Scene, eightBall: boolean): void {
  const cushion = POOL_TABLE.cushion * S;
  const floor = mesh(
    new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
    std(0x161a2b, 0.55, 0.15),
    0,
    -0.86,
    0,
    'receive',
  );
  scene.add(floor);

  const felt = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0e7a52';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  });
  scene.add(
    mesh(
      new THREE.BoxGeometry(HX * 2, 0.06, HZ * 2),
      std(0xffffff, 0.95, 0, { map: felt }),
      0,
      -0.03,
      0,
      'receive',
    ),
  );
  const wood = std(0x6b3d1c, 0.42, 0.05);
  const band = std(0x0a5c3d, 0.9);
  const rail = 0.12;
  for (const side of [-1, 1]) {
    // Bandas: ocupan la franja donde el servidor hace rebotar las bolas.
    scene.add(
      mesh(new THREE.BoxGeometry(HX * 2, 0.05, cushion), band, 0, 0.025, side * (HZ - cushion / 2)),
    );
    scene.add(
      mesh(new THREE.BoxGeometry(cushion, 0.05, HZ * 2), band, side * (HX - cushion / 2), 0.025, 0),
    );
    scene.add(
      mesh(new THREE.BoxGeometry(HX * 2 + rail * 2, 0.1, rail), wood, 0, 0, side * (HZ + rail / 2)),
    );
    scene.add(mesh(new THREE.BoxGeometry(rail, 0.1, HZ * 2), wood, side * (HX + rail / 2), 0, 0));
  }
  const hole = new THREE.MeshBasicMaterial({ color: 0x020203 });
  const pocket = POOL_TABLE.pocketRadius * S;
  for (const spot of poolPockets()) {
    scene.add(
      mesh(
        new THREE.CylinderGeometry(pocket, pocket, 0.064, 24),
        hole,
        toX(spot.x),
        0.022,
        toZ(spot.y),
        'none',
      ),
    );
  }
  scene.add(
    mesh(new THREE.BoxGeometry(HX * 2 + 0.3, 0.22, HZ * 2 + 0.3), std(0x3a2110, 0.6), 0, -0.17, 0),
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.14, 0.6, 0.14),
          std(0x2a170b, 0.6),
          sx * (HX - 0.1),
          -0.56,
          sz * (HZ - 0.05),
        ),
      );

  const lamp = new THREE.PointLight(0xfff1c9, 6, 6, 1.6);
  lamp.position.set(0, 1.6, 0);
  scene.add(lamp);
  // Sala: pared del fondo con dos neones, del color de la modalidad.
  scene.add(mesh(new THREE.BoxGeometry(12, 3.6, 0.2), std(0x101425, 0.8), 0, 0.9, -4.4, 'receive'));
  scene.add(mesh(new THREE.BoxGeometry(5, 0.06, 0.06), glow(0x22d3ee, 3), 0, 1.4, -4.25, 'none'));
  scene.add(
    mesh(
      new THREE.BoxGeometry(3.4, 0.06, 0.06),
      glow(eightBall ? 0xfbbf24 : 0xf472b6, 3),
      0,
      1.0,
      -4.25,
      'none',
    ),
  );
  const neonA = new THREE.PointLight(0x22d3ee, 5, 9, 1.8);
  neonA.position.set(-1.5, 1.3, -3.8);
  const neonB = new THREE.PointLight(eightBall ? 0xfbbf24 : 0xf472b6, 5, 9, 1.8);
  neonB.position.set(1.5, 1.0, -3.8);
  scene.add(neonA, neonB);
}
