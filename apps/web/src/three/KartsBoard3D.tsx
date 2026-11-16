import { KART, type KartState, type KartTrack } from '@arcade/shared';
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
 * Carrera de karts en 3D, con la cámara detrás del kart propio.
 *
 * El asfalto se levanta con las mismas puertas del circuito que usa el
 * servidor para contar vueltas, y los karts se colocan donde dice cada
 * snapshot. La conducción sigue en el teclado y los botones táctiles.
 */

interface Props {
  track: KartTrack;
  getKarts: () => KartState[];
  players: { id: string; color: string }[];
  myId: string | undefined;
  onGiveUp: (reason: string) => void;
}

const S = 0.03;

interface KartVisual {
  group: THREE.Group;
  x: number;
  y: number;
  heading: number;
}

export default function KartsBoard3D(props: Props) {
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
    scene.background = new THREE.Color(0x141a36);
    scene.fog = new THREE.Fog(0x141a36, 20, 80);
    stage.hemi.intensity = 1.1;
    stage.key.intensity = 2;
    setKeyLight(stage.key, [6, 14, 8], [0, 0, 0], 14, 50);

    const track = latest.current.track;
    const half = { x: (track.size.w * S) / 2, z: (track.size.h * S) / 2 };
    const toX = (x: number) => x * S - half.x;
    const toZ = (y: number) => y * S - half.z;
    scene.add(buildTrack(track, toX, toZ));

    const wheel = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 12).rotateX(Math.PI / 2);
    const karts = new Map<string, KartVisual>();
    const camPosition = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const goal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();
    const overview = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    let snap = true;

    function frame(dt: number) {
      const { getKarts, players, myId } = latest.current;
      const source = getKarts();
      // Mismo suavizado que la vista 2D hacia la última posición del servidor.
      const alpha = stage.reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);
      const seen = new Set<string>();
      for (const kart of source) {
        seen.add(kart.playerId);
        let visual = karts.get(kart.playerId);
        if (!visual) {
          const color = players.find((player) => player.id === kart.playerId)?.color ?? '#94a3b8';
          visual = { group: makeKart(color, wheel), x: kart.x, y: kart.y, heading: kart.heading };
          scene.add(visual.group);
          karts.set(kart.playerId, visual);
        }
        visual.x += (kart.x - visual.x) * alpha;
        visual.y += (kart.y - visual.y) * alpha;
        let turn = kart.heading - visual.heading;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        visual.heading += turn * alpha;
        visual.group.position.set(toX(visual.x), 0, toZ(visual.y));
        visual.group.rotation.y = -visual.heading;
        visual.group.visible = !kart.eliminated;
      }
      for (const [id, visual] of karts) {
        if (seen.has(id)) continue;
        scene.remove(visual.group);
        disposeTree(visual.group);
        karts.delete(id);
      }

      const mine = myId ? karts.get(myId) : undefined;
      const mineState = source.find((kart) => kart.playerId === myId);
      const portrait = camera.aspect < 1;
      camera.fov = portrait ? 58 : 50;
      camera.updateProjectionMatrix();
      if (mine && mineState && !mineState.eliminated && !mineState.finished) {
        const fx = Math.cos(mine.heading);
        const fz = Math.sin(mine.heading);
        const x = mine.group.position.x;
        const z = mine.group.position.z;
        const back = portrait ? 5.6 : 4.6;
        goal.set(x - fx * back, portrait ? 3.1 : 2.3, z - fz * back);
        lookGoal.set(x + fx * 3, 0.6, z + fz * 3);
        stage.key.position.set(x + 6, 14, z + 8);
        stage.key.target.position.set(x, 0, z);
      } else {
        // Espectador, eliminado o ya en meta: se ve el circuito entero.
        fitCamera(
          camera,
          portrait ? [0, 1.5, 0.4] : [0, 1.1, 0.8],
          [0, 0, 0],
          [-half.x, 0, -half.z, half.x, 0.5, half.z],
          overview,
        );
        goal.copy(overview.position);
        lookGoal.copy(overview.look);
        stage.key.position.set(6, 14, 8);
        stage.key.target.position.set(0, 0, 0);
      }
      const k = snap || stage.reducedMotion ? 1 : Math.min(1, dt * 5);
      snap = false;
      camPosition.lerp(goal, k);
      camLook.lerp(lookGoal, snap || stage.reducedMotion ? 1 : Math.min(1, dt * 8));
      camera.position.copy(camPosition);
      camera.lookAt(camLook);
    }

    return () => {
      wheel.dispose();
      stage.dispose();
    };
    // La escena se monta una vez por circuito; el estado vivo entra por `latest`.
  }, [props.track.id]);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      role="img"
      className="block aspect-[4/5] w-full bg-black sm:aspect-[1000/640]"
      aria-label={'Circuito ' + props.track.name + ' en 3D, visto desde detrás de tu kart'}
    />
  );
}

