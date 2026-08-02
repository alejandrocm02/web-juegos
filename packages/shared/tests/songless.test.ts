import { describe, expect, it } from 'vitest';
import { SONGLESS_CLIP_NOTES, SONGLESS_TRACKS } from '../src/index.js';

describe('catálogo de Songless', () => {
  it('incluye suficientes melodías únicas y fragmentos progresivos', () => {
    expect(SONGLESS_TRACKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SONGLESS_TRACKS.map((track) => track.id)).size).toBe(SONGLESS_TRACKS.length);
    expect(new Set(SONGLESS_TRACKS.map((track) => track.title)).size).toBe(SONGLESS_TRACKS.length);
    expect(SONGLESS_CLIP_NOTES).toEqual([4, 8, 16]);
    for (const track of SONGLESS_TRACKS) {
      expect(track.notes).toHaveLength(16);
      expect(track.bpm).toBeGreaterThanOrEqual(80);
      expect(track.notes.filter((note) => note !== null)).not.toHaveLength(0);
    }
  });
});
