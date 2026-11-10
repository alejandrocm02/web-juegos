import {
  GOLF,
  GOLF_SURFACE_COLORS,
  motionOffsetPublic,
  type GolfBallState,
  type GolfLevel,
  type LinearMotion,
} from '@arcade/shared';
import { buildLevelWalls } from '@arcade/game-engine';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { slingShot } from './aim.js';
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
 * Recorrido de minigolf en 3D.
 *
 * Levanta cada nivel a partir de la misma definición que usan el servidor y la
 * vista 2D (plataformas, paredes, bumpers, aspas, rampas), así que cualquier
 * nivel nuevo aparece aquí sin tocar este archivo. Los obstáculos móviles se
 * colocan con `motionOffsetPublic` y el reloj del nivel que manda el servidor:
 * lo que se ve coincide con lo que se simula.
 */

interface Props {
  level: GolfLevel;
  getBalls: () => GolfBallState[];
  /** Segundos de nivel según el servidor, para aspas y plataformas móviles. */
  getLevelTime: () => number;
  myId: string | undefined;
  colorOf: (playerId: string) => string;
  canShoot: () => boolean;
  onShoot: (angle: number, power: number) => void;
  onPower: (power: number) => void;
  /** Vista general del nivel en lugar de seguir a la bola. */
  overview: boolean;
  onGiveUp: (reason: string) => void;
}

const S = 0.01;
const R = GOLF.ballRadius * S;
/** Altura de las plataformas sobre el terreno: caer de ellas es salirse. */
const DEPTH = 0.34;

interface Mover {
  object: THREE.Object3D;
  motion: LinearMotion;
  x: number;
  z: number;
}
interface Spinner {
  object: THREE.Object3D;
  phase: number;
  speed: number;
}
interface BallVisual {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  sink: number;
}

