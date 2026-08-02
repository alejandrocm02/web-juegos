/** Reproduce una melodía con síntesis local. No descarga ni usa archivos de audio. */
export async function playSonglessClip(notes: (number | null)[], bpm: number): Promise<() => void> {
  const context = new AudioContext();
  await context.resume();
  const master = context.createGain();
  master.gain.setValueAtTime(0.42, context.currentTime);
  master.connect(context.destination);

  const step = (60 / bpm) * 0.5;
  const start = context.currentTime + 0.04;

  notes.forEach((midi, index) => {
    if (midi === null) return;
    const at = start + index * step;
    const duration = step * 0.86;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(master);

    const lead = context.createOscillator();
    lead.type = 'triangle';
    lead.frequency.setValueAtTime(frequency, at);
    lead.connect(gain);
    lead.start(at);
    lead.stop(at + duration + 0.02);

    const glow = context.createOscillator();
    glow.type = 'sine';
    glow.frequency.setValueAtTime(frequency * 2, at);
    const glowGain = context.createGain();
    glowGain.gain.setValueAtTime(0.035, at);
    glowGain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.8);
    glow.connect(glowGain);
    glowGain.connect(master);
    glow.start(at);
    glow.stop(at + duration + 0.02);
  });

  const totalMs = (notes.length * step + 0.35) * 1000;
  const closeTimer = window.setTimeout(() => void context.close(), totalMs);
  return () => {
    window.clearTimeout(closeTimer);
    if (context.state !== 'closed') void context.close();
  };
}
