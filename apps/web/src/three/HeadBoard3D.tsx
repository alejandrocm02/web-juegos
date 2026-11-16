import {
  HEAD_SPORT_FIELD,
  TEAM_META,
  type HeadSportId,
  type HeadSportSnapshot,
  type PublicPlayer,
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
 * Head Soccer y Head Basketball en 3D: el mismo partido de lado, con volumen.
 *
 * Jugadores y balón salen de los snapshots del servidor. Porterías, aros y
 * tableros se colocan con las mismas medidas que usa el servidor para decidir
 * un gol o una canasta, así que lo que se ve entrar es lo que cuenta.
 */

interface Props {
  game: HeadSportId;
  getSnapshot: () => HeadSportSnapshot;
  players: PublicPlayer[];
  meId: string;
  onGiveUp: (reason: string) => void;
}

const F = HEAD_SPORT_FIELD;
const S = 0.01;
const HALF = (F.width * S) / 2;
const toX = (x: number) => (x - F.width / 2) * S;
const toY = (y: number) => (F.groundY - y) * S;

interface PlayerVisual {
  group: THREE.Group;
  face: THREE.Group;
  leg: THREE.Group;
  x: number;
  y: number;
}

export default function HeadBoard3D(props: Props) {
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
    const soccer = latest.current.game === 'head-soccer';
    scene.background = new THREE.Color(soccer ? 0x071a2a : 0x1a0c18);
    stage.hemi.intensity = 0.95;
    stage.key.intensity = 2;
    setKeyLight(stage.key, [-2, 7, 6], [0, 1, 0], 7, 22);
    buildArena(scene, soccer);

    const visuals = new Map<string, PlayerVisual>();
    const ballRadius = (soccer ? F.soccerBallRadius : F.basketballRadius) * S;
    const ball = mesh(
      new THREE.SphereGeometry(ballRadius, 24, 18),
      std(0xffffff, 0.5, 0, {
        map: canvasTexture(128, 64, (ctx, w, h) => {
          ctx.fillStyle = soccer ? '#f8fafc' : '#ea6a1a';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#111827';
          ctx.strokeStyle = '#111827';
          ctx.lineWidth = 3;
          if (soccer) {
            for (const [x, y] of [
              [16, 16],
              [48, 44],
              [80, 16],
              [112, 44],
              [64, 6],
              [0, 44],
            ] as const) {
              ctx.beginPath();
              ctx.arc(x, y, 9, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.moveTo(w / 4, 0);
            ctx.lineTo(w / 4, h);
            ctx.moveTo((w * 3) / 4, 0);
            ctx.lineTo((w * 3) / 4, h);
            ctx.stroke();
          }
        }),
      }),
    );
    scene.add(ball);
    const smoothBall = { x: F.width / 2, y: 200, ready: false };

    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    function fit() {
      camera.fov = 40;
      camera.updateProjectionMatrix();
      fitCamera(camera, [0, 0.12, 1], [0, 2.2, 0], [-HALF, 0, -0.5, HALF, 4.6, 0.5], camGoal);
      camera.position.copy(camGoal.position);
      camera.lookAt(camGoal.look);
    }
    fit();

    function frame(dt: number) {
      const { getSnapshot, players, meId } = latest.current;
      const snapshot = getSnapshot();
      const k = stage.reducedMotion ? 1 : 1 - Math.exp(-28 * dt);

      if (
        !smoothBall.ready ||
        Math.hypot(snapshot.ball.x - smoothBall.x, snapshot.ball.y - smoothBall.y) > 300
      ) {
        // Saque o primer fotograma: se coloca de golpe, sin arrastrarlo por el campo.
        smoothBall.x = snapshot.ball.x;
        smoothBall.y = snapshot.ball.y;
        smoothBall.ready = true;
      }
      smoothBall.x += (snapshot.ball.x - smoothBall.x) * k;
      smoothBall.y += (snapshot.ball.y - smoothBall.y) * k;
      ball.position.set(toX(smoothBall.x), toY(smoothBall.y), 0);
      ball.rotation.z = -snapshot.ball.spin * 0.02;

      const seen = new Set<string>();
      for (const player of snapshot.players) {
        seen.add(player.playerId);
        let visual = visuals.get(player.playerId);
        if (!visual) {
          const skin = players.find((entry) => entry.id === player.playerId)?.color ?? '#f5c98b';
          visual = makePlayer(skin, TEAM_META[player.team].color, player.playerId === meId);
          visual.x = player.x;
          visual.y = player.y;
          scene.add(visual.group);
          visuals.set(player.playerId, visual);
        }
        visual.x += (player.x - visual.x) * k;
        visual.y += (player.y - visual.y) * k;
        visual.group.position.set(toX(visual.x), toY(visual.y), 0);
        visual.face.scale.x = player.facing;
        visual.leg.scale.x = player.facing;
        visual.leg.rotation.z = player.kickMs > 0 ? player.facing * 1.0 : 0;
      }
      for (const [id, visual] of visuals) {
        if (seen.has(id)) continue;
        scene.remove(visual.group);
        disposeTree(visual.group);
        visuals.delete(id);
      }
    }

    return () => stage.dispose();
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      role="img"
      className="block aspect-[5/3] w-full bg-black"
      aria-label={
        props.game === 'head-soccer'
          ? 'Campo de Head Soccer en 3D'
          : 'Cancha de Head Basketball en 3D'
      }
    />
  );
}

function makePlayer(skin: string, team: string, mine: boolean): PlayerVisual {
  const group = new THREE.Group();
  const head = F.headRadius * S;
  group.add(mesh(new THREE.SphereGeometry(head, 26, 20), std(skin, 0.45)));
  // Cinta del color del equipo: distingue bandos aunque dos jugadores compartan color.
  group.add(
    mesh(
      new THREE.TorusGeometry(head * 0.98, 0.03, 8, 28).rotateX(Math.PI / 2),
      std(team, 0.4),
      0,
      head * 0.35,
      0,
      'none',
    ),
  );
  group.add(
    mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 16), std(team, 0.55), 0, -head - 0.1, 0),
  );
  const face = new THREE.Group();
  for (const z of [-0.12, 0.12]) {
    face.add(
      mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        std(0xffffff, 0.3),
        head * 0.72,
        0.1,
        z * 1.15,
        'none',
      ),
    );
    face.add(
      mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        std(0x081018, 0.3),
        head * 0.92,
        0.1,
        z * 1.15,
        'none',
      ),
    );
  }
  face.add(
    mesh(new THREE.BoxGeometry(0.04, 0.03, 0.2), std(0x081018, 0.4), head * 0.9, -0.13, 0, 'none'),
  );
  group.add(face);
  const leg = new THREE.Group();
  leg.position.set(0, -head - 0.22, 0);
  leg.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.24), std(0x0f172a, 0.5), 0.12, -0.06, 0));
  group.add(leg);
  if (mine) {
    group.add(
      mesh(
        new THREE.ConeGeometry(0.08, 0.14, 4).rotateX(Math.PI),
        glow(0xffffff, 1.6),
        0,
        head + 0.22,
        0,
        'none',
      ),
    );
  }
  return { group, face, leg, x: 0, y: 0 };
}

