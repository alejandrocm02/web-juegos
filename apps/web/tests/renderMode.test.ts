import { describe, expect, it } from 'vitest';
import { readRequestedMode } from '../src/lib/renderMode.js';
import { slingShot } from '../src/three/aim.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('vista pedida (2D o 3D)', () => {
  it('por defecto es 2D: la 3D no se activa sola', () => {
    expect(readRequestedMode('', memoryStorage())).toBe('2d');
  });

  it('?mode=3d la activa y la recuerda para la siguiente carga', () => {
    const storage = memoryStorage();
    expect(readRequestedMode('?mode=3d', storage)).toBe('3d');
    expect(readRequestedMode('', storage)).toBe('3d');
  });

  it('?mode=2d manda sobre lo recordado', () => {
    const storage = memoryStorage({ 'arcade:render-mode': '3d' });
    expect(readRequestedMode('?mode=2d', storage)).toBe('2d');
    expect(readRequestedMode('', storage)).toBe('2d');
  });

  it('un valor desconocido no cambia nada', () => {
    expect(readRequestedMode('?mode=vr', memoryStorage({ 'arcade:render-mode': '3d' }))).toBe('3d');
  });

  it('sin almacenamiento o con almacenamiento que falla sigue funcionando', () => {
    expect(readRequestedMode('?mode=3d', null)).toBe('3d');
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readRequestedMode('', broken)).toBe('2d');
    expect(readRequestedMode('?mode=3d', broken)).toBe('3d');
  });
});

describe('puntería de tirachinas', () => {
  // Cámara mirando hacia -z: el fondo de la pantalla es z negativo.
  const away = { forwardX: 0, forwardZ: -1 };

  it('un toque sin arrastre no es un tiro', () => {
    expect(slingShot(2, 3, 200, away)).toBeNull();
  });

  it('tirar hacia abajo lanza hacia el fondo', () => {
    const shot = slingShot(0, 100, 200, away);
    expect(shot?.x).toBeCloseTo(0);
    expect(shot?.z).toBeCloseTo(-1);
    expect(shot?.power).toBeCloseTo(0.5);
  });

  it('tirar hacia la izquierda lanza hacia la derecha de la pantalla', () => {
    const shot = slingShot(-100, 0, 200, away);
    expect(shot?.x).toBeCloseTo(1);
    expect(shot?.z).toBeCloseTo(0);
  });

  it('la potencia se satura en 1', () => {
    expect(slingShot(0, 900, 200, away)?.power).toBe(1);
  });

  it('el mismo gesto sigue a la cámara cuando esta gira', () => {
    // Cámara mirando hacia +x: tirar hacia abajo debe lanzar hacia +x.
    const shot = slingShot(0, 100, 200, { forwardX: 1, forwardZ: 0 });
    expect(shot?.x).toBeCloseTo(1);
    expect(shot?.z).toBeCloseTo(0);
  });
});
