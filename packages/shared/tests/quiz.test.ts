import { describe, expect, it } from 'vitest';
import {
  QUIZ_CATEGORIES,
  QUIZ_CATEGORY_SIZES,
  QUIZ_QUESTIONS,
  availableQuizQuestions,
  createRng,
  quizPool,
  quizPoolSize,
  shuffleQuizAnswers,
  type QuizCategory,
} from '../src/index.js';

describe('banco de preguntas', () => {
  it('tiene al menos 150 preguntas', () => {
    expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(150);
  });

  it('no repite identificadores', () => {
    const ids = new Set(QUIZ_QUESTIONS.map((question) => question.id));
    expect(ids.size).toBe(QUIZ_QUESTIONS.length);
  });

  it('no repite enunciados', () => {
    const texts = new Set(QUIZ_QUESTIONS.map((question) => question.text.trim().toLowerCase()));
    expect(texts.size).toBe(QUIZ_QUESTIONS.length);
  });

  it('cada pregunta tiene cuatro respuestas distintas y un indice valido', () => {
    for (const question of QUIZ_QUESTIONS) {
      expect(question.answers).toHaveLength(4);
      expect(new Set(question.answers).size).toBe(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThanOrEqual(3);
      expect(question.answers[question.correctIndex]).toBeTruthy();
    }
  });

  it('todas las categorias llegan a 20 preguntas', () => {
    for (const category of QUIZ_CATEGORIES) {
      const count = QUIZ_QUESTIONS.filter((question) => question.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(20);
    }
  });

  it('el mapa de tamanos publicado al cliente coincide con el banco real', () => {
    for (const category of QUIZ_CATEGORIES) {
      const real = QUIZ_QUESTIONS.filter((question) => question.category === category).length;
      expect(QUIZ_CATEGORY_SIZES[category], category).toBe(real);
    }
  });

  it('quizPoolSize suma lo mismo que contar el banco', () => {
    expect(quizPoolSize([])).toBe(QUIZ_QUESTIONS.length);
    expect(quizPoolSize(['cine', 'musica'])).toBe(quizPool(['cine', 'musica']).length);
  });
});

describe('seleccion por categorias', () => {
  it('quizPool devuelve solo las categorias pedidas', () => {
    const categories: QuizCategory[] = ['cine', 'musica'];
    const pool = quizPool(categories);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((question) => categories.includes(question.category))).toBe(true);
  });

  it('sin categorias devuelve el banco completo', () => {
    expect(quizPool([]).length).toBe(QUIZ_QUESTIONS.length);
  });

  it('recorta la partida en lugar de colar otras categorias', () => {
    const pool = quizPool(['cine']).length;
    expect(availableQuizQuestions(['cine'], pool + 50)).toBe(pool);
    expect(availableQuizQuestions(['cine'], 5)).toBe(5);
  });
});

describe('barajado de respuestas', () => {
  it('conserva las mismas respuestas y sigue apuntando a la correcta', () => {
    const original = QUIZ_QUESTIONS[0]!;
    const rng = createRng(12345);
    const shuffled = shuffleQuizAnswers(original, rng);
    expect([...shuffled.answers].sort()).toEqual([...original.answers].sort());
    expect(shuffled.answers[shuffled.correctIndex]).toBe(original.answers[original.correctIndex]);
  });

  it('mueve la respuesta correcta de sitio a lo largo de varias partidas', () => {
    const original = QUIZ_QUESTIONS[0]!;
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      positions.add(shuffleQuizAnswers(original, createRng(seed)).correctIndex);
    }
    // Si la posicion fuera fija, el conjunto tendria un solo elemento.
    expect(positions.size).toBeGreaterThan(1);
  });
});
