// Run a headless 3-lap race with the pre-trained champions (no human).
// Run: node tests/race.js [presetKey]    (default: circuit)
const F1 = require('./load.js');
const key = process.argv[2] || 'circuit';
require('../js/pretrained/' + key + '.js');
const preset = F1.presetByKey(key);
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name, preset.obstacles);
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
// A learner failing a track (e.g. hill climbing stuck in a local optimum) is a result, not a bug, and
// Rookie is an untuned baseline. What must hold: the race ends, Atlas finishes, and at least 2 of the 4 learning teams finish.
const done = (id) => race.cars.some((c) => c.meta.team.id === id && c.finished);
const learners = ['es', 'ga', 'hc', 'sa'].filter(done);
const dnf = race.cars.filter((c) => !c.finished).map((c) => c.meta.label);
console.log('learning teams finished:', learners.join(', ') || 'none', '| DNF:', dnf.join(', ') || 'none');
const ok = race.done && done('astar') && learners.length >= 2;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
