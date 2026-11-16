import type { BlackjackCard } from '@arcade/shared';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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
 * Mesa de blackjack en 3D.
 *
 * Solo coloca sobre el tapete las cartas que dice el servidor: las del crupier
 * al fondo y las de cada jugador en su puesto. Totales, botones y resultados
 * siguen en HTML, y las cartas se mantienen también como texto para lectores
 * de pantalla.
 */

export interface BlackjackSeat {
  id: string;
  color: string;
  cards: BlackjackCard[];
  active: boolean;
}

interface Props {
  dealerCards: (BlackjackCard | null)[];
  seats: BlackjackSeat[];
  meId: string;
  onGiveUp: (reason: string) => void;
}

const SUIT: Record<BlackjackCard['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};
const CZ = -0.5;
const SHOE = new THREE.Vector3(0.78, 0.14, -0.3);

interface CardVisual {
  mesh: THREE.Mesh;
  target: THREE.Vector3;
  faceUp: boolean;
  /** Carta pintada en el anverso, o null si aún no se conoce. */
  face: string | null;
  front: THREE.MeshStandardMaterial;
  yaw: number;
}

export default function BlackjackBoard3D(props: Props) {
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
    scene.background = new THREE.Color(0x090b16);
    scene.fog = new THREE.Fog(0x090b16, 5, 16);
    stage.hemi.intensity = 0.65;
    stage.key.intensity = 1.9;
    setKeyLight(stage.key, [0.8, 3, 1.6], [0, 0, 0], 2, 9);
    buildTable(scene);

    const cardGeometry = new THREE.BoxGeometry(0.13, 0.003, 0.182);
    const edge = std(0xf1f5f9, 0.6);
    const back = std(0xffffff, 0.5, 0, {
      map: canvasTexture(90, 126, (ctx, w, h) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#10294c';
        ctx.fillRect(6, 6, w - 12, h - 12);
        ctx.strokeStyle = '#df3347';
        ctx.lineWidth = 2;
        for (let i = -h; i < w; i += 10) {
          ctx.beginPath();
          ctx.moveTo(i, 6);
          ctx.lineTo(i + h, h - 6);
          ctx.stroke();
        }
      }),
    });
    const faces = new Map<string, THREE.CanvasTexture>();
    const faceOf = (card: BlackjackCard) => {
      const key = card.rank + card.suit;
      let texture = faces.get(key);
      if (!texture) {
        const red = card.suit === 'hearts' || card.suit === 'diamonds';
        texture = canvasTexture(180, 252, (ctx, w, h) => {
          ctx.fillStyle = '#fbfbf7';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = red ? '#d11f2f' : '#111827';
          ctx.font = 'bold 44px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(card.rank, 34, 46);
          ctx.font = '38px sans-serif';
          ctx.fillText(SUIT[card.suit], 34, 86);
          ctx.font = '120px sans-serif';
          ctx.fillText(SUIT[card.suit], w / 2, h / 2 + 62);
        });
        faces.set(key, texture);
      }
      return texture;
    };

    const cards = new Map<string, CardVisual>();
    const seatMarks = new Map<string, THREE.Mesh>();
    const markGeometry = new THREE.RingGeometry(0.17, 0.185, 40).rotateX(-Math.PI / 2);

    /** Puesto de cada jugador sobre el arco de la mesa, mirando al crupier. */
    const seatPlace = (index: number, count: number) => {
      const spread = Math.min(0.62, 0.3 * (count - 1));
      const angle = count === 1 ? 0 : -spread + (2 * spread * index) / (count - 1);
      const radius = 0.62;
      return { x: Math.sin(angle) * radius, z: CZ + Math.cos(angle) * radius, yaw: angle };
    };

    function sync(
      key: string,
      card: BlackjackCard | null,
      target: THREE.Vector3,
      yaw: number,
      seen: Set<string>,
    ) {
      seen.add(key);
      let visual = cards.get(key);
      if (!visual) {
        const front = std(0xffffff, 0.45);
        const item = new THREE.Mesh(cardGeometry, [edge, edge, front, back, edge, edge]);
        item.castShadow = true;
        item.position.copy(SHOE);
        item.rotation.z = Math.PI;
        scene.add(item);
        visual = { mesh: item, target: new THREE.Vector3(), faceUp: false, face: null, front, yaw };
        cards.set(key, visual);
      }
      visual.target.copy(target);
      visual.yaw = yaw;
      visual.faceUp = card !== null;
      const face = card ? card.rank + card.suit : null;
      if (card && face !== visual.face) {
        visual.front.map = faceOf(card);
        visual.front.needsUpdate = true;
        visual.face = face;
      }
    }

    const camGoal = { position: new THREE.Vector3(), look: new THREE.Vector3() };
    function fit() {
      const portrait = camera.aspect < 1.1;
      camera.fov = portrait ? 50 : 40;
      camera.updateProjectionMatrix();
      fitCamera(camera, [0, 1.05, 1], [0, 0, -0.08], [-0.7, 0, -0.44, 0.7, 0.1, 0.34], camGoal);
      camera.position.copy(camGoal.position);
      camera.lookAt(camGoal.look);
    }
    fit();

    const target = new THREE.Vector3();
    function frame(dt: number) {
      const state = latest.current;
      const seen = new Set<string>();
      state.dealerCards.forEach((card, index) => {
        target.set(
          (index - (state.dealerCards.length - 1) / 2) * 0.145,
          0.004 + index * 0.002,
          CZ + 0.16,
        );
        sync('dealer:' + index, card, target, 0, seen);
      });
      const marks = new Set<string>();
      state.seats.forEach((seat, seatIndex) => {
        const place = seatPlace(seatIndex, state.seats.length);
        marks.add(seat.id);
        let mark = seatMarks.get(seat.id);
        if (!mark) {
          mark = mesh(
            markGeometry,
            new THREE.MeshBasicMaterial({ color: seat.color, transparent: true }),
            0,
            0.003,
            0,
            'none',
          );
          scene.add(mark);
          seatMarks.set(seat.id, mark);
        }
        mark.position.set(place.x, 0.003, place.z + 0.02);
        (mark.material as THREE.MeshBasicMaterial).opacity = seat.active ? 1 : 0.35;
        mark.scale.setScalar(seat.active ? 1.12 : 1);
        seat.cards.forEach((card, index) => {
          // Las cartas se abren en abanico, perpendiculares a la línea con el crupier.
          const offset = (index - (seat.cards.length - 1) / 2) * 0.075;
          target.set(
            place.x + Math.cos(place.yaw) * offset,
            0.004 + index * 0.002,
            place.z - Math.sin(place.yaw) * offset,
          );
          sync('seat:' + seat.id + ':' + index, card, target, place.yaw, seen);
        });
      });
      for (const [id, mark] of seatMarks) {
        if (marks.has(id)) continue;
        scene.remove(mark);
        (mark.material as THREE.Material).dispose();
        seatMarks.delete(id);
      }
      // Ronda nueva: las cartas que ya no están vuelven al mazo.
      for (const [key, visual] of cards) {
        if (seen.has(key)) continue;
        scene.remove(visual.mesh);
        visual.front.dispose();
        cards.delete(key);
      }
      const k = stage.reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      for (const visual of cards.values()) {
        visual.mesh.position.lerp(visual.target, k);
        const goal = visual.faceUp ? 0 : Math.PI;
        visual.mesh.rotation.z += (goal - visual.mesh.rotation.z) * k;
        visual.mesh.rotation.y += (visual.yaw - visual.mesh.rotation.y) * k;
        visual.mesh.position.y = visual.target.y + Math.sin(visual.mesh.rotation.z) * 0.07;
      }
    }

    return () => {
      cardGeometry.dispose();
      markGeometry.dispose();
      for (const texture of faces.values()) texture.dispose();
      back.map?.dispose();
      stage.dispose();
    };
    // La escena se monta una vez; el estado vivo entra por `latest`.
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-render="3d"
      aria-hidden="true"
      className="block aspect-[4/3] w-full rounded-2xl sm:aspect-[16/9]"
    />
  );
}

