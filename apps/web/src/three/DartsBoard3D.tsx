import { DART_RADII, DART_SECTORS, type DartThrow } from '@arcade/shared';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  canvasTexture,
  createStage,
  disposeTree,
  glow,
  mesh,
  setKeyLight,
  std,
  type Stage,
} from './stage.js';

/**
 * Diana en 3D.
 *
 * El jugador marca un punto y el servidor decide dónde cae el dardo (aplica la
 * dispersión de la dificultad y calcula los puntos). Aquí solo se ve volar el
 * dardo hasta el impacto que devuelve el servidor y quedarse clavado.
 */

interface Props {
  /** Dardos del turno en curso, con el impacto ya resuelto por el servidor. */
  throws: DartThrow[];
  isMyTurn: boolean;
  onThrow: (x: number, y: number) => void;
  onGiveUp: (reason: string) => void;
}

/** Radio en metros del borde exterior de los dobles (radio normalizado 1). */
const B = 0.17;
const FACE = 0.016;
const COLORS = [0x22d3ee, 0xf472b6, 0xfbbf24];

export default function DartsBoard3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: Stage;
    try {
      stage = createStage(canvas, {
        onFrame: (dt, time) => frame(dt, time),
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    scene.background = new THREE.Color(0x0a0c17);
    stage.hemi.intensity = 0.6;
    stage.key.intensity = 1.5;
    setKeyLight(stage.key, [0.7, 1.4, 2.4], [0, 0, 0], 1.2, 8);
    buildBoard(scene);

    const reticle = new THREE.Group();
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    reticle.add(
      new THREE.Mesh(new THREE.RingGeometry(0.011, 0.014, 28), reticleMaterial),
      new THREE.Mesh(new THREE.CircleGeometry(0.0025, 12), reticleMaterial),
    );
    reticle.renderOrder = 6;
    reticle.visible = false;
    scene.add(reticle);

    /** Punto marcado, en coordenadas normalizadas de la diana (y hacia abajo). */
    const cursor = { x: 0, y: 0, shown: false };
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const place = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const t = (FACE - ray.ray.origin.z) / ray.ray.direction.z;
      cursor.x = (ray.ray.origin.x + ray.ray.direction.x * t) / B;
      cursor.y = -(ray.ray.origin.y + ray.ray.direction.y * t) / B;
      cursor.shown = true;
    };
    const send = () => {
      if (!latest.current.isMyTurn) return;
      // Mismo margen que la 2D: fuera de la diana se puede fallar, pero no tirar a la pared.
      if (Math.hypot(cursor.x, cursor.y) > 1.15) return;
      latest.current.onThrow(cursor.x, cursor.y);
    };
    const onMove = (event: PointerEvent) => place(event);
    const onUp = (event: PointerEvent) => {
      place(event);
      send();
      // En táctil no hay cursor que dejar a la vista tras soltar.
      if (event.pointerType !== 'mouse') cursor.shown = false;
    };
    const onLeave = () => {
      cursor.shown = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.01 : 0.05;
      cursor.shown = true;
      if (event.key === 'ArrowLeft') cursor.x = Math.max(-1.1, cursor.x - step);
      if (event.key === 'ArrowRight') cursor.x = Math.min(1.1, cursor.x + step);
      if (event.key === 'ArrowUp') cursor.y = Math.max(-1.1, cursor.y - step);
      if (event.key === 'ArrowDown') cursor.y = Math.min(1.1, cursor.y + step);
      if (event.key === ' ' || event.key === 'Enter') send();
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);

    interface Dart {
      object: THREE.Group;
      t: number;
      x: number;
      y: number;
      tilt: number;
      turn: number;
    }
    const darts: Dart[] = [];
    let distance = 1;

    function frame(dt: number, time: number) {
      const state = latest.current;
      // Turno nuevo: la lista se vacía y se retiran los dardos clavados.
      while (darts.length > state.throws.length) {
        const old = darts.pop();
        if (old) {
          scene.remove(old.object);
          disposeTree(old.object);
        }
      }
      while (darts.length < state.throws.length) {
        const hit = state.throws[darts.length];
        if (!hit) break;
        const object = makeDart(COLORS[darts.length % COLORS.length] ?? 0x22d3ee);
        scene.add(object);
        darts.push({
          object,
          t: stage.reducedMotion ? 1 : 0,
          x: hit.x * B,
          y: -hit.y * B,
          tilt: 0.16 + ((darts.length * 37) % 10) / 90,
          turn: (((darts.length * 53) % 10) - 5) / 30,
        });
      }
      for (const dart of darts) {
        dart.t = Math.min(1, dart.t + dt / 0.28);
        const k = dart.t;
        const sx = dart.x * 0.35;
        const sy = dart.y - 0.3;
        const sz = distance - 0.25;
        dart.object.position.set(
          sx + (dart.x - sx) * k,
          sy + (dart.y - sy) * k + Math.sin(Math.PI * k) * 0.06,
          sz + (FACE + 0.004 - sz) * k,
        );
        dart.object.rotation.set(-0.25 + (dart.tilt + 0.25) * k, dart.turn * k, 0);
      }

      reticle.visible = cursor.shown && state.isMyTurn;
      const pulse = stage.reducedMotion ? 1 : 1 + Math.sin(time * 6) * 0.08;
      reticle.scale.setScalar(pulse);
      reticle.position.set(cursor.x * B, -cursor.y * B, FACE + 0.03);

      // La diana y sus números caben siempre, en vertical y en apaisado.
      const halfFov = Math.tan((camera.fov * Math.PI) / 360);
      distance = Math.max(0.25 / halfFov, 0.25 / (halfFov * camera.aspect));
      camera.position.set(0.05, -0.05, distance);
      camera.lookAt(0, 0, 0);
    }

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('keydown', onKey);
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      tabIndex={0}
      className={
        'mx-auto block aspect-square w-full max-w-[420px] touch-none rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan ' +
        (props.isMyTurn ? 'cursor-crosshair' : 'cursor-default opacity-90')
      }
      aria-label="Diana de dardos en 3D. Toca o haz clic donde quieras lanzar. Con teclado: flechas para mover la mira y espacio para lanzar."
    />
  );
}

