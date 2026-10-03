(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  const DT = 1 / 60;

  // A group of cars released together. entries: [{ brain, meta }]
  class Heat {
    constructor(track, entries, maxSeconds) {
      this.track = track;
      this.maxTicks = Math.round((maxSeconds || 45) / DT);
      this.tick = 0;
      this.cars = entries.map((e) => new F1.Car(track, e.brain, e.meta));
    }

    get done() {
      return this.tick >= this.maxTicks || this.cars.every((c) => !c.alive);
    }

    step() {
      for (const c of this.cars) c.step(DT);
      this.tick++;
    }
  }

  // All learning teams train side by side on the same track under the same rules.
  // Fitness = distance covered in a fixed window: faster and safer drivers cover more.
  class Training {
    constructor(track, opts) {
      const o = opts || {};
      this.track = track;
      this.seconds = o.seconds || 45;
      this.size = o.size || 40;
      this.teams = F1.TEAMS.filter((t) => t.learner);
      this.trainers = {};
      this.history = {};
      this.teams.forEach((t, i) => {
        this.trainers[t.id] = t.makeTrainer(F1.makeRng((o.seed || 7) + i * 101), this.size);
        this.history[t.id] = { best: [], avg: [], bestLap: Infinity };
      });
      this.gen = 0;
      this._newHeat();
    }

    _newHeat() {
      const entries = [];
      for (const t of this.teams) {
        for (const ind of this.trainers[t.id].pop) entries.push({ brain: t.makeBrain(ind.genome), meta: { team: t, ind: ind } });
      }
      this.heat = new Heat(this.track, entries, this.seconds);
    }

    _finish() {
      for (const t of this.teams) {
        const cars = this.heat.cars.filter((c) => c.meta.team === t);
        for (const c of cars) c.meta.ind.fitness = c.dist;
        const h = this.history[t.id];
        h.best.push(Math.max(...cars.map((c) => c.dist)));
        h.avg.push(cars.reduce((s, c) => s + c.dist, 0) / cars.length);
        h.bestLap = Math.min(h.bestLap, ...cars.map((c) => c.bestLap));
        this.trainers[t.id].evolve();
      }
      this.gen++;
      this._newHeat();
    }

    step() {
      if (this.heat.done) this._finish();
      this.heat.step();
    }

    runGeneration() {
      while (!this.heat.done) this.heat.step();
      this._finish();
    }

    champions() {
      const out = {};
      for (const t of this.teams) out[t.id] = this.trainers[t.id].top(t.cars);
      return out;
    }
  }

  // source: { teamId: [{ genome }] } for the learning teams (live-trained or pre-trained).
  function buildLineup(track, source, player) {
    const lineup = [];
    for (const t of F1.TEAMS) {
      if (t.learner) {
        (source[t.id] || []).slice(0, t.cars).forEach((c, k) => {
          lineup.push({ team: t, brain: t.makeBrain(Float32Array.from(c.genome)), label: t.name + ' ' + (k + 1) });
        });
      } else {
        lineup.push({ team: t, brain: t.makeFixedBrain(track), label: t.name });
      }
    }
    if (player) lineup.push({ team: F1.PLAYER_TEAM, brain: player, label: 'YOU', isPlayer: true });
    return lineup;
  }

  class Race {
    constructor(track, lineup, laps) {
      this.track = track;
      this.laps = laps;
      this.tick = 0;
      this.countdown = 240; // 4s of start lights
      this.maxTicks = laps * 3600;
      this.cars = lineup.map((e, k) => {
        const car = new F1.Car(track, e.brain, { team: e.team, label: e.label, isPlayer: !!e.isPlayer }, { mode: 'race', laps: laps, record: true });
        car.placeOnGrid(4 + Math.floor(k / 2) * 9, (k % 2 ? 1 : -1) * 16);
        return car;
      });
    }

    get done() {
      return this.cars.every((c) => c.finished) || this.tick > this.maxTicks;
    }

    step() {
      if (this.countdown > 0) {
        this.countdown--;
        return;
      }
      for (const c of this.cars) c.step(DT);
      this.tick++;
    }

    standings() {
      return this.cars.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTick - b.finishTick;
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.dist - a.dist;
      });
    }
  }

  F1.DT = DT;
  F1.Heat = Heat;
  F1.Training = Training;
  F1.Race = Race;
  F1.buildLineup = buildLineup;
})(globalThis);
