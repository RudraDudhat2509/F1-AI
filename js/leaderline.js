(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  // A car's run is fully deterministic (same track, same brain, no interaction with other cars), so the
  // exact path of any car can be rebuilt by re-simulating it alone from the start of its heat.
  // The tracker keeps that replay alive and only steps it forward by the new ticks each frame, so
  // drawing the leader's line live costs almost nothing and the line never lags behind the car.
  // path is flat [x, y, heading, x, y, heading, ...] with one point per tick.
  class PathTracker {
    constructor(track, team, genome) {
      this.car = new F1.Car(track, team.makeBrain(genome), { team: team }, { mode: 'train' });
      this.path = [];
      this.tick = 0;
    }

    advanceTo(tick) {
      while (this.tick < tick && this.car.alive) {
        this.car.step(F1.DT);
        this.path.push(this.car.x, this.car.y, this.car.heading);
        this.tick++;
      }
      if (!this.car.alive) this.tick = Math.max(this.tick, tick); // crashed: the path is final
    }
  }
  F1.PathTracker = PathTracker;

  F1.replayPath = function (track, team, genome, ticks) {
    const t = new PathTracker(track, team, genome);
    t.advanceTo(ticks);
    return t.path;
  };

  // The car currently out in front: furthest along among the cars still running, or among all of them
  // once everyone has crashed.
  F1.leaderOf = function (cars) {
    let lead = null;
    for (const c of cars) if (c.alive && (!lead || c.dist > lead.dist)) lead = c;
    if (lead) return lead;
    for (const c of cars) if (!lead || c.dist > lead.dist) lead = c;
    return lead;
  };
})(globalThis);
