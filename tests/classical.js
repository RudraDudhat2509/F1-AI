// Do the two non-learning teams complete laps? Run: node tests/classical.js
const F1 = require('./load.js');
const preset = F1.PRESETS.circuit;
const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
console.log('valid', track.validate(), 'length', track.length.toFixed(0));

const t0 = Date.now();
const plan = F1.getPlan(track);
console.log(`A* expanded ${plan.expanded} nodes over ${plan.gates} gates in ${Date.now() - t0}ms`);
let line = 0;
for (let i = 0; i < track.n; i++) line += Math.hypot(plan.line[(i + 1) % track.n].x - plan.line[i].x, plan.line[(i + 1) % track.n].y - plan.line[i].y);
console.log(`racing line ${line.toFixed(0)} vs centerline ${track.length.toFixed(0)} (${((1 - line / track.length) * 100).toFixed(1)}% shorter)`);
console.log('speed profile min/max', Math.min(...plan.speed).toFixed(0), Math.max(...plan.speed).toFixed(0));

for (const id of ['astar', 'rule']) {
  const team = F1.TEAMS.find((t) => t.id === id);
  const car = new F1.Car(track, team.makeFixedBrain(track), { team: team }, { mode: 'train' });
  for (let i = 0; i < 60 * 90 && car.alive; i++) car.step(F1.DT);
  console.log(
    `${team.name.padEnd(7)} alive=${car.alive} reason=${car.deathReason} laps=${car.laps} bestLap=${car.bestLap === Infinity ? '-' : (car.bestLap / 60).toFixed(2) + 's'} dist=${car.dist.toFixed(0)}`
  );
}
