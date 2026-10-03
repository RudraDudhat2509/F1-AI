// Do all four learning teams improve under identical training? Run: node tests/headless.js [generations]
const F1 = require('./load.js');
const preset = F1.PRESETS.circuit;
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
const GENS = Number(process.argv[2] || 60);
const tr = new F1.Training(track, { size: 40, seed: 7 });
const t0 = Date.now();
const lap = (v) => (v === Infinity ? '   -  ' : (v / 60).toFixed(2).padStart(5) + 's');
for (let g = 0; g < GENS; g++) {
  tr.runGeneration();
  if (g % 10 === 9 || g === 0) {
    console.log(`gen ${String(g + 1).padStart(3)}  ` + tr.teams.map((t) => `${t.id} ${String(Math.round(tr.history[t.id].best[g])).padStart(6)} ${lap(tr.history[t.id].bestLap)}`).join(' | '));
  }
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
let ok = true;
for (const t of tr.teams) {
  const h = tr.history[t.id];
  const better = h.best[GENS - 1] > h.best[0] * 1.5 || h.best[GENS - 1] > 2 * track.length; // improved a lot, or already good (low-dim search can start near optimum)
  console.log(`${t.name.padEnd(7)} ${t.algo.padEnd(22)} first ${Math.round(h.best[0])} -> last ${Math.round(h.best[GENS - 1])}  bestLap ${lap(h.bestLap)}  ${better ? 'learned' : 'FAILED TO LEARN'}`);
  if (!better) ok = false;
}
process.exit(ok ? 0 : 1);
