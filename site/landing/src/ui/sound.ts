// Sound, off until the visitor turns it on (the speaker button in the top bar). It plays the film's
// four hook notes (A4 E5 C5 G4, design/video/audio/score.mjs) as the page's moments happen: an agent
// asking is the first two, rising, like a question; answering it resolves with the last two; a
// merge plays all four an octave up. A soft sine with a pluck envelope, made in WebAudio, nothing
// downloaded. With less motion the button still works; nothing ever plays by itself.

const HOOK = [69, 76, 72, 67];
const RHYTHM = [0, 0.19, 0.38, 0.5];
type Cue = 'ask' | 'answer' | 'merge' | 'tick';

let ctx: AudioContext | null = null;
let on = false;
let master: GainNode | null = null;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function note(midi: number, at: number, gain = 0.16, len = 0.5) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o2.type = 'triangle';
  o.frequency.value = hz(midi);
  o2.frequency.value = hz(midi) * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(master);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, at + len);
  o.start(at);
  o2.start(at);
  o.stop(at + len + 0.05);
  o2.stop(at + len + 0.05);
}

/** Plays a moment's notes, if sound is on. */
export function cue(name: Cue) {
  if (!on || !ctx) return;
  const t = ctx.currentTime + 0.02;
  if (name === 'ask') [0, 1].forEach((k) => note(HOOK[k], t + RHYTHM[k] * 0.8, 0.12));
  else if (name === 'answer') [2, 3].forEach((k, i) => note(HOOK[k], t + i * 0.12, 0.12));
  else if (name === 'merge') HOOK.forEach((m, k) => note(m + 12, t + RHYTHM[k], 0.14, 0.7));
  else note(HOOK[0] + 24, t, 0.04, 0.08);
}

/** The speaker button: aria-pressed says whether sound is on. */
export function soundButton() {
  const btn = document.getElementById('sound');
  if (!btn) return;
  btn.addEventListener('click', () => {
    on = !on;
    btn.setAttribute('aria-pressed', String(on));
    if (on && !ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (on) {
      void ctx?.resume();
      cue('answer');
    }
  });
}