function buildTable(scene: THREE.Scene): void {
  scene.add(
    mesh(
      new THREE.CircleGeometry(20, 48).rotateX(-Math.PI / 2),
      std(0x121628, 0.55, 0.15),
      0,
      -0.8,
      0,
      'receive',
    ),
  );
  const felt = canvasTexture(512, 512, (ctx, w) => {
    const gradient = ctx.createRadialGradient(w / 2, w / 2, 30, w / 2, w / 2, w / 2);
    gradient.addColorStop(0, '#178a5c');
    gradient.addColorStop(1, '#0a5236');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(244, 208, 111, 0.75)';
    ctx.lineWidth = 4;
    for (const radius of [0.86, 0.42]) {
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, (w / 2) * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  scene.add(
    mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.06, 56, 1, false, -Math.PI / 2, Math.PI),
      std(0xffffff, 0.92, 0, { map: felt }),
      0,
      -0.03,
      CZ,
      'receive',
    ),
  );
  const wood = std(0x6b3d1c, 0.4);
  scene.add(
    mesh(
      new THREE.TorusGeometry(1.05, 0.055, 12, 56, Math.PI).rotateX(Math.PI / 2),
      wood,
      0,
      0,
      CZ,
    ),
  );
  scene.add(mesh(new THREE.BoxGeometry(2.2, 0.11, 0.1), wood, 0, 0, CZ - 0.04));
  scene.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.72, 20), std(0x1b1410, 0.6), 0, -0.44, 0));
  scene.add(
    mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), std(0x111827, 0.35, 0.3), SHOE.x, 0.05, SHOE.z),
  );
  const chips = [0xdc2626, 0x2563eb, 0x111827, 0x16a34a, 0xfbbf24];
  [-0.82, -0.7, -0.76].forEach((x, stack) => {
    for (let i = 0; i < 5 + stack * 2; i++) {
      scene.add(
        mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20),
          std(chips[(i + stack) % 5] ?? 0xdc2626, 0.4),
          x,
          0.006 + i * 0.012,
          CZ + 0.14 + (stack === 2 ? 0.1 : 0),
        ),
      );
    }
  });
  const lamp = new THREE.SpotLight(0xfff1c9, 14, 5, 0.7, 0.6, 1.3);
  lamp.position.set(0, 2, 0.2);
  lamp.target.position.set(0, 0, 0);
  scene.add(lamp, lamp.target);
  scene.add(
    mesh(new THREE.BoxGeometry(0.6, 0.02, 0.02), glow(0xfbbf24, 2), 0, 0.058, CZ - 0.04, 'none'),
  );
}
