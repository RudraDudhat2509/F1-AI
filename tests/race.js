// Run a headless 3-lap race with the pre-trained champions (no human). Run: node tests/race.js
const F1 = require('./load.js');
require('../js/pretrained.js');
const preset = F1.PRESETS.circuit;
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
const pre = F1.PRETRAINED[track.name];

const race = new F1.Race(track, F1.buildLineup(track, pre.champions, null), 3);
let guard = 0;
while (!race.done && guard++ < 60 * 400) race.step();

const lap = (t) => (t === Infinity ? '-' : (t / 60).toFixed(2) + 's');
console.log(`race over after ${(race.tick / 60).toFixed(1)}s, done=${race.done}`);
race.standings().forEach((c, i) => {
  console.log(
    `P${String(i + 1).padStart(2)} ${c.meta.label.padEnd(9)} finished=${c.finished}  total ${c.finished ? (c.finishTick / 60).toFixed(1) + 's' : '-'}  best ${lap(c.bestLap)}  laps ${c.laps}  track-limit violations ${c.violations}  trace ${c.bestTrace ? c.bestTrace.length / 3 : 0}`
  );
});
const allFinished = race.cars.every((c) => c.finished);
console.log(allFinished ? 'PASS: every car finished' : 'FAIL: some cars did not finish');
process.exit(allFinished ? 0 : 1);