function makeDart(color: number): THREE.Group {
  const dart = new THREE.Group();
  const metal = std(0xcbd5e1, 0.25, 0.9);
  dart.add(
    mesh(
      new THREE.ConeGeometry(0.0035, 0.035, 10).rotateX(-Math.PI / 2),
      metal,
      0,
      0,
      0.0175,
      'cast',
    ),
  );
  dart.add(
    mesh(
      new THREE.CylinderGeometry(0.0065, 0.005, 0.05, 12).rotateX(Math.PI / 2),
      std(0x334155, 0.3, 0.8),
      0,
      0,
      0.06,
      'cast',
    ),
  );
  dart.add(
    mesh(
      new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 8).rotateX(Math.PI / 2),
      std(0x0f172a, 0.5),
      0,
      0,
      0.11,
      'cast',
    ),
  );
  const fin = std(color, 0.5, 0, { side: THREE.DoubleSide });
  dart.add(
    mesh(new THREE.PlaneGeometry(0.04, 0.045).rotateY(Math.PI / 2), fin, 0, 0, 0.145, 'cast'),
  );
  dart.add(
    mesh(
      new THREE.PlaneGeometry(0.04, 0.045).rotateY(Math.PI / 2).rotateZ(Math.PI / 2),
      fin,
      0,
      0,
      0.145,
      'cast',
    ),
  );
  return dart;
}

