import {
  TANK_FIELD,
  TANK_MAPS,
  tankGroundAt,
  tankTiltAt,
  type PublicPlayer,
  type TanksPublicState,
  type TankState,
} from '@arcade/shared';
import {
  TANK_OVERVIEW_ZOOM,
  easeCamera,
  predictShot,
  tankCameraTarget,
  type TankCameraTarget,
} from '../games/tanks-camera.js';
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
 * Campo de batalla de Tanques en 3D: un diorama visto de lado.
 *
 * Tanques, proyectil, explosiones y obstáculos salen del estado del servidor.
 * La trayectoria prevista usa los mismos números que la vista 2D. Ángulo,
 * potencia, movimiento y disparo siguen en los controles HTML y el teclado.
 */

interface Props {
  state: TanksPublicState;
  players: PublicPlayer[];
  meId: string;
  /** Tanque propio y puntería actual cuando es el turno del jugador. */
  preview: { tank: TankState; angleDeg: number; power: number } | null;
  /** Campo entero en lugar de seguir la acción. */
  overview: boolean;
  onGiveUp: (reason: string) => void;
}

const S = 0.01;
const GROUND = TANK_FIELD.groundY;
const toX = (x: number) => (x - TANK_FIELD.width / 2) * S;
const toY = (y: number) => (GROUND - y) * S;
const SKIES: Record<string, [string, string, string]> = {
  'crater-lunar': ['#04060d', '#0e1326', '#1d2442'],
  'fortaleza-neon': ['#07060f', '#1a1030', '#3c1c4c'],
  'canon-carmesi': ['#1c0b10', '#5a2119', '#c2622e'],
};
/** Suelo, capa superior, piedra y acento: los mismos tonos que la vista 2D. */
const GROUNDS: Record<string, [number, number, number, number]> = {
  'canon-carmesi': [0x8a4526, 0xc97a43, 0x7c4a35, 0xf97316],
  'fortaleza-neon': [0x2f2836, 0x5b5163, 0x6b6577, 0x22d3ee],
  'crater-lunar': [0x43475a, 0x868b9e, 0x9097a8, 0xa5b4fc],
};

interface TankVisual {
  group: THREE.Group;
  pivot: THREE.Group;
  ring: THREE.Mesh;
  bar: THREE.Mesh;
  barMaterial: THREE.MeshBasicMaterial;
  /** Barra de vida: se mantiene horizontal aunque el tanque se incline. */
  holder: THREE.Group;
}

