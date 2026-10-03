(function (g) {
  const F1 = (g.F1 = g.F1 || {});
  const P = F1.CAR;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---------------------------------------------------------------- reactive rule driver
  // Four tunable numbers in [0,1]. Steers toward the side with more room, slows for walls ahead.
  // "Rookie" uses fixed hand-picked values; the annealing team tunes them.
  class RuleBrain {
    constructor(p) {
      this.p = p;
      this.out = [0, 0];
    }

    think(s) {
      const p = this.p;
      const gain = 0.6 + 3.4 * p[0];
      const k = 1 + 3 * p[1];
      const c = 0.9 * p[2];
      const brakeK = 15 + 105 * p[3];
      const left = s[0] * 0.25 + s[1] * 0.5 + s[2];
      const right = s[6] * 0.25 + s[5] * 0.5 + s[4];
      const d = (right - left) / (right + left + 0.001);
      const target = (60 + (P.MAXV - 60) * clamp(s[3] * k, 0, 1)) * (1 - c * Math.abs(d));
      this.out[0] = clamp(gain * d, -1, 1);
      this.out[1] = clamp((target - s[7] * P.MAXV) / brakeK, -1, 1);
      return this.out;
    }
  }
  F1.RuleBrain = RuleBrain;
  F1.ROOKIE_PARAMS = [0.5, 0.1, 0.9, 0.3]; // slowest stable setting from a coarse 5^4 grid, no tuning after that

  // ---------------------------------------------------------------- A* racing line
  class MinHeap {
    constructor() {
      this.a = [];
    }
    get size() {
      return this.a.length;
    }
    push(pri, node) {
      const a = this.a;
      a.push([pri, node]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
  }

  // Slice the track into gates (cross-sections), each with K lateral offsets. A node is
  // (gate, offset). A* finds the shortest closed path through every gate, which cuts the corners
  // and gives a racing line. Heuristic = 0.9 x remaining centerline length (a racing line is
  // always shorter than the centerline, so 0.9 never overestimates in practice).
  function planRacingLine(track) {
    const GATE = 5;
    const K = 11;
    const MARGIN = 16;
    const n = track.n;
    const gates = Math.floor(n / GATE);
    const gi = (gt) => Math.round((gt * n) / gates) % n;
    const half = track.width / 2 - MARGIN;
    const spacing = (2 * half) / (K - 1);
    const mid = (K - 1) / 2;

    const N = (gates + 1) * K;
    const px = new Float64Array(N);
    const py = new Float64Array(N);
    for (let gt = 0; gt <= gates; gt++) {
      const i = gi(gt);
      const p = track.pts[i];
      const nm = track.normals[i];
      for (let j = 0; j < K; j++) {
        px[gt * K + j] = p.x + nm.x * (j - mid) * spacing;
        py[gt * K + j] = p.y + nm.y * (j - mid) * spacing;
      }
    }

    // Nodes within a safety margin of a cone are not walkable. 22 covers the car's half width (6)
    // plus the up-to-18 units pure pursuit lags off the line in a tight corner (measured).
    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (track.nearObstacle(px[i], py[i], 22)) blocked[i] = 1;

    const heur = (gt) => 0.9 * (gates - gt) * (n / gates) * track.step;
    const start = mid;
    const goal = gates * K + mid;
    let gScore;
    let came;
    let expanded = 0;
    let avoided = true; // false if no clean line exists and we had to ignore the cones
    for (const avoid of [true, false]) {
      gScore = new Float64Array(N).fill(Infinity);
      came = new Int32Array(N).fill(-1);
      gScore[start] = 0;
      const open = new MinHeap();
      open.push(heur(0), start);
      while (open.size) {
        const [, node] = open.pop();
        expanded++;
        if (node === goal) break;
        const gt = Math.floor(node / K);
        const j = node % K;
        if (gt >= gates) continue;
        for (let dj = -3; dj <= 3; dj++) {
          const j2 = j + dj;
          if (j2 < 0 || j2 >= K) continue;
          const nx = (gt + 1) * K + j2;
          if (avoid && blocked[nx]) continue;
          const cost = gScore[node] + Math.hypot(px[nx] - px[node], py[nx] - py[node]) + 0.5 * dj * dj;
          if (cost < gScore[nx]) {
            gScore[nx] = cost;
            came[nx] = node;
            open.push(cost + heur(gt + 1), nx);
          }
        }
      }
      if (gScore[goal] < Infinity) {
        avoided = avoid;
        break;
      }
    }

    const offs = new Float64Array(gates);
    for (let node = goal; node !== -1; node = came[node]) {
      const gt = Math.floor(node / K);
      if (gt < gates) offs[gt] = (node % K - mid) * spacing;
    }
    for (let pass = 0; pass < 3; pass++) {
      const prev = Float64Array.from(offs);
      for (let k = 0; k < gates; k++) offs[k] = 0.25 * prev[(k - 1 + gates) % gates] + 0.5 * prev[k] + 0.25 * prev[(k + 1) % gates];
    }

    const line = [];
    for (let i = 0; i < n; i++) {
      const f = (i * gates) / n;
      const g0 = Math.floor(f) % gates;
      const u = f - Math.floor(f);
      const off = offs[g0] * (1 - u) + offs[(g0 + 1) % gates] * u;
      line.push({ x: track.pts[i].x + track.normals[i].x * off, y: track.pts[i].y + track.normals[i].y * off });
    }

    // Corner speed limit from the line's curvature, then a backward pass so braking starts early.
    const kappa = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = line[(i - 3 + n) % n];
      const b = line[i];
      const c = line[(i + 3) % n];
      const ab = Math.hypot(b.x - a.x, b.y - a.y);
      const bc = Math.hypot(c.x - b.x, c.y - b.y);
      const ac = Math.hypot(c.x - a.x, c.y - a.y);
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      kappa[i] = (2 * Math.abs(cross)) / (ab * bc * ac + 1e-9);
    }
    const ks = Float64Array.from(kappa);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let d = -3; d <= 3; d++) sum += kappa[(i + d + n) % n];
      ks[i] = sum / 7;
    }
    const SAFETY = 1.0;
    const rMin = (v) => (v * (1 + (v / P.GRIP) * (v / P.GRIP))) / P.TURN; // tightest radius car can hold at v
    const speed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const R = ks[i] > 1e-5 ? 1 / ks[i] : Infinity;
      let v = 40;
      while (v < P.MAXV && rMin(v + 2) * SAFETY <= R) v += 2;
      speed[i] = v;
    }
    const decel = 260;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const nxt = speed[(i + 1) % n];
        speed[i] = Math.min(speed[i], Math.sqrt(nxt * nxt + 2 * decel * track.step));
      }
    }
    return { line: line, speed: speed, expanded: expanded, gates: gates, avoidsCones: avoided };
  }

  F1.getPlan = function (track) {
    if (!track.plan) track.plan = planRacingLine(track);
    return track.plan;
  };

  // Pure pursuit: aim at a point on the racing line a little ahead, steer to arrive on it.
  class PursuitBrain {
    constructor(plan, track) {
      this.plan = plan;
      this.step = track.step;
      this.out = [0, 0];
    }

    think(s, car) {
      const L = this.plan.line;
      const n = L.length;
      const ld = 15 + 0.35 * car.speed;
      const t = L[(car.idx + Math.max(2, Math.round(ld / this.step))) % n];
      let e = Math.atan2(t.y - car.y, t.x - car.x) - car.heading;
      while (e > Math.PI) e -= 2 * Math.PI;
      while (e < -Math.PI) e += 2 * Math.PI;
      const v = Math.max(car.speed, 30);
      const omega = ((2 * Math.sin(e)) / ld) * v;
      const eff = 1 / (1 + (v / P.GRIP) * (v / P.GRIP));
      this.out[0] = clamp(omega / (P.TURN * eff * Math.min(1, v / 40)), -1, 1);
      // Target speed: slowest point in a short window around us, cut further while off the line.
      let vmin = Infinity;
      for (let k = -2; k <= 2; k++) vmin = Math.min(vmin, this.plan.speed[(car.idx + k + n) % n]);
      const lp = L[car.idx];
      const lateral = Math.hypot(lp.x - car.x, lp.y - car.y);
      const vt = vmin * clamp(1 - lateral / 60, 0.3, 1);
      this.out[1] = clamp((vt - car.speed) / 20, -1, 1);
      return this.out;
    }
  }
  F1.PursuitBrain = PursuitBrain;

  // ---------------------------------------------------------------- the human
  class PlayerBrain {
    constructor(keys) {
      this.keys = keys; // { w, a, s, d } booleans, written by the page
      this.steer = 0;
      this.out = [0, 0];
    }

    think() {
      const k = this.keys;
      const target = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      this.steer += (target - this.steer) * 0.25; // smoothed so keyboard steering isn't twitchy
      this.out[0] = this.steer;
      this.out[1] = k.w ? 1 : k.s ? -1 : 0;
      return this.out;
    }
  }
  F1.PlayerBrain = PlayerBrain;
})(globalThis);
