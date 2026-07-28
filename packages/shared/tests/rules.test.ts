import { describe, expect, it } from 'vitest';
import {
  GOLF_ACE_LEVEL_IDS,
  GOLF_LEVELS,
  QUIZ_CATEGORIES,
  QUIZ_QUESTIONS,
  normalizeName,
  resolveDartHit,
  sanitizeName,
} from '../src/index.js';

describe('nombres de jugador', () => {
  it('recorta espacios y limita la longitud', () => {
    expect(sanitizeName('   Ana   Maria   ')).toBe('Ana Maria');
    expect(sanitizeName('x'.repeat(50)).length).toBe(16);
  });

  it('detecta duplicados ignorando acentos y mayusculas', () => {
    expect(normalizeName('José')).toBe(normalizeName('jose'));
    expect(normalizeName('Ana')).not.toBe(normalizeName('Anna'));
  });
});

describe('banco de preguntas', () => {
  it('tiene al menos 40 preguntas validas', () => {
    expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(40);
    for (const question of QUIZ_QUESTIONS) {
      expect(question.answers).toHaveLength(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThanOrEqual(3);
      expect(new Set(question.answers).size).toBe(4);
    }
  });

  it('cubre todas las categorias', () => {
    for (const category of QUIZ_CATEGORIES) {
      expect(QUIZ_QUESTIONS.some((q) => q.category === category)).toBe(true);
    }
  });

  it('no repite identificadores', () => {
    expect(new Set(QUIZ_QUESTIONS.map((q) => q.id)).size).toBe(QUIZ_QUESTIONS.length);
  });
});

describe('diana de dardos', () => {
  it('resuelve bullseye, bull, dobles y triples', () => {
    expect(resolveDartHit(0, 0).points).toBe(50);
    expect(resolveDartHit(0, -0.07).ring).toBe('bull');
    expect(resolveDartHit(0, -0.98).ring).toBe('double');
    expect(resolveDartHit(0, -0.98).points).toBe(40);
    expect(resolveDartHit(0, -0.6).ring).toBe('triple');
    expect(resolveDartHit(0, -0.6).points).toBe(60);
    expect(resolveDartHit(0, -1.4).ring).toBe('miss');
  });
});

describe('campana de minigolf', () => {
  it('tiene exactamente 10 niveles con par y dificultad', () => {
    expect(GOLF_LEVELS).toHaveLength(10);
    for (const level of GOLF_LEVELS) {
      expect(level.par).toBeGreaterThanOrEqual(2);
      expect(level.pads.length).toBeGreaterThan(0);
      expect(level.name.length).toBeGreaterThan(3);
    }
  });

  it('marca como ruta de hoyo en uno exactamente los niveles 1, 2, 4, 6 y 10', () => {
    expect(GOLF_ACE_LEVEL_IDS).toEqual([1, 2, 4, 6, 10]);
  });

  it('progresa en dificultad', () => {
    const pars = GOLF_LEVELS.map((l) => l.par);
    expect(pars[9]).toBeGreaterThan(pars[0]);
  });
});