function buildBoard(scene: THREE.Scene): void {
  const outer = B * 1.32;
  const bricks = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#141a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0b0f1d';
    ctx.lineWidth = 3;
    for (let row = 0; row < 4; row++) {
      ctx.strokeRect(-2, row * 32, w + 4, 32);
      for (let col = 0; col < 3; col++)
        ctx.strokeRect(col * 128 - (row % 2 ? 64 : 0), row * 32, 128, 32);
    }
  });
  bricks.wrapS = bricks.wrapT = THREE.RepeatWrapping;
  bricks.repeat.set(10, 10);
  scene.add(
    mesh(
      new THREE.PlaneGeometry(10, 6),
      std(0xffffff, 0.95, 0, { map: bricks }),
      0,
      0,
      -0.06,
      'receive',
    ),
  );
  scene.add(
    mesh(
      new THREE.CylinderGeometry(outer * 1.12, outer * 1.12, 0.03, 48).rotateX(Math.PI / 2),
      std(0x0c0e14, 0.9),
      0,
      0,
      -0.04,
    ),
  );
  scene.add(
    mesh(
      new THREE.TorusGeometry(outer * 1.14, 0.005, 10, 64),
      glow(0xfbbf24, 1.3),
      0,
      0,
      -0.03,
      'none',
    ),
  );

  // La textura usa los mismos radios y el mismo orden de sectores que puntúa el servidor.
  const size = 1024;
  const px = size / 2 / 1.32;
  const face = canvasTexture(size, size, (ctx) => {
    const c = size / 2;
    ctx.fillStyle = '#0d0f13';
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    const wedge = (index: number, radius: number, color: string) => {
      const middle = ((-90 + index * 18) * Math.PI) / 180;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, radius * px, middle - Math.PI / 20, middle + Math.PI / 20);
      ctx.fill();
    };
    DART_SECTORS.forEach((_, index) => {
      const base = index % 2 ? '#efe2bf' : '#16181d';
      const ring = index % 2 ? '#1f9d55' : '#d42a2a';
      wedge(index, DART_RADII.doubleOuter, ring);
      wedge(index, DART_RADII.doubleInner, base);
      wedge(index, DART_RADII.tripleOuter, ring);
      wedge(index, DART_RADII.tripleInner, base);
    });
    ctx.fillStyle = '#1f9d55';
    ctx.beginPath();
    ctx.arc(c, c, DART_RADII.bull * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d42a2a';
    ctx.beginPath();
    ctx.arc(c, c, DART_RADII.bullseye * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,225,235,0.55)';
    ctx.lineWidth = 2;
    for (const radius of [
      DART_RADII.doubleOuter,
      DART_RADII.doubleInner,
      DART_RADII.tripleOuter,
      DART_RADII.tripleInner,
      DART_RADII.bull,
    ]) {
      ctx.beginPath();
      ctx.arc(c, c, radius * px, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    DART_SECTORS.forEach((sector, index) => {
      const angle = ((-90 + index * 18) * Math.PI) / 180;
      ctx.fillText(
        String(sector),
        c + Math.cos(angle) * 1.16 * px,
        c + Math.sin(angle) * 1.16 * px,
      );
    });
  });
  scene.add(
    mesh(
      new THREE.CylinderGeometry(outer, outer, 0.04, 64).rotateX(Math.PI / 2),
      std(0x0d0f13, 0.9),
      0,
      0,
      -0.005,
    ),
  );
  scene.add(
    mesh(
      new THREE.CircleGeometry(outer, 64),
      std(0xffffff, 0.85, 0, { map: face }),
      0,
      0,
      FACE,
      'receive',
    ),
  );

  const spot = new THREE.SpotLight(0xfff2d0, 9, 4, 0.5, 0.6, 1.2);
  spot.position.set(0, 1, 1.1);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);
  for (const [y, color] of [
    [0.5, 0x22d3ee],
    [-0.5, 0xf472b6],
  ] as const) {
    const light = new THREE.PointLight(color, 1.2, 3, 1.6);
    light.position.set(0, y, 0.3);
    scene.add(light);
  }
}
