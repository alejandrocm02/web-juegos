import {
  ARENA,
  ARENA_OBSTACLES,
  ARENA_PICKUP_META,
  type ArenaFighterState,
  type ArenaPickup,
  type ArenaZone,
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
 * Arena de Battle Royale en 3D, con la cámara siguiendo al jugador.
 *
 * Luchadores, zona y objetos salen de los snapshots del servidor. El norte
 * queda al fondo de la pantalla, así que las teclas de movimiento significan
 * lo mismo que en 2D. El puntero se proyecta sobre el suelo para orientar el
 * ataque, igual que el cursor en la vista plana.
 */

interface Props {
  getLive: () => { fighters: ArenaFighterState[]; zone: ArenaZone; pickups: ArenaPickup[] };
  players: { id: string; color: string }[];
  myId: string | undefined;
  spectating: boolean;
  onFacing: (angle: number) => void;
  onAttack: (active: boolean) => void;
  onGiveUp: (reason: string) => void;
}

const S = 0.02;
const HALF = (ARENA.width * S) / 2;
const toX = (x: number) => x * S - HALF;
const toZ = (y: number) => y * S - HALF;

interface FighterVisual {
  group: THREE.Group;
  arm: THREE.Group;
  shield: THREE.Mesh;
  bar: THREE.Mesh;
  barMaterial: THREE.MeshBasicMaterial;
  x: number;
  y: number;
}

export default function ArenaBoard3D(props: Props) {
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
        onResize: () => {
          snap = true;
        },
        onGiveUp: (reason) => latest.current.onGiveUp(reason),
      });
    } catch (error) {
      console.error('[3d]', error);
      latest.current.onGiveUp('no se pudo iniciar WebGL');
      return;
    }
    const { scene, camera } = stage;
    scene.background = new THREE.Color(0x0a0714);
    scene.fog = new THREE.Fog(0x0a0714, 14, 44);
    stage.hemi.intensity = 1.3;
    stage.key.intensity = 1.9;
    setKeyLight(stage.key, [4, 12, 5], [0, 0, 0], 12, 34);
    let snap = true;

    const floor = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#1d2946';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(103,232,249,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
    });
    floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
    floor.repeat.set(18, 18);
    scene.add(
      mesh(
        new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-Math.PI / 2),
        std(0xffffff, 0.6, 0.2, { map: floor }),
        0,
        0,
        0,
        'receive',
      ),
    );
    scene.add(
      mesh(
        new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
        std(0x1c0710, 0.9),
        0,
        -0.03,
        0,
        'receive',
      ),
    );
    for (const side of [-1, 1]) {
      scene.add(
        mesh(
          new THREE.BoxGeometry(HALF * 2 + 0.2, 0.3, 0.1),
          glow(0xef4444, 1.4),
          0,
          0.15,
          side * (HALF + 0.05),
          'none',
        ),
      );
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.1, 0.3, HALF * 2 + 0.2),
          glow(0xef4444, 1.4),
          side * (HALF + 0.05),
          0.15,
          0,
          'none',
        ),
      );
    }
    ARENA_OBSTACLES.forEach((obstacle, index) => {
      const radius = obstacle.radius * S;
      scene.add(
        mesh(
          new THREE.CylinderGeometry(radius, radius * 1.06, 1.1, 24),
          std(0x26304a, 0.5, 0.3),
          toX(obstacle.x),
          0.55,
          toZ(obstacle.y),
        ),
      );
      scene.add(
        mesh(
          new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.05, 24),
          glow(index % 2 ? 0xf472b6 : 0x22d3ee, 2),
          toX(obstacle.x),
          1.0,
          toZ(obstacle.y),
          'none',
        ),
      );
    });

    // Zona segura: pared translúcida y aro en el suelo, de radio 1 y escalados.
    const zoneWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1.6, 72, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    zoneWall.position.y = 0.8;
    const zoneRing = mesh(
      new THREE.TorusGeometry(1, 0.006, 6, 96).rotateX(Math.PI / 2),
      glow(0x67e8f9, 3),
      0,
      0.04,
      0,
      'none',
    );
    scene.add(zoneWall, zoneRing);

    const pickupGeometry = new THREE.OctahedronGeometry(ARENA.pickupRadius * S * 1.1);
    const pickups = new Map<number, THREE.Mesh>();
    const fighters = new Map<string, FighterVisual>();

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const aimAt = (event: PointerEvent) => {
      const { myId, spectating } = latest.current;
      const mine = myId ? fighters.get(myId) : undefined;
      if (spectating || !mine) return;
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
      // El ángulo del servidor va de x hacia y; aquí y es z.
      latest.current.onFacing(Math.atan2(z - mine.group.position.z, x - mine.group.position.x));
    };
    const onMove = (event: PointerEvent) => aimAt(event);
    const onDown = (event: PointerEvent) => {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* Sin captura el gesto sigue funcionando dentro del lienzo. */
      }
      aimAt(event);
      if (!latest.current.spectating) latest.current.onAttack(true);
    };
    const onUp = () => latest.current.onAttack(false);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);

    const goal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    const camLook = new THREE.Vector3();

    function frame(dt: number, time: number) {
      const { getLive, players, myId } = latest.current;
      const live = getLive();
      const alpha = stage.reducedMotion ? 1 : 1 - Math.pow(0.0015, dt);

      zoneWall.position.set(toX(live.zone.x), 0.8, toZ(live.zone.y));
      zoneRing.position.set(toX(live.zone.x), 0.04, toZ(live.zone.y));
      const radius = Math.max(0.01, live.zone.radius * S);
      zoneWall.scale.set(radius, 1, radius);
      zoneRing.scale.set(radius, 1, radius);

      const activePickups = new Set<number>();
      for (const pickup of live.pickups) {
        if (!pickup.active) continue;
        activePickups.add(pickup.id);
        let item = pickups.get(pickup.id);
        if (!item) {
          item = mesh(
            pickupGeometry,
            glow(ARENA_PICKUP_META[pickup.kind].color, 1.8),
            0,
            0,
            0,
            'cast',
          );
          scene.add(item);
          pickups.set(pickup.id, item);
        }
        item.position.set(
          toX(pickup.x),
          0.45 + (stage.reducedMotion ? 0 : Math.sin(time * 3 + pickup.id) * 0.08),
          toZ(pickup.y),
        );
        item.rotation.y = stage.reducedMotion ? 0 : time * 1.5;
      }
      for (const [id, item] of pickups) {
        if (activePickups.has(id)) continue;
        scene.remove(item);
        (item.material as THREE.Material).dispose();
        pickups.delete(id);
      }

      const seen = new Set<string>();
      for (const fighter of live.fighters) {
        seen.add(fighter.playerId);
        let visual = fighters.get(fighter.playerId);
        if (!visual) {
          const color =
            players.find((player) => player.id === fighter.playerId)?.color ?? '#94a3b8';
          visual = makeFighter(color, fighter.playerId === myId);
          visual.x = fighter.x;
          visual.y = fighter.y;
          scene.add(visual.group, visual.bar);
          fighters.set(fighter.playerId, visual);
        }
        visual.x += (fighter.x - visual.x) * alpha;
        visual.y += (fighter.y - visual.y) * alpha;
        visual.group.visible = fighter.alive;
        visual.bar.visible = fighter.alive;
        visual.group.position.set(toX(visual.x), 0, toZ(visual.y));
        visual.group.rotation.y = -fighter.facing;
        // Recién atacado, el enfriamiento está alto: el brazo barre mientras baja.
        const swing = Math.max(0, fighter.attackCooldownMs / ARENA.attackCooldownMs - 0.55) / 0.45;
        visual.arm.rotation.y = swing > 0 ? 1.1 - (1 - swing) * 2.2 : 0;
        visual.shield.visible = fighter.shield > 0;
        const ratio = Math.max(0.02, Math.min(1, fighter.health / ARENA.maxHealth));
        visual.bar.position.set(toX(visual.x), 1.25, toZ(visual.y));
        visual.bar.quaternion.copy(camera.quaternion);
        visual.bar.scale.x = ratio;
        visual.barMaterial.color.set(
          fighter.inStorm ? 0xf97316 : ratio > 0.5 ? 0x34d399 : ratio > 0.25 ? 0xfbbf24 : 0xef4444,
        );
      }
      for (const [id, visual] of fighters) {
        if (seen.has(id)) continue;
        scene.remove(visual.group, visual.bar);
        disposeTree(visual.group);
        visual.barMaterial.dispose();
        fighters.delete(id);
      }

      const mine = myId ? fighters.get(myId) : undefined;
      const portrait = camera.aspect < 1;
      camera.fov = portrait ? 54 : 46;
      camera.updateProjectionMatrix();
      if (mine?.group.visible && !latest.current.spectating) {
        const x = mine.group.position.x;
        const z = mine.group.position.z;
        goal.position.set(x, portrait ? 11.5 : 8, z + (portrait ? 8 : 7.5));
        goal.look.set(x, 0.3, z - 0.6);
      } else {
        fitCamera(camera, [0, 1.3, 0.75], [0, 0, 0], [-HALF, 0, -HALF, HALF, 1, HALF], goal);
      }
      const k = snap || stage.reducedMotion ? 1 : Math.min(1, dt * 5);
      snap = false;
      camera.position.lerp(goal.position, k);
      camLook.lerp(goal.look, k);
      camera.lookAt(camLook);
    }

    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      pickupGeometry.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      className="block aspect-[4/5] w-full touch-none bg-black sm:aspect-square"
      aria-label="Arena de Battle Royale en 3D"
    />
  );
}