export default function GolfBoard3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const rebuild = useRef<(level: GolfLevel) => void>(() => undefined);

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
    scene.background = new THREE.Color(0x16233f);
    scene.fog = new THREE.Fog(0x16233f, 14, 40);
    stage.hemi.intensity = 1.15;
    stage.key.intensity = 2.3;

    let course = new THREE.Group();
    let movers: Mover[] = [];
    let spinners: Spinner[] = [];
    let flag: THREE.Object3D | null = null;
    let half = { x: 4.7, z: 3.2 };
    let snap = true;
    const toX = (x: number) => x * S - half.x;
    const toZ = (y: number) => y * S - half.z;

    const sphere = new THREE.SphereGeometry(R, 22, 16);
    const balls = new Map<string, BallVisual>();
    const axis = new THREE.Vector3();

    const guide = new THREE.Group();
    const guideLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    const guideHead = new THREE.Mesh(
      new THREE.ConeGeometry(1, 2, 3).rotateX(Math.PI / 2).scale(1, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, depthWrite: false }),
    );
    guide.add(guideLine, guideHead);
    guide.visible = false;
    const marker = mesh(
      new THREE.RingGeometry(R * 1.5, R * 1.9, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 }),
      0,
      0.006,
      0,
      'none',
    );
    scene.add(guide, marker);

    rebuild.current = (level: GolfLevel) => {
      scene.remove(course);
      disposeTree(course);
      for (const visual of balls.values()) scene.remove(visual.mesh);
      balls.clear();
      half = { x: (level.size.w * S) / 2, z: (level.size.h * S) / 2 };
      const built = buildCourse(level, toX, toZ);
      course = built.group;
      movers = built.movers;
      spinners = built.spinners;
      flag = built.flag;
      scene.add(course);
      const extent = Math.max(half.x, half.z) + 2;
      setKeyLight(stage.key, [-half.x, 9, half.z + 3], [0, 0, 0], extent, 30);
      snap = true;
    };
    rebuild.current(latest.current.level);

    const aim = { active: false, keyboard: false, sx: 0, sy: 0, x: 0, z: -1, power: 0 };
    const forward = new THREE.Vector3();
    const groundForward = () => {
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.04)
        forward.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
      forward.normalize();
      return { forwardX: forward.x, forwardZ: forward.z };
    };
    const clearAim = () => {
      aim.active = false;
      aim.keyboard = false;
      aim.power = 0;
      latest.current.onPower(0);
    };
    const shoot = () => {
      const power = aim.power;
      // En el nivel, x va a la derecha e y hacia abajo: lo mismo que x y z aquí.
      const angle = Math.atan2(aim.z, aim.x);
      clearAim();
      if (power > 0 && latest.current.canShoot()) {
        latest.current.onShoot(angle, Math.max(0.03, power));
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !latest.current.canShoot()) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* Sin captura, el final del gesto lo recogen los listeners de window. */
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
    // El final se escucha en window: soltar fuera del lienzo también cuenta.
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
      if (!latest.current.canShoot()) return;
      if (!aim.keyboard) {
        const basis = groundForward();
        aim.keyboard = true;
        aim.active = false;
        aim.x = basis.forwardX;
        aim.z = basis.forwardZ;
        aim.power = 0.4;
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
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    canvas.addEventListener('keydown', onKey);

    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    const camLook = new THREE.Vector3();

    function frame(dt: number, time: number) {
      const state = latest.current;
      const levelTime = state.getLevelTime();
      for (const mover of movers) {
        const offset = motionOffsetPublic(mover.motion, levelTime);
        mover.object.position.x = mover.x + offset.x * S;
        mover.object.position.z = mover.z + offset.y * S;
      }
      for (const spinner of spinners) {
        // En el nivel el giro positivo va de x hacia y; aquí eso es de x hacia z.
        spinner.object.rotation.y = -(spinner.phase + spinner.speed * levelTime);
      }
      if (flag) flag.rotation.y = stage.reducedMotion ? 0 : Math.sin(time * 2.2) * 0.25;

      const source = state.getBalls();
      for (const ball of source) {
        let visual = balls.get(ball.playerId);
        if (!visual) {
          const mine = ball.playerId === state.myId;
          const item = mesh(sphere, std(mine ? 0xffffff : state.colorOf(ball.playerId), 0.25));
          scene.add(item);
          visual = { mesh: item, x: ball.x, y: ball.y, sink: 0 };
          balls.set(ball.playerId, visual);
        }
        // Mismo suavizado que la 2D hacia la última posición del servidor.
        const alpha = stage.reducedMotion ? 1 : 1 - Math.pow(0.0008, dt);
        const jump = Math.hypot(ball.x - visual.x, ball.y - visual.y);
        const nx = jump > 240 ? ball.x : visual.x + (ball.x - visual.x) * alpha;
        const ny = jump > 240 ? ball.y : visual.y + (ball.y - visual.y) * alpha;
        const dx = (nx - visual.x) * S;
        const dz = (ny - visual.y) * S;
        const moved = Math.hypot(dx, dz);
        if (moved > 1e-5 && moved < 0.5) {
          axis.set(dz / moved, 0, -dx / moved);
          visual.mesh.rotateOnWorldAxis(axis, moved / R);
        }
        visual.x = nx;
        visual.y = ny;
        if (ball.holed) {
          visual.sink = Math.min(1, visual.sink + dt * 4);
          visual.mesh.scale.setScalar(Math.max(0.01, 1 - visual.sink * 0.6));
          visual.mesh.visible = visual.sink < 1;
        } else {
          visual.sink = 0;
          visual.mesh.scale.setScalar(1);
          visual.mesh.visible = !ball.outOfBounds;
        }
        visual.mesh.position.set(toX(nx), R + ball.z * S - visual.sink * 0.1, toZ(ny));
      }
      for (const [id, visual] of balls) {
        if (source.some((ball) => ball.playerId === id)) continue;
        scene.remove(visual.mesh);
        (visual.mesh.material as THREE.Material).dispose();
        balls.delete(id);
      }

      const mine = state.myId ? balls.get(state.myId) : undefined;
      const ready = Boolean(mine?.mesh.visible) && state.canShoot();
      marker.visible = ready;
      if (mine) marker.position.set(mine.mesh.position.x, 0.006, mine.mesh.position.z);
      const showAim = ready && (aim.active || aim.keyboard) && aim.power > 0 && mine;
      guide.visible = Boolean(showAim);
      if (showAim && mine) {
        const length = 0.3 + aim.power * 1.5;
        guide.position.set(mine.mesh.position.x, 0.008, mine.mesh.position.z);
        guide.rotation.y = Math.atan2(aim.x, aim.z);
        guideLine.scale.set(0.03, 1, length);
        guideHead.scale.set(0.055, 1, 0.055);
        guideHead.position.set(0, 0, length + 0.05);
      }
      if (!state.canShoot() && (aim.active || aim.keyboard)) clearAim();

      const portrait = camera.aspect < 1;
      camera.fov = portrait ? 54 : 44;
      camera.updateProjectionMatrix();
      if (state.overview || !mine) {
        fitCamera(
          camera,
          portrait ? [0, 1.4, 0.7] : [0, 0.95, 1],
          [0, 0, 0],
          [-half.x - 0.2, 0, -half.z - 0.2, half.x + 0.2, 0.4, half.z + 0.2],
          camGoal,
        );
      } else {
        // Sigue a la bola desde arriba y un poco por detrás.
        const x = mine.mesh.position.x;
        const z = mine.mesh.position.z;
        camGoal.look.set(x, 0, z - (portrait ? 0.9 : 0.5));
        camGoal.position.set(x, portrait ? 5.4 : 3.3, z + (portrait ? 5.2 : 4.4));
      }
      const k = snap || stage.reducedMotion ? 1 : Math.min(1, dt * 4.5);
      snap = false;
      camera.position.lerp(camGoal.position, k);
      camLook.lerp(camGoal.look, k);
      camera.lookAt(camLook);
    }

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      canvas.removeEventListener('keydown', onKey);
      sphere.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  const levelId = props.level.id;
  const built = useRef(levelId);
  useEffect(() => {
    if (built.current === levelId) return;
    built.current = levelId;
    rebuild.current(latest.current.level);
  }, [levelId]);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      tabIndex={0}
      className="block aspect-[4/5] w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan sm:aspect-[960/560]"
      aria-label={
        'Nivel de minigolf en 3D: ' +
        props.level.name +
        '. Arrastra hacia atrás y suelta para golpear. Con teclado: flechas izquierda y derecha para apuntar, arriba y abajo para la potencia, espacio para golpear.'
      }
    />
  );
}

