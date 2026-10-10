/* Deck configuration: the one place to rename the product or fill contact details.
   Every "{{name}}" in index.html is replaced with `name` at load, before first paint. */
window.DECK_CONFIG = {
  // Product name. Rename here only; every {{name}} and {{cmd}} follows it.
  name: 'Kipdeck',
  // Shown in the footer of every slide.
  asOf: '9 Oct 2026',
  // Flip to true once `npx kipdeck` is live on npm (gated on trademark search and employer clearance).
  // While false, every install claim says "runs from source today; npm at M1".
  npmPublished: false,
  // Kip, the mascot who runs across the slides. Set to false for a more conservative investor
  // (the URL flag ?nokip does the same for one viewing).
  kip: true,
  // Team names, spelled once. Used on the ask slide contact line.
  team: ['Žygimantas Bagdzevičius', 'Lukas Kveraga', 'Ernestas Rimkevičius'],
  // Contact block on the ask slide. Empty values are left out (nothing "to be filled" is shown).
  contactEmail: '',
  demoUrl: '',
  repoUrl: 'https://github.com/zbagdzevicius/kipdeck',
  // Disclosure line on the team slide. It states only what is public today.
  // Founders: replace it with the agreed full-time dates, equity split and IP assignment once signed.
  commitment: 'Today Žygimantas is also co-founder and CEO/CTO of Motored (Antler-backed, raising its own pre-seed), and Lukas and Ernestas are engineers there. Who goes full-time on {{name}} and from when, the equity split and IP assignment to the {{name}} company are agreed in writing before this round closes and shared in diligence.',
};
