// Loads the three OFL variable fonts from assets/fonts and exposes a promise
// that resolves once every face is ready, so frame 0 never renders with a
// fallback font.

const FACES = [
  { family: 'Archivo', file: 'Archivo-VF.ttf', weight: '100 900', stretch: '62% 125%' },
  { family: 'Inter Tight', file: 'InterTight-VF.ttf', weight: '100 900', stretch: '100%' },
  { family: 'JetBrains Mono', file: 'JetBrainsMono-VF.ttf', weight: '100 800', stretch: '100%' },
];

export function loadFonts(base = '../assets/fonts/') {
  const loads = FACES.map(async (f) => {
    const face = new FontFace(f.family, `url(${base}${f.file})`, {
      weight: f.weight, stretch: f.stretch, style: 'normal', display: 'block',
    });
    await face.load();
    document.fonts.add(face);
    return face;
  });
  return Promise.all(loads).then(async (faces) => {
    // Force every weight used on canvas through layout once.
    const probes = ['400 20px "Inter Tight"', '500 20px "Inter Tight"', '700 20px "Inter Tight"',
      '400 20px "JetBrains Mono"', '700 20px "JetBrains Mono"', '900 20px "Archivo"', '500 20px "Archivo"'];
    await Promise.all(probes.map((p) => document.fonts.load(p)));
    await document.fonts.ready;
    return faces;
  });
}
