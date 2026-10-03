(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  const P = {
    MAXV: 340,
    ACC: 220,
    BRAKE: 380,
    DRAG: 0.25,
    TURN: 2.8,
    GRIP: 170, // higher speed -> less turning, so fast cars must brake for corners
    RAYLEN: 220,
    RAYS: [-90, -55, -25, 0, 25, 55, 90].map((d) => (d * Math.PI) / 180),
    STALL_TIME: 2,
    NO_PROGRESS_TIME: 5,
    PENALTY_TICKS: 180, // race mode: leaving the track costs 3 seconds
  };
  F1.CAR = P;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  class Car {
    // brain: any object with think(sensors, car) -> [steer, throttle]
    // opts: { mode: 'train' | 'race', laps: N, record: bool }
    constructor(track, brain, meta, opts) {
      const o = opts || {};
      this.track = track;
      this.brain = brain;
      this.meta = meta || {};
      this.mode = o.mode || 'train';
      this.targetLaps = o.laps || Infinity;
      this.record = !!o.record;
      this.x = track.startX;
      this.y = track.startY;
      this.heading = track.startHeading;
      this.speed = 0;
      this.alive = true;
      this.deathReason = null;
      this.idx = 0;
      this.dist = 0;
      this.laps = 0;
      this.tick = 0;
      this.lapStart = 0;
      this.bestLap = Infinity;
      this.lapTimes = [];
      this.bestDist = 0;
      this.lastProgressTick = 0;
      this.stall = 0;
      this.crossedLine = true;
      this.frozen = 0;
      this.violations = 0;
      this.finished = false;
      this.finishTick = null;
      this.curTrace = [];
      this.bestTrace = null; // flat [x, y, heading, ...] of the fastest lap, for ghost replay
      this.lastTrace = null; // the lap before the current one
      this.sensors = new Float32Array(8);
    }

    // Park the car `back` samples behind the start line, `lat` units off the centerline.
    placeOnGrid(back, lat) {
      const tr = this.track;
      const i = (tr.n - back) % tr.n;
      const p = tr.pts[i];
      const nm = tr.normals[i];
      this.x = p.x + nm.x * lat;
      this.y = p.y + nm.y * lat;
      this.heading = Math.atan2(nm.ty, nm.tx);
      this.idx = i;
      this.dist = -back * tr.step;
      this.bestDist = this.dist;
      this.crossedLine = false;
    }

    step(dt) {
      if (!this.alive || this.finished) return;
      const tr = this.track;

      if (this.frozen > 0) {
        this.frozen--;
        this.tick++;
        this.speed = 0;
        if (this.record && this.crossedLine) this.curTrace.push(this.x, this.y, this.heading);
        return;
      }

      const s = this.sensors;
      for (let k = 0; k < 7; k++) s[k] = tr.rayDist(this.x, this.y, this.heading + P.RAYS[k], P.RAYLEN) / P.RAYLEN;
      s[7] = this.speed / P.MAXV;

      const out = this.brain.think(s, this);
      const steer = clamp(out[0], -1, 1);
      const thr = clamp(out[1], -1, 1);

      const force = thr >= 0 ? thr * P.ACC : thr * P.BRAKE;
      this.speed = clamp(this.speed + (force - P.DRAG * this.speed) * dt, 0, P.MAXV);
      const turnRate = (steer * P.TURN) / (1 + (this.speed / P.GRIP) * (this.speed / P.GRIP));
      this.heading += turnRate * dt * Math.min(1, this.speed / 40);
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.y += Math.sin(this.heading) * this.speed * dt;
      this.tick++;

      if (!tr.onTrack(this.x, this.y)) {
        if (this.mode === 'race') {
          // Track limits: back onto the line where we left it, frozen for the penalty.
          const p = tr.pts[this.idx];
          const nm = tr.normals[this.idx];
          this.x = p.x;
          this.y = p.y;
          this.heading = Math.atan2(nm.ty, nm.tx);
          this.speed = 0;
          this.frozen = P.PENALTY_TICKS;
          this.violations++;
          return;
        }
        this.alive = false;
        this.deathReason = 'crash';
        return;
      }

      // Progress along the centerline, handling the wrap at the start/finish line.
      const ni = tr.nearest(this.x, this.y, this.idx, 24);
      let delta = tr.s[ni] - tr.s[this.idx];
      if (delta > tr.length / 2) delta -= tr.length;
      else if (delta < -tr.length / 2) delta += tr.length;
      this.dist += delta;
      this.idx = ni;

      if (!this.crossedLine && this.dist >= 0) {
        this.crossedLine = true;
        this.lapStart = this.tick;
        this.curTrace = [];
      }
      if (this.record && this.crossedLine) this.curTrace.push(this.x, this.y, this.heading);

      while (this.dist >= (this.laps + 1) * tr.length) {
        this.laps++;
        const lap = this.tick - this.lapStart;
        this.lapTimes.push(lap);
        if (lap < this.bestLap) {
          this.bestLap = lap;
          this.bestTrace = this.curTrace;
        }
        this.lastTrace = this.curTrace;
        this.curTrace = [];
        this.lapStart = this.tick;
        if (this.laps >= this.targetLaps) {
          this.finished = true;
          this.finishTick = this.tick;
          return;
        }
      }

      if (this.mode === 'race') return;

      if (this.dist > this.bestDist + 1) {
        this.bestDist = this.dist;
        this.lastProgressTick = this.tick;
      }
      this.stall = this.speed < 8 ? this.stall + dt : 0;
      if (this.stall > P.STALL_TIME) {
        this.alive = false;
        this.deathReason = 'stalled';
      } else if ((this.tick - this.lastProgressTick) * dt > P.NO_PROGRESS_TIME) {
        this.alive = false;
        this.deathReason = 'no progress';
      }
    }
  }

  F1.Car = Car;
})(globalThis);
