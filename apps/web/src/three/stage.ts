import * as THREE from 'three';

/**
 * Base compartida de las vistas 3D: renderer, luces, bucle y vigilancia.
 *
 * Cada juego monta su escena encima. Aquí vive todo lo que no debe repetirse
 * ni olvidarse: límite de densidad de píxeles, pausa con la pestaña oculta o
 * el lienzo fuera de pantalla, aviso de contexto perdido, bajada de calidad
 * cuando el dispositivo no llega y liberación de memoria al salir.
 */

export interface StageHooks {
  /** Un fotograma. `dt` en segundos, acotado para que una pausa no dé saltos. */
  onFrame: (dt: number, time: number) => void;
  /** El lienzo cambió de tamaño. */
  onResize?: (width: number, height: number) => void;
  /** El dispositivo no puede seguir en 3D (contexto perdido o lento incluso en calidad baja). */
  onGiveUp: (reason: string) => void;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  readonly coarse: boolean;
  readonly reducedMotion: boolean;
  dispose: () => void;
}

const SLOW_FPS = 25;
const WINDOW_SECONDS = 3;

declare global {
  interface Window {
    /** Los E2E corren sin GPU: ahí la vigilancia de fps solo daría falsos fallbacks. */
    __ARCADE_NO_FPS_GUARD__?: boolean;
  }
}

export function createStage(canvas: HTMLCanvasElement, hooks: StageHooks): Stage {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  const maxRatio = coarse ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 120);
  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x141826, 0.7);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(hemi, key, key.target);

  let disposed = false;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  let visible = true;

  /** `notify` es falso en la primera medida: quien llama aún no ha montado su escena. */
  const resize = (notify = true) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (notify) hooks.onResize?.(width, height);
  };
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  const viewObserver = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  });
  viewObserver.observe(canvas);

  // Vigilancia de rendimiento: primero se baja la calidad; si ni así, se avisa.
  let windowTime = 0;
  let windowFrames = 0;
  let lowQuality = false;
  let warmup = 2;
  const watch = (realDt: number) => {
    if (window.__ARCADE_NO_FPS_GUARD__) return;
    if (warmup > 0) {
      warmup -= realDt;
      return;
    }
    windowTime += realDt;
    windowFrames += 1;
    if (windowTime < WINDOW_SECONDS) return;
    const fps = windowFrames / windowTime;
    windowTime = 0;
    windowFrames = 0;
    if (fps >= SLOW_FPS) return;
    if (!lowQuality) {
      lowQuality = true;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      scene.traverse((node) => {
        const material = (node as THREE.Mesh).material;
        for (const item of Array.isArray(material) ? material : material ? [material] : []) {
          item.needsUpdate = true;
        }
      });
      resize();
      warmup = 1;
    } else {
      hooks.onGiveUp(`rendimiento insuficiente (${Math.round(fps)} fps)`);
    }
  };

  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    // Oculto o fuera de pantalla: ni se simula ni se pinta, y al volver no hay salto.
    if (document.hidden || !visible) {
      last = 0;
      return;
    }
    const realDt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const dt = Math.min(1 / 20, realDt);
    elapsed += dt;
    hooks.onFrame(dt, elapsed);
    renderer.render(scene, camera);
    watch(realDt);
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    hooks.onGiveUp('se perdió el contexto gráfico');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  resize(false);
  frame = requestAnimationFrame(loop);

  return {
    renderer,
    scene,
    camera,
    hemi,
    key,
    coarse,
    reducedMotion,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      disposeTree(scene);
      // Sin `forceContextLoss`: el modo estricto de React monta dos veces sobre el
      // mismo lienzo y un contexto perdido a la fuerza ya no se puede reutilizar.
      // El navegador lo libera al desaparecer el lienzo.
      renderer.dispose();
    },
  };
}

/** Libera geometrías, materiales y texturas de un árbol. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    const item = node as THREE.Mesh;
    item.geometry?.dispose();
    const materials = Array.isArray(item.material)
      ? item.material
      : item.material
        ? [item.material]
        : [];
    for (const material of materials) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  });
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type Shadow = 'both' | 'cast' | 'receive' | 'none';

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  x = 0,
  y = 0,
  z = 0,
  shadow: Shadow = 'both',
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = shadow === 'both' || shadow === 'cast';
  item.receiveShadow = shadow === 'both' || shadow === 'receive';
  return item;
}

export const std = (
  color: THREE.ColorRepresentation,
  roughness = 0.6,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const glow = (
  color: THREE.ColorRepresentation,
  intensity = 2.2,
): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: color,
    emissiveIntensity: intensity,
  });

export function setKeyLight(
  key: THREE.DirectionalLight,
  position: [number, number, number],
  target: [number, number, number],
  extent: number,
  far: number,
): void {
  key.position.set(...position);
  key.target.position.set(...target);
  const camera = key.shadow.camera;
  camera.left = -extent;
  camera.right = extent;
  camera.top = extent;
  camera.bottom = -extent;
  camera.near = 0.5;
  camera.far = far;
  camera.updateProjectionMatrix();
}

/**
 * Coloca la cámara en la dirección dada, a la distancia mínima a la que la caja
 * entera cabe en pantalla. Evita ajustar distancias a mano para cada proporción.
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  direction: [number, number, number],
  target: [number, number, number],
  box: [number, number, number, number, number, number],
  out: { position: THREE.Vector3; look: THREE.Vector3 },
): void {
  const dir = new THREE.Vector3(...direction).normalize();
  const look = new THREE.Vector3(...target);
  const probe = camera.clone();
  const corner = new THREE.Vector3();
  const [x0, y0, z0, x1, y1, z1] = box;
  let distance = 0.5;
  for (; distance < 80; distance *= 1.03) {
    probe.position.copy(look).addScaledVector(dir, distance);
    probe.lookAt(look);
    probe.updateMatrixWorld();
    let fits = true;
    for (const x of [x0, x1])
      for (const y of [y0, y1])
        for (const z of [z0, z1]) {
          corner.set(x, y, z).project(probe);
          if (Math.abs(corner.x) > 0.95 || Math.abs(corner.y) > 0.93) fits = false;
        }
    if (fits) break;
  }
  out.position.copy(look).addScaledVector(dir, distance);
  out.look.copy(look);
}
