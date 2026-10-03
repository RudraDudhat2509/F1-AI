// Trains every learning team on the preset track and writes js/pretrained.js so the demo starts
// with champions already trained. Run: node tools/pretrain.js [generations] [seed]
const fs = require('fs');
const path = require('path');
const F1 = require('../tests/load.js');

const GENS = Number(process.argv[2] || 200);
const SEED = Number(process.argv[3] || 7);
const preset = F1.PRESETS.circuit;
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
const tr = new F1.Training(track, { size: 40, seed: SEED });

const t0 = Date.now();
for (let g = 0; g < GENS; g++) {
  tr.runGeneration();
  if (g % 20 === 19) console.log(`gen ${g + 1}/${GENS}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const round = (v) => Number(v.toPrecision(9));
const out = { gens: GENS, seed: SEED, champions: {}, history: {} };
for (const t of tr.teams) {
  out.champions[t.id] = tr.trainers[t.id].top(5).map((c) => ({ genome: Array.from(c.genome, round), fitness: c.fitness }));
  const h = tr.history[t.id];
  out.history[t.id] = { best: h.best.map(Math.round), avg: h.avg.map(Math.round), bestLap: h.bestLap };
}
const body = 'globalThis.F1 = globalThis.F1 || {};\nF1.PRETRAINED = F1.PRETRAINED || {};\nF1.PRETRAINED[' + JSON.stringify(track.name) + '] = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'pretrained.js'), body);
console.log('wrote js/pretrained.js', (body.length / 1024).toFixed(1) + ' KB');
for (const t of tr.teams) console.log(t.name.padEnd(7), t.algo.padEnd(22), 'best lap', (tr.history[t.id].bestLap / 60).toFixed(2) + 's');