function buildArena(scene: THREE.Scene, soccer: boolean): void {
  const ground = canvasTexture(256, 64, (ctx, w, h) => {
    if (soccer) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#2f9a4f' : '#35a857';
        ctx.fillRect((i * w) / 8, 0, w / 8, h);
      }
    } else {
      ctx.fillStyle = '#c98a4b';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(90,50,20,0.4)';
      for (let i = 0; i < 16; i++) ctx.strokeRect((i * w) / 16, -1, w / 16, h + 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(w / 2 - 1.5, 0, 3, h);
  });
  scene.add(
    mesh(
      new THREE.BoxGeometry(HALF * 2 + 0.4, 0.3, 2.4),
      std(0xffffff, 0.8, 0, { map: ground }),
      0,
      -0.15,
      0,
      'receive',
    ),
  );
  scene.add(
    mesh(
      new THREE.PlaneGeometry(40, 20).rotateX(-Math.PI / 2),
      std(0x0a0d1a, 0.9),
      0,
      -0.3,
      2,
      'receive',
    ),
  );
  const crowd = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = soccer ? '#0d1b33' : '#24122c';
    ctx.fillRect(0, 0, w, h);
    const tones = ['#67e8f9', '#f472b6', '#fbbf24', '#e2e8f0', '#a78bfa'];
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = tones[i % 5] ?? '#ffffff';
      ctx.globalAlpha = 0.25 + ((i * 37) % 50) / 100;
      ctx.fillRect((i * 97) % w, 20 + ((i * 53) % (h - 30)), 2, 2.4);
    }
  });
  scene.add(
    mesh(
      new THREE.PlaneGeometry(16, 6),
      new THREE.MeshBasicMaterial({ map: crowd }),
      0,
      2.6,
      -1.8,
      'none',
    ),
  );
  scene.add(
    mesh(
      new THREE.BoxGeometry(16, 0.06, 0.06),
      glow(soccer ? 0x22d3ee : 0xf97316, 3),
      0,
      0.5,
      -1.75,
      'none',
    ),
  );

  const teams = [TEAM_META.rojo.color, TEAM_META.azul.color] as const;
  for (const side of [-1, 1] as const) {
    const color = teams[side < 0 ? 0 : 1];
    const light = new THREE.PointLight(color, 4, 8, 1.6);
    light.position.set(side * 3.4, 3.2, 1.6);
    scene.add(light);
    if (soccer) {
      const height = (F.groundY - F.goalTop) * S;
      const depth = F.goalDepth * S;
      const post = std(color, 0.4, 0, { emissive: color, emissiveIntensity: 0.5 });
      const mouth = side * (HALF - depth);
      for (const z of [-0.7, 0.7]) {
        scene.add(mesh(new THREE.BoxGeometry(0.07, height, 0.07), post, mouth, height / 2, z));
        scene.add(
          mesh(
            new THREE.BoxGeometry(depth, 0.07, 0.07),
            post,
            side * (HALF - depth / 2),
            height,
            z,
          ),
        );
      }
      scene.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 1.47), post, mouth, height, 0));
      const net = new THREE.Mesh(
        new THREE.BoxGeometry(depth, height, 1.4, 3, 7, 7),
        new THREE.MeshBasicMaterial({
          color: 0xcbd5e1,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        }),
      );
      net.position.set(side * (HALF - depth / 2), height / 2, 0);
      scene.add(net);
    } else {
      const hoopX = side * (HALF - F.hoopX * S);
      const hoopY = toY(F.hoopY);
      const rim = F.rimHalfWidth * S;
      const boardX = side * (HALF - (F.hoopX - F.rimHalfWidth - 18) * S);
      scene.add(
        mesh(
          new THREE.TorusGeometry(rim, 0.022, 8, 30).rotateX(Math.PI / 2),
          std(0xf97316, 0.4),
          hoopX,
          hoopY,
          0,
        ),
      );
      const net = new THREE.Mesh(
        new THREE.CylinderGeometry(rim, rim * 0.62, 0.42, 12, 3, true),
        new THREE.MeshBasicMaterial({
          color: 0xf8fafc,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        }),
      );
      net.position.set(hoopX, hoopY - 0.22, 0);
      scene.add(net);
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.06, 1.28, 1.3),
          std(0xf8fafc, 0.3, 0, {
            transparent: true,
            opacity: 0.8,
            emissive: color,
            emissiveIntensity: 0.25,
          }),
          boardX,
          hoopY + 0.12,
          0,
        ),
      );
      scene.add(
        mesh(
          new THREE.BoxGeometry(0.1, hoopY + 0.5, 0.1),
          std(0x475569, 0.5),
          boardX + side * 0.12,
          (hoopY + 0.5) / 2,
          -0.5,
        ),
      );
    }
  }
}