export default function TanksBoard3D(props: Props) {
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
        onResize: () => fit(),
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    stage.hemi.intensity = 0.95;
    stage.key.intensity = 2.1;
    setKeyLight(stage.key, [-3, 7, 6], [0, 1, 0], 7, 24);

    let mapId = '';
    let scenery = new THREE.Group();
    const buildScenery = () => {
      const state = latest.current.state;
      mapId = state.map + ':' + state.obstacles.map((o) => o.id).join(',');
      scene.remove(scenery);
      disposeTree(scenery);
      scenery = buildMap(state);
      scene.add(scenery);
      scene.background = new THREE.Color((SKIES[state.map] ?? SKIES['canon-carmesi']!)[0]);
    };
    buildScenery();

    const tanks = new Map<string, TankVisual>();
    const shell = mesh(
      new THREE.SphereGeometry(TANK_FIELD.projectileRadius * S, 14, 10),
      glow(0xfff1a8, 3),
      0,
      0,
      0,
      'cast',
    );
    const shellLight = new THREE.PointLight(0xffb060, 0, 4, 1.5);
    shell.add(shellLight);
    shell.visible = false;
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(120 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xffa15c, transparent: true, opacity: 0.8 }),
    );
    trail.frustumCulled = false;
    const dotGeometry = new THREE.SphereGeometry(0.03, 8, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    });
    const dots = Array.from({ length: 60 }, () => {
      const dot = mesh(dotGeometry, dotMaterial, 0, 0, 0, 'none');
      dot.visible = false;
      scene.add(dot);
      return dot;
    });
    const boomGeometry = new THREE.SphereGeometry(1, 20, 14);
    const booms: THREE.Mesh[] = [];
    scene.add(shell, trail);

    // Distancia de cámara para un tramo de 1000 de ancho (zoom 1). Para otro
    // zoom basta con alejarse en proporción: el encuadre escala igual.
    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    const camDir = new THREE.Vector3(0, 0.14, 1).normalize();
    let baseDistance = 10;
    let view: TankCameraTarget = { x: TANK_FIELD.width / 2, zoom: TANK_OVERVIEW_ZOOM };
    function fit() {
      camera.fov = 40;
      camera.updateProjectionMatrix();
      const half = 5;
      fitCamera(camera, [0, 0.14, 1], [0, 2.3, 0], [-half, 0, -0.4, half, 4.9, 0.4], camGoal);
      baseDistance = camGoal.position.distanceTo(camGoal.look);
      placeCamera();
    }
    function placeCamera() {
      const look = new THREE.Vector3(toX(view.x), 2.3 / view.zoom, 0);
      camera.position.copy(look).addScaledVector(camDir, baseDistance / view.zoom);
      camera.lookAt(look);
    }
    fit();

    function frame(dt: number) {
      const { state, players, meId, preview, overview } = latest.current;
      const aim =
        preview && state.phase === 'aiming'
          ? predictShot(preview, state.wind, state.obstacles, state.map)
          : null;
      view = easeCamera(view, tankCameraTarget(state, { overview, meId, aim }), dt);
      placeCamera();
      if (mapId !== state.map + ':' + state.obstacles.map((o) => o.id).join(',')) buildScenery();

      const seen = new Set<string>();
      for (const tank of state.tanks) {
        seen.add(tank.playerId);
        let visual = tanks.get(tank.playerId);
        if (!visual) {
          const color = players.find((p) => p.id === tank.playerId)?.color ?? '#94a3b8';
          visual = makeTank(color, tank.playerId === meId);
          scene.add(visual.group);
          tanks.set(tank.playerId, visual);
        }
        const aiming = preview && tank.playerId === meId;
        // En el servidor el ángulo crece hacia abajo (y de pantalla); aquí, hacia arriba.
        const angle = aiming ? (preview.angleDeg * Math.PI) / 180 : -tank.angle;
        // El casco se inclina con el relieve; el cañón y la barra de vida no.
        const tilt = -tankTiltAt(state.map, tank.x);
        visual.group.position.set(toX(tank.x), toY(tankGroundAt(state.map, tank.x) + 3), 0);
        visual.group.rotation.z = tilt;
        visual.pivot.rotation.z = angle - tilt;
        visual.holder.rotation.z = -tilt;
        visual.group.traverse((node) => {
          const material = (node as THREE.Mesh).material as THREE.Material | undefined;
          if (material && 'opacity' in material && node !== visual!.bar && node !== visual!.ring) {
            material.transparent = !tank.alive;
            material.opacity = tank.alive ? 1 : 0.3;
          }
        });
        visual.ring.visible =
          tank.alive && (tank.playerId === state.activePlayerId || tank.playerId === meId);
        const ratio = Math.max(0, Math.min(1, tank.health / (state.mode === 'blitz' ? 70 : 100)));
        visual.bar.visible = tank.alive;
        visual.bar.scale.x = Math.max(0.02, ratio);
        visual.bar.position.x = -0.32 * (1 - ratio);
        visual.barMaterial.color.set(tank.health > 35 ? 0x34d399 : 0xef4444);
      }
      for (const [id, visual] of tanks) {
        if (seen.has(id)) continue;
        scene.remove(visual.group);
        disposeTree(visual.group);
        tanks.delete(id);
      }

      const projectile = state.projectile;
      shell.visible = Boolean(projectile);
      trail.visible = Boolean(projectile);
      shellLight.intensity = projectile ? 2.5 : 0;
      if (projectile) {
        shell.position.set(toX(projectile.x), toY(projectile.y), 0);
        const points = projectile.trail.slice(-119);
        points.forEach((point, index) => {
          trailPositions[index * 3] = toX(point.x);
          trailPositions[index * 3 + 1] = toY(point.y);
          trailPositions[index * 3 + 2] = 0;
        });
        trailPositions[points.length * 3] = toX(projectile.x);
        trailPositions[points.length * 3 + 1] = toY(projectile.y);
        trailPositions[points.length * 3 + 2] = 0;
        trailGeometry.setDrawRange(0, points.length + 1);
        (trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      while (booms.length < state.explosions.length) {
        const boom = mesh(
          boomGeometry,
          new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, depthWrite: false }),
          0,
          0,
          0,
          'none',
        );
        scene.add(boom);
        booms.push(boom);
      }
      booms.forEach((boom, index) => {
        const explosion = state.explosions[index];
        boom.visible = Boolean(explosion);
        if (!explosion) return;
        const progress = 1 - explosion.ttlMs / 720;
        boom.position.set(toX(explosion.x), toY(explosion.y), 0);
        boom.scale.setScalar(Math.max(0.01, explosion.radius * S * Math.min(1, progress * 2.4)));
        (boom.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - progress * 0.9);
      });

      // Trayectoria prevista: la misma que dibuja la vista 2D.
      for (const dot of dots) dot.visible = false;
      if (aim) {
        let used = 0;
        aim.points.forEach((point, index) => {
          if (index % 4 !== 0 || used >= dots.length) return;
          const dot = dots[used++];
          if (!dot) return;
          dot.visible = true;
          dot.position.set(toX(point.x), toY(point.y), 0);
        });
      }
    }

    return () => {
      dotGeometry.dispose();
      boomGeometry.dispose();
      trailGeometry.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      role="img"
      className="block aspect-[5/3] w-full bg-black"
      aria-label="Campo de batalla de Tanques en 3D"
    />
  );
}

