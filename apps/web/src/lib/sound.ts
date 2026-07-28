/**
 * Efectos de sonido originales sintetizados con WebAudio: no se carga ningun
 * recurso externo, todo se genera en el navegador.
 */
let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = context ?? new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'triangle',
): void {
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(gain, startAt + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(envelope).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** Fanfarria ascendente para el hoyo en uno. */
export function playAceSound(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    tone(ctx, frequency, now + index * 0.09, 0.28, 0.18);
  });
  tone(ctx, 1567.98, now + 0.36, 0.6, 0.12, 'sine');
}

/** Sonido corto y seco al embocar de forma normal. */
export function playHoledSound(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 392, now, 0.14, 0.12);
  tone(ctx, 587.33, now + 0.1, 0.2, 0.1, 'sine');
}

/** Aviso grave al salirse del recorrido. */
export function playOutSound(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 196, now, 0.18, 0.12, 'sawtooth');
  tone(ctx, 130.81, now + 0.12, 0.24, 0.1, 'sawtooth');
}