function buildCourse(
  level: GolfLevel,
  toX: (x: number) => number,
  toZ: (y: number) => number,
): { group: THREE.Group; movers: Mover[]; spinners: Spinner[]; flag: THREE.Object3D } {
  const group = new THREE.Group();
  const movers: Mover[] = [];
  const spinners: Spinner[] = [];

  group.add(
    mesh(
      new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2),
      std(0x10291c, 0.95),
      0,
      -DEPTH,
      0,
      'receive',
    ),
  );

  const stripes = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, 0, w / 2, h);
  });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  const rim = std(0xe9e2d0, 0.6);
  for (const pad of level.pads) {
    const w = pad.rect.w * S;
    const h = pad.rect.h * S;
    const holder = new THREE.Group();
    const texture = stripes.clone();
    texture.repeat.set(Math.max(1, Math.round(w / 0.6)), 1);
    const top = std(GOLF_SURFACE_COLORS[pad.surface], pad.surface === 'ice' ? 0.15 : 0.85, 0, {
      map: texture,
      ...(pad.surface === 'turbo' ? { emissive: 0x6b21a8, emissiveIntensity: 0.5 } : {}),
    });
    holder.add(mesh(new THREE.BoxGeometry(w, 0.06, h), top, 0, -0.03, 0, 'receive'));
    // Zócalo algo más ancho: deja ver un borde claro alrededor de la plataforma.
    holder.add(
      mesh(new THREE.BoxGeometry(w + 0.08, DEPTH - 0.02, h + 0.08), rim, 0, -DEPTH / 2 - 0.03, 0),
    );
    const x = toX(pad.rect.x + pad.rect.w / 2);
    const z = toZ(pad.rect.y + pad.rect.h / 2);
    holder.position.set(x, 0, z);
    group.add(holder);
    if (pad.motion) movers.push({ object: holder, motion: pad.motion, x, z });
  }
  stripes.dispose();

  for (const ramp of level.ramps) {
    const w = ramp.rect.w * S;
    const h = ramp.rect.h * S;
    const horizontal = Math.abs(ramp.dir.x) >= Math.abs(ramp.dir.y);
    const arrows = canvasTexture(128, 128, (ctx, size) => {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#fffbeb';
      ctx.lineWidth = 9;
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.atan2(ramp.dir.y, ramp.dir.x));
      for (const offset of [-34, 0, 34]) {
        ctx.beginPath();
        ctx.moveTo(offset - 12, -26);
        ctx.lineTo(offset + 12, 0);
        ctx.lineTo(offset - 12, 26);
        ctx.stroke();
      }
    });
    const wedge = mesh(
      new THREE.BoxGeometry(w, 0.05, h),
      std(0xffffff, 0.5, 0, { map: arrows, emissive: 0x92400e, emissiveIntensity: 0.35 }),
      toX(ramp.rect.x + ramp.rect.w / 2),
      0.03,
      toZ(ramp.rect.y + ramp.rect.h / 2),
    );
    // Inclinada hacia el salto, para que se lea como rampa y no como alfombra.
    const tilt = 0.09;
    if (horizontal) wedge.rotation.z = Math.sign(ramp.dir.x || 1) * tilt;
    else wedge.rotation.x = -Math.sign(ramp.dir.y || 1) * tilt;
    group.add(wedge);
  }

  for (const checkpoint of level.checkpoints) {
    group.add(
      mesh(
        new THREE.PlaneGeometry(checkpoint.rect.w * S, checkpoint.rect.h * S).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
        toX(checkpoint.rect.x + checkpoint.rect.w / 2),
        0.005,
        toZ(checkpoint.rect.y + checkpoint.rect.h / 2),
        'none',
      ),
    );
  }

  const wallMaterial = std(0xf1ead9, 0.55);
  // Bordillos: las mismas paredes que el servidor deriva de las plataformas,
  // calculadas con su misma función. Donde no hay bordillo, la bola puede caer.
  for (const edge of buildLevelWalls(level)) {
    const ax = toX(edge.ax);
    const az = toZ(edge.ay);
    const bx = toX(edge.bx);
    const bz = toZ(edge.by);
    const curb = mesh(
      new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) + 0.05, 0.11, 0.05),
      wallMaterial,
      (ax + bx) / 2,
      0.055,
      (az + bz) / 2,
    );
    curb.rotation.y = -Math.atan2(bz - az, bx - ax);
    group.add(curb);
  }
  const movingWall = std(0xfbbf24, 0.45, 0, { emissive: 0x92400e, emissiveIntensity: 0.3 });
  for (const wall of level.walls) {
    const ax = toX(wall.a.x);
    const az = toZ(wall.a.y);
    const bx = toX(wall.b.x);
    const bz = toZ(wall.b.y);
    const length = Math.hypot(bx - ax, bz - az);
    const item = mesh(
      new THREE.BoxGeometry(length + 0.07, 0.16, 0.07),
      wall.motion ? movingWall : wallMaterial,
      (ax + bx) / 2,
      0.08,
      (az + bz) / 2,
    );
    item.rotation.y = -Math.atan2(bz - az, bx - ax);
    group.add(item);
    if (wall.motion) {
      movers.push({ object: item, motion: wall.motion, x: item.position.x, z: item.position.z });
    }
  }

  for (const circle of level.circles) {
    const radius = circle.radius * S;
    const x = toX(circle.pos.x);
    const z = toZ(circle.pos.y);
    if (circle.kind === 'bumper') {
      group.add(
        mesh(new THREE.CylinderGeometry(radius, radius, 0.2, 28), std(0xec4899, 0.35), x, 0.1, z),
      );
      group.add(
        mesh(
          new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.22, 28),
          std(0xfdf2f8, 0.35),
          x,
          0.105,
          z,
        ),
      );
      group.add(
        mesh(
          new THREE.TorusGeometry(radius, 0.012, 6, 32).rotateX(Math.PI / 2),
          glow(0xf472b6, 2.4),
          x,
          0.2,
          z,
          'none',
        ),
      );
    } else {
      const rock = mesh(
        new THREE.IcosahedronGeometry(radius, 0),
        std(0x64748b, 0.9, 0, { flatShading: true }),
        x,
        radius * 0.45,
        z,
      );
      rock.scale.y = 0.75;
      rock.rotation.y = circle.pos.x;
      group.add(rock);
    }
  }

  for (const blade of level.blades) {
    const holder = new THREE.Group();
    holder.position.set(toX(blade.center.x), 0, toZ(blade.center.y));
    const length = blade.armLength * S;
    const thick = blade.armRadius * 2 * S;
    for (let i = 0; i < blade.arms; i++) {
      const arm = mesh(
        new THREE.BoxGeometry(length, 0.12, thick).translate(length / 2, 0, 0),
        std(0xe2e8f0, 0.4, 0.3),
        0,
        0.08,
        0,
      );
      arm.rotation.y = -(i * Math.PI * 2) / blade.arms;
      holder.add(arm);
    }
    holder.add(
      mesh(
        new THREE.CylinderGeometry(thick * 0.8, thick * 0.8, 0.26, 18),
        std(0x94a3b8, 0.4, 0.5),
        0,
        0.13,
        0,
      ),
    );
    holder.add(
      mesh(new THREE.SphereGeometry(thick * 0.5, 12, 8), glow(0xfbbf24, 2), 0, 0.28, 0, 'none'),
    );
    group.add(holder);
    spinners.push({ object: holder, phase: blade.phase, speed: blade.angularSpeed });
  }

  // Salida, hoyo y bandera
  group.add(
    mesh(
      new THREE.CircleGeometry(R * 2.4, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
      toX(level.start.x),
      0.004,
      toZ(level.start.y),
      'none',
    ),
  );
  const hx = toX(level.hole.x);
  const hz = toZ(level.hole.y);
  const cup = GOLF.holeRadius * S;
  group.add(
    mesh(
      new THREE.CircleGeometry(cup, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x010204 }),
      hx,
      0.005,
      hz,
      'none',
    ),
  );
  group.add(
    mesh(
      new THREE.RingGeometry(cup, cup + 0.015, 28).rotateX(-Math.PI / 2),
      std(0xe5e7eb, 0.4),
      hx,
      0.006,
      hz,
      'none',
    ),
  );
  group.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 8), std(0xe5e7eb, 0.4), hx, 0.5, hz));
  const flagShape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.34, -0.1),
    new THREE.Vector2(0, -0.2),
  ]);
  const flag = mesh(
    new THREE.ShapeGeometry(flagShape),
    std(0xf43f5e, 0.6, 0, { side: THREE.DoubleSide }),
    hx,
    1,
    hz,
  );
  group.add(flag);

  // Decorado determinista: mismos huecos libres que usa la 2D para no tapar el recorrido.
  const trunk = std(0x6b4423, 0.9);
  const leaves = [
    std(0x1f6b3a, 0.9, 0, { flatShading: true }),
    std(0x2b8048, 0.9, 0, { flatShading: true }),
  ];
  const near = (x: number, y: number, margin: number) =>
    Math.hypot(x - level.start.x, y - level.start.y) < margin * 1.4 ||
    Math.hypot(x - level.hole.x, y - level.hole.y) < margin * 1.4 ||
    level.pads.some((pad) => {
      const reach = pad.motion ? Math.hypot(pad.motion.offset.x, pad.motion.offset.y) : 0;
      return (
        x >= pad.rect.x - margin - reach &&
        x <= pad.rect.x + pad.rect.w + margin + reach &&
        y >= pad.rect.y - margin - reach &&
        y <= pad.rect.y + pad.rect.h + margin + reach
      );
    });
  for (let index = 0; index < 60; index += 1) {
    const x = -160 + ((index * 173 + level.id * 97) % (level.size.w + 320));
    const y = -160 + ((index * 109 + level.id * 61) % (level.size.h + 320));
    if (near(x, y, 60)) continue;
    // Delante del recorrido solo van matas bajas: un árbol ahí taparía la bola.
    const behind = y < Math.min(...level.pads.map((pad) => pad.rect.y)) - 30;
    const size = behind ? 0.7 + ((index * 37) % 10) / 14 : 0.3;
    const tree = new THREE.Group();
    tree.add(
      mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6), trunk, 0, 0.25, 0),
      mesh(new THREE.ConeGeometry(0.5, 0.9, 7), leaves[index % 2] ?? leaves[0]!, 0, 0.9, 0),
      mesh(new THREE.ConeGeometry(0.36, 0.7, 7), leaves[(index + 1) % 2] ?? leaves[0]!, 0, 1.4, 0),
    );
    tree.scale.setScalar(size);
    tree.position.set(toX(x), -DEPTH, toZ(y));
    group.add(tree);
  }

  return { group, movers, spinners, flag };
}