function makeKart(color: string, wheel: THREE.BufferGeometry): THREE.Group {
  const group = new THREE.Group();
  const body = std(color, 0.35, 0.2);
  group.add(mesh(new THREE.BoxGeometry(1.0, 0.2, 0.6), body, 0, 0.26, 0));
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.7), body, 0.5, 0.2, 0));
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.62), body, -0.5, 0.42, 0));
  group.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.5), glow(0xef4444, 2), -0.56, 0.3, 0, 'none'));
  group.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), std(0xf8fafc, 0.4), -0.12, 0.6, 0));
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), std(0x1e293b, 0.6), -0.12, 0.4, 0));
  const tyre = std(0x111827, 0.8);
  for (const x of [-0.32, 0.34])
    for (const z of [-0.36, 0.36]) group.add(mesh(wheel, tyre, x, 0.17, z));
  // El modelo mide algo más que el radio de choque del servidor para que se lea bien.
  group.scale.setScalar((KART.radius * S * 2.6) / 1.0);
  return group;
}

function buildTrack(
  track: KartTrack,
  toX: (x: number) => number,
  toZ: (y: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  group.add(
    mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      std(0x24663c, 0.95),
      0,
      0,
      0,
      'receive',
    ),
  );

  const gates = track.gates;
  const count = gates.length;
  /** Cinta cerrada entre dos bordes que se dan como fracción a lo ancho de cada puerta. */
  const ribbon = (
    from: number,
    to: number,
    material: THREE.Material,
    y: number,
    vScale: number,
  ) => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const gate = gates[i % count]!;
      const at = (t: number) => [
        toX(gate.left.x + (gate.right.x - gate.left.x) * t),
        toZ(gate.left.y + (gate.right.y - gate.left.y) * t),
      ];
      const [ax, az] = at(from) as [number, number];
      const [bx, bz] = at(to) as [number, number];
      positions.push(ax, y, az, bx, y, bz);
      uvs.push(0, i * vScale, 1, i * vScale);
      if (i < count) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const item = new THREE.Mesh(geometry, material);
    item.receiveShadow = true;
    group.add(item);
  };
  const asphalt = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2a2f3d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${((i * 37) % 50) / 1000})`;
      ctx.fillRect((i * 97) % w, (i * 53) % h, 1.4, 1.4);
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(w / 2 - 1.5, 0, 3, h * 0.5);
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  const curb = canvasTexture(8, 16, (ctx) => {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 8, 8, 8);
  });
  curb.wrapS = curb.wrapT = THREE.RepeatWrapping;
  const both = { side: THREE.DoubleSide };
  ribbon(0, 1, std(0xffffff, 0.85, 0, { map: asphalt, ...both }), 0.01, 1);
  ribbon(-0.08, 0, std(0xffffff, 0.7, 0, { map: curb, ...both }), 0.02, 2);
  ribbon(1, 1.08, std(0xffffff, 0.7, 0, { map: curb, ...both }), 0.02, 2);

  // Línea de meta y arco sobre la primera puerta.
  const first = gates[0]!;
  const lx = toX(first.left.x);
  const lz = toZ(first.left.y);
  const rx = toX(first.right.x);
  const rz = toZ(first.right.y);
  const width = Math.hypot(rx - lx, rz - lz);
  const across = -Math.atan2(rz - lz, rx - lx);
  const checker = canvasTexture(64, 16, (ctx) => {
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#0f172a' : '#f8fafc';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  });
  const line = mesh(
    new THREE.PlaneGeometry(width, 0.7).rotateX(-Math.PI / 2),
    std(0xffffff, 0.8, 0, { map: checker }),
    (lx + rx) / 2,
    0.03,
    (lz + rz) / 2,
    'receive',
  );
  line.rotation.y = across;
  group.add(line);
  const arch = new THREE.Group();
  arch.add(
    mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), std(0x1e293b, 0.5), -width / 2 - 0.4, 1.4, 0),
  );
  arch.add(
    mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), std(0x1e293b, 0.5), width / 2 + 0.4, 1.4, 0),
  );
  arch.add(mesh(new THREE.BoxGeometry(width + 1, 0.5, 0.3), std(0x0f172a, 0.5), 0, 2.8, 0));
  arch.add(
    mesh(new THREE.BoxGeometry(width + 1, 0.08, 0.34), glow(0x22d3ee, 3), 0, 2.52, 0, 'none'),
  );
  arch.add(
    mesh(new THREE.BoxGeometry(width + 1, 0.08, 0.34), glow(0xf472b6, 3), 0, 3.08, 0, 'none'),
  );
  arch.position.set((lx + rx) / 2, 0, (lz + rz) / 2);
  arch.rotation.y = across;
  group.add(arch);

  // Decorado determinista, lejos del asfalto.
  const centres = gates.map(
    (gate) =>
      [toX((gate.left.x + gate.right.x) / 2), toZ((gate.left.y + gate.right.y) / 2)] as const,
  );
  const clearance = width * 0.5 + 1.6;
  const trunk = std(0x6b4423, 0.9);
  const leaves = [
    std(0x1f6b3a, 0.9, 0, { flatShading: true }),
    std(0x2b8048, 0.9, 0, { flatShading: true }),
  ];
  const coneA = new THREE.ConeGeometry(0.9, 1.7, 7);
  const coneB = new THREE.ConeGeometry(0.65, 1.3, 7);
  const trunkGeometry = new THREE.CylinderGeometry(0.14, 0.18, 0.8, 6);
  const spanX = track.size.w * S + 16;
  const spanZ = track.size.h * S + 16;
  let placed = 0;
  for (let index = 0; index < 500 && placed < 60; index++) {
    const x = (((index * 7919) % 1000) / 1000) * spanX - spanX / 2;
    const z = (((index * 6151) % 1000) / 1000) * spanZ - spanZ / 2;
    if (centres.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < clearance)) continue;
    const tree = new THREE.Group();
    tree.add(
      mesh(trunkGeometry, trunk, 0, 0.4, 0),
      mesh(coneA, leaves[0]!, 0, 1.5, 0),
      mesh(coneB, leaves[1]!, 0, 2.3, 0),
    );
    tree.scale.setScalar(0.8 + ((index * 37) % 10) / 12);
    tree.position.set(x, 0, z);
    group.add(tree);
    placed += 1;
  }
  const step = Math.max(1, Math.floor(count / 7));
  for (let i = 0; i < count; i += step) {
    const gate = gates[i]!;
    const dx = gate.left.x - gate.right.x;
    const dy = gate.left.y - gate.right.y;
    const length = Math.hypot(dx, dy) || 1;
    const x = toX(gate.left.x + (dx / length) * 80);
    const z = toZ(gate.left.y + (dy / length) * 80);
    const color = [0x67e8f9, 0xf472b6, 0xfbbf24][(i / step) % 3] ?? 0x67e8f9;
    group.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), std(0x1f2937, 0.6), x, 1.1, z));
    group.add(mesh(new THREE.SphereGeometry(0.2, 12, 8), glow(color, 2.8), x, 2.3, z, 'none'));
    const light = new THREE.PointLight(color, 6, 9, 1.7);
    light.position.set(x, 2.2, z);
    group.add(light);
  }
  return group;
}