function makeTank(color: string, mine: boolean): TankVisual {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(0.62, 0.12, 0.5), std(0x11131b, 0.7), 0, 0.06, 0));
  group.add(mesh(new THREE.BoxGeometry(0.54, 0.16, 0.4), std(color, 0.4, 0.2), 0, 0.2, 0));
  group.add(
    mesh(
      new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      std(color, 0.35, 0.3),
      0,
      0.28,
      0,
    ),
  );
  for (const x of [-0.2, 0, 0.2])
    for (const z of [-0.25, 0.25])
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateX(Math.PI / 2),
          std(0x07080d, 0.8),
          x,
          0.07,
          z,
        ),
      );
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.31, 0);
  pivot.add(
    mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.42, 10).rotateZ(-Math.PI / 2).translate(0.24, 0, 0),
      std(0xe2e8f0, 0.3, 0.7),
    ),
  );
  group.add(pivot);
  const ring = mesh(
    new THREE.RingGeometry(0.4, 0.45, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: mine ? 0xffffff : color,
      transparent: true,
      opacity: 0.85,
    }),
    0,
    0.012,
    0,
    'none',
  );
  group.add(ring);
  // Barra de vida: fondo oscuro y relleno que se encoge desde la derecha.
  const holder = new THREE.Group();
  holder.position.set(0, 0.72, 0);
  holder.add(
    mesh(
      new THREE.PlaneGeometry(0.66, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.65 }),
      0,
      0,
      0,
      'none',
    ),
  );
  const barMaterial = new THREE.MeshBasicMaterial({ color: 0x34d399 });
  const bar = mesh(new THREE.PlaneGeometry(0.64, 0.06), barMaterial, 0, 0, 0.002, 'none');
  holder.add(bar);
  group.add(holder);
  return { group, pivot, ring, bar, barMaterial, holder };
}

