// The plumbing the cues are made with: measuring a level for headless checks.

export function rms(a: AnalyserNode): number {
  const d = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(d);
  let s = 0;
  for (const v of d) s += v * v;
  return Math.sqrt(s / d.length);
}
