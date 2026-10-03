// Trains every learning team on one preset track and writes js/pretrained/<key>.js so the demo starts
// with champions already trained.
// Usage: node tools/pretrain.js <presetKey> [generations] [seed]     (keys: see js/presets.js)
const fs = require('fs');
const path = require('path');
const F1 = require('../tests/load.js');

const key = process.argv[2];
const GENS = Number(process.argv[3] || 200);
const SEED = Number(process.argv[4] || 7);
const preset = F1.presetByKey(key);
if (!preset) {
  console.error('unknown preset key "' + key + '". Known: ' + F1.PRESET_LIST.map((p) => p.key).join(', '));
  process.exit(1);
}
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name, preset.obstacles);
const reason = track.validate();
if (reason) {
  console.error(preset.name + ' is not a valid track: ' + reason);
  process.exit(1);
}
const tr = new F1.Training(track, { size: 40, seed: SEED });

const t0 = Date.now();
for (let g = 0; g < GENS; g++) {
  tr.runGeneration();
  if (g % 25 === 24) console.log(`[${key}] gen ${g + 1}/${GENS}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const round = (v) => Number(v.toPrecision(9));
const out = { gens: GENS, seed: SEED, champions: {}, history: {} };
for (const t of tr.teams) {
  out.champions[t.id] = tr.trainers[t.id].top(5).map((c) => ({ genome: Array.from(c.genome, round), fitness: c.fitness }));
  const h = tr.history[t.id];
  out.history[t.id] = { best: h.best.map(Math.round), avg: h.avg.map(Math.round), bestLap: h.bestLap };
}
const body =
  'globalThis.F1 = globalThis.F1 || {};\nglobalThis.F1.PRETRAINED = globalThis.F1.PRETRAINED || {};\nglobalThis.F1.PRETRAINED[' +
  JSON.stringify(track.name) + '] = ' + JSON.stringify(out) + ';\n';
fs.mkdirSync(path.join(__dirname, '..', 'js', 'pretrained'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'js', 'pretrained', key + '.js'), body);
console.log(`[${key}] wrote js/pretrained/${key}.js ${(body.length / 1024).toFixed(1)} KB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const t of tr.teams) console.log(`[${key}]`, t.name.padEnd(7), t.algo.padEnd(22), 'best lap', tr.history[t.id].bestLap === Infinity ? 'none' : (tr.history[t.id].bestLap / 60).toFixed(2) + 's');