function buildMap(state: TanksPublicState): THREE.Group {
  const group = new THREE.Group();
  const [top, mid, low] = SKIES[state.map] ?? SKIES['canon-carmesi']!;
  const sky = canvasTexture(16, 256, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.65, mid);
    gradient.addColorStop(1, low);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  group.add(
    mesh(
      new THREE.PlaneGeometry(70, 26),
      new THREE.MeshBasicMaterial({ map: sky }),
      0,
      7,
      -9,
      'none',
    ),
  );
  const lunar = state.map === 'crater-lunar';
  if (!lunar) {
    group.add(
      mesh(
        new THREE.CircleGeometry(1.1, 40),
        new THREE.MeshBasicMaterial({ color: 0xffd27a }),
        2.6,
        1.5,
        -8.9,
        'none',
      ),
    );
  } else {
    const stars = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      stars[i * 3] = ((i * 97) % 300) / 10 - 15;
      stars[i * 3 + 1] = 1 + ((i * 53) % 110) / 10;
      stars[i * 3 + 2] = -8.8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    group.add(
      new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 })),
    );
  }
  const ridge = (z: number, color: number, seed: number, height: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-22, -3);
    for (let x = -22; x <= 22; x += 0.8) {
      shape.lineTo(
        x,
        height +
          Math.sin(x * 0.45 + seed) * height * 0.6 +
          Math.sin(x * 1.3 + seed * 2) * height * 0.25,
      );
    }
    shape.lineTo(22, -3);
    group.add(
      mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }), 0, 0, z, 'none'),
    );
  };
  ridge(-6, lunar ? 0x1a1d33 : 0x2a1228, 1.3, 1.9);
  ridge(-3.5, lunar ? 0x12152a : 0x1b0e1e, 4.1, 1.2);

  const [soil, turf, stone, accent] = GROUNDS[state.map] ?? GROUNDS['canon-carmesi']!;
  // Relieve: el perfil del mapa extruido en profundidad, más una capa fina de
  // superficie que sigue la misma línea.
  const profile = (offset: number) => {
    const points: [number, number][] = [];
    for (let x = 0; x <= TANK_FIELD.width; x += 20) {
      points.push([toX(x), toY(tankGroundAt(state.map, x)) - offset]);
    }
    return points;
  };
  const slab = (top: [number, number][], bottomY: number, depth: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(top[0]![0] - 0.3, bottomY);
    shape.lineTo(top[0]![0] - 0.3, top[0]![1]);
    for (const [x, y] of top) shape.lineTo(x, y);
    shape.lineTo(top[top.length - 1]![0] + 0.3, top[top.length - 1]![1]);
    shape.lineTo(top[top.length - 1]![0] + 0.3, bottomY);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(
      0,
      0,
      -depth / 2,
    );
  };
  const surface = profile(0);
  group.add(mesh(slab(surface, -1.2, 1.8), std(soil, 0.95), 0, 0, 0, 'receive'));
  const crust = new THREE.Shape();
  crust.moveTo(surface[0]![0], surface[0]![1] - 0.07);
  for (const [x, y] of surface) crust.lineTo(x, y + 0.005);
  for (const [x, y] of [...surface].reverse()) crust.lineTo(x, y - 0.07);
  crust.closePath();
  group.add(
    mesh(
      new THREE.ExtrudeGeometry(crust, { depth: 1.84, bevelEnabled: false }).translate(0, 0, -0.92),
      std(turf, 0.9),
      0,
      0,
      0,
      'receive',
    ),
  );
  group.add(
    mesh(
      new THREE.PlaneGeometry(80, 30).rotateX(-Math.PI / 2),
      std(0x0c0a14, 0.9),
      0,
      -1.2,
      4,
      'receive',
    ),
  );

  const KIND_COLORS: Record<string, number> = {
    sandbags: 0xb59563,
    bunker: 0x5f6068,
    wall: 0x5d5c66,
    tower: 0x4a4339,
    ruin: 0x5b5e6c,
  };
  for (const obstacle of state.obstacles) {
    const w = obstacle.width * S;
    const h = obstacle.height * S;
    const x = toX(obstacle.x + obstacle.width / 2);
    const y = toY(obstacle.y + obstacle.height) + h / 2;
    const kind = obstacle.kind ?? 'rock';
    const depth = kind === 'wall' || kind === 'tower' ? 0.5 : kind === 'sandbags' ? 0.8 : 1.1;
    group.add(
      mesh(
        new THREE.BoxGeometry(w, h, depth),
        std(KIND_COLORS[kind] ?? stone, kind === 'sandbags' ? 1 : 0.75, 0.05),
        x,
        y,
        0,
      ),
    );
    if (kind === 'bunker') {
      // Tronera oscura en la cara que mira al jugador.
      group.add(
        mesh(
          new THREE.BoxGeometry(w * 0.64, 0.07, 0.02),
          std(0x050507, 1),
          x,
          y + h * 0.15,
          depth / 2 + 0.01,
          'none',
        ),
      );
    }
    if (kind === 'tower' || kind === 'wall') {
      group.add(
        mesh(
          new THREE.BoxGeometry(w + 0.04, 0.05, depth + 0.04),
          glow(accent, 2.4),
          x,
          y + h / 2 - 0.15,
          0,
          'none',
        ),
      );
    }
  }

  // Decorado: no choca con nada, solo ambienta.
  const decor = TANK_MAPS.find((entry) => entry.id === state.map)?.decor ?? [];
  const dark = std(0x1b1715, 0.9);
  for (const item of decor) {
    const x = toX(item.x);
    const size = item.size * S;
    // Todo el decorado se apoya en el relieve bajo su centro.
    const base = toY(tankGroundAt(state.map, item.x));
    if (item.kind === 'crater') {
      group.add(
        mesh(
          new THREE.CircleGeometry(size / 2, 24).rotateX(-Math.PI / 2).scale(1, 1, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }),
          x,
          base + 0.035,
          0.35,
          'none',
        ),
      );
    } else if (item.kind === 'wreck') {
      group.add(mesh(new THREE.BoxGeometry(size, 0.2, 0.42), dark, x, base + 0.1, -0.35));
      group.add(
        mesh(new THREE.BoxGeometry(size * 0.4, 0.12, 0.3), dark, x - 0.04, base + 0.26, -0.35),
      );
    } else if (item.kind === 'tree') {
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.03, 0.05, size * 1.4, 6),
          std(0x2b1a12, 1),
          x,
          base + size * 0.7,
          -0.6,
        ),
      );
      for (const [dx, dy, rz] of [
        [-0.08, 0.95, 0.8],
        [0.09, 1.15, -0.7],
      ] as const) {
        group.add(
          mesh(
            new THREE.CylinderGeometry(0.015, 0.025, 0.24, 5),
            std(0x2b1a12, 1),
            x + dx,
            base + size * dy,
            -0.6,
          ).rotateZ(rz),
        );
      }
    } else if (item.kind === 'wire') {
      const posts = Math.max(2, Math.round(item.size / 36));
      for (let index = 0; index <= posts; index += 1) {
        const worldX = item.x - item.size / 2 + (index * item.size) / posts;
        const postBase = toY(tankGroundAt(state.map, worldX));
        group.add(
          mesh(
            new THREE.BoxGeometry(0.025, 0.26, 0.025),
            dark,
            toX(worldX),
            postBase + 0.13,
            0.55,
            'none',
          ),
        );
      }
      for (const height of [0.1, 0.18, 0.25]) {
        group.add(
          mesh(
            new THREE.BoxGeometry(size, 0.008, 0.008),
            std(0x9ca3af, 0.4, 0.8),
            x,
            base + height,
            0.55,
            'none',
          ),
        );
      }
    } else if (item.kind === 'flag') {
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6),
          std(0xd6d3d1, 0.5),
          x,
          base + 0.45,
          -0.5,
          'none',
        ),
      );
      group.add(
        mesh(
          new THREE.PlaneGeometry(size, 0.16),
          std(accent, 0.8, 0, { side: THREE.DoubleSide }),
          x + size / 2,
          base + 0.82,
          -0.5,
          'none',
        ),
      );
    } else if (item.kind === 'post') {
      group.add(
        mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6),
          std(0x2a2a33, 0.6),
          x,
          base + 0.35,
          -0.5,
          'none',
        ),
      );
      group.add(
        mesh(
          new THREE.BoxGeometry(0.16, 0.08, 0.08),
          glow(0xa5f3fc, 2.6),
          x,
          base + 0.72,
          -0.5,
          'none',
        ),
      );
    }
  }
  return group;
}
