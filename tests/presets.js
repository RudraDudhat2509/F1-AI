// Every preset must be valid, and the two non-learning teams should be able to lap it.
// Run: node tests/presets.js
const F1 = require('./load.js');
let bad = 0;
console.log('track'.padEnd(24), 'width', 'len(px)', 'cones', 'valid'.padEnd(6), 'plan'.padEnd(14), 'Atlas lap'.padEnd(10), 'Rookie lap');
for (const p of F1.PRESET_LIST) {
  const track = F1.buildTrack(p.ctrl, p.width, p.name, p.obstacles);
  const reason = track.validate();
  let plan = '-';
  const laps = {};
  if (!reason) {
    const t0 = Date.now();
    const pl = F1.getPlan(track);
    plan = (pl.avoidsCones ? 'ok ' : 'NO-AVOID ') + (Date.now() - t0) + 'ms';
    for (const id of ['astar', 'rule']) {
      const team = F1.TEAMS.find((t) => t.id === id);
      const car = new F1.Car(track, team.makeFixedBrain(track), { team: team }, { mode: 'train' });
      for (let i = 0; i < 60 * 120 && car.alive; i++) car.step(F1.DT);
      laps[id] = car.laps >= 1 ? (car.bestLap / 60).toFixed(1) + 's' : 'crash@' + Math.round((car.dist / track.length) * 100) + '%';
    }
  } else bad++;
  console.log(p.name.padEnd(24), String(p.width).padEnd(5), String(Math.round(track.length)).padEnd(7), String(p.obstacles.length).padEnd(5), (reason ? 'NO: ' + reason : 'yes').padEnd(6), plan.padEnd(14), (laps.astar || '-').padEnd(10), laps.rule || '-');
}
process.exit(bad ? 1 : 0);
