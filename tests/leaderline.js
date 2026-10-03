// The live leader line rebuilds a car's path by re-simulating it alone. That only works if a car's run does
// not depend on the other cars, so check it: every car's rebuilt path must end exactly where the car is.
// Run: node tests/leaderline.js
const F1 = require('./load.js');
require('../js/leaderline.js');
const preset = F1.PRESETS.circuit;
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
const tr = new F1.Training(track, { size: 40, seed: 7 });

let checked = 0;
let bad = 0;
const check = (label) => {
  for (const c of tr.heat.cars) {
    const path = F1.replayPath(track, c.meta.team, c.meta.ind.genome, tr.heat.tick);
    const n = path.length / 3;
    if (n === 0) continue;
    const dx = path[(n - 1) * 3] - c.x;
    const dy = path[(n - 1) * 3 + 1] - c.y;
    checked++;
    if (Math.hypot(dx, dy) > 1e-6) {
      bad++;
      if (bad <= 3) console.log('MISMATCH', label, c.meta.team.name, 'off by', Math.hypot(dx, dy).toFixed(4));
    }
  }
};
for (let t = 0; t < 900; t++) {
  tr.step();
  if (t === 120 || t === 400 || t === 899) check('tick ' + (t + 1));
}
tr.runGeneration(); // finish the generation, start the next
for (let t = 0; t < 300; t++) tr.step();
check('next generation, tick 300');

// the live tracker (advanced a little at a time, as the app does) must equal a rebuild from scratch
const sample = tr.heat.cars[3];
const tracker = new F1.PathTracker(track, sample.meta.team, sample.meta.ind.genome);
for (let t = 1; t <= tr.heat.tick; t += 7) tracker.advanceTo(t);
tracker.advanceTo(tr.heat.tick);
const scratch = F1.replayPath(track, sample.meta.team, sample.meta.ind.genome, tr.heat.tick);
const same = tracker.path.length === scratch.length && tracker.path.every((v, i) => v === scratch[i]);
console.log('incremental tracker equals rebuild from scratch:', same);
if (!same) bad++;

const lead = F1.leaderOf(tr.heat.cars);
console.log(`checked ${checked} car paths, ${bad} mismatches; leader now ${lead.meta.team.name}, ${Math.round(lead.dist)} units along`);
const ok = bad === 0 && checked > 400;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