function makeFighter(color: string, mine: boolean): FighterVisual {
  const group = new THREE.Group();
  const radius = ARENA.playerRadius * S;
  group.add(
    mesh(
      new THREE.CylinderGeometry(radius * 0.9, radius * 1.1, 0.5, 16),
      std(color, 0.45),
      0,
      0.25,
      0,
    ),
  );
  group.add(mesh(new THREE.SphereGeometry(radius * 0.85, 18, 14), std(color, 0.4), 0, 0.68, 0));
  group.add(
    mesh(new THREE.BoxGeometry(0.2, 0.06, 0.24), std(0x0f172a, 0.4), radius * 0.7, 0.7, 0, 'none'),
  );
  const arm = new THREE.Group();
  arm.position.set(0, 0.4, 0);
  const reach = ARENA.attackRange * S;
  arm.add(
    mesh(new THREE.BoxGeometry(reach * 0.75, 0.06, 0.1), glow(color, 1.6), reach * 0.5, 0, 0),
  );
  group.add(arm);
  const shield = mesh(
    new THREE.SphereGeometry(radius * 1.9, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    0,
    0.45,
    0,
    'none',
  );
  shield.visible = false;
  group.add(shield);
  if (mine) {
    group.add(
      mesh(
        new THREE.RingGeometry(radius * 1.5, radius * 1.8, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
        0,
        0.012,
        0,
        'none',
      ),
    );
  }
  const barMaterial = new THREE.MeshBasicMaterial({ color: 0x34d399, depthTest: false });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.08), barMaterial);
  bar.renderOrder = 4;
  return { group, arm, shield, bar, barMaterial, x: 0, y: 0 };
}
