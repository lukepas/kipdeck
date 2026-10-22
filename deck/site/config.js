/* Deck configuration: the one place to rename the product or fill contact details.
   Every "{{name}}" in index.html is replaced with `name` at load, before first paint. */
window.DECK_CONFIG = {
  // Product name. Rename here only; every {{name}} and {{cmd}} follows it.
  name: 'Kipdeck',
  // Shown in the footer of every slide.
  asOf: '10 Oct 2026',
  // Flip to true once `npx kipdeck` is live on npm (gated on the trademark search).
  // While false, every install claim says "runs from source today; npm at M1".
  npmPublished: false,
  // Kip, the mascot who runs across the slides. Set to false for a more conservative investor
  // (the URL flag ?nokip does the same for one viewing).
  kip: true,
  // Team names, spelled once (Lukas Kveraga is the sole founder, CEO and CTO). Used on the ask slide contact line.
  team: ['Lukas Kveraga'],
  // Contact block on the ask slide. Empty values are left out (nothing "to be filled" is shown).
  contactEmail: 'hello@kipdeck.com',
  // The product site (kipdeck.com), linked on the ask slide.
  demoUrl: 'https://kipdeck.com',
  repoUrl: 'https://github.com/lukepas/kipdeck',
  // Disclosure line on the team slide. It states only what is public today.
  commitment: 'Lukas Kveraga is the sole founder of {{name}} and works on it full time.',
};
