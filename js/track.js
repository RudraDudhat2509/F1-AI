(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  const W = 1600;
  const H = 1000;
  const CELL = 2; // mask resolution: one mask cell = 2 world units
  const SPACING = 4; // centerline sample spacing in world units
  const OBSTACLE_R = 14; // cone radius
  const MIN_RADIUS = 16; // tightest corner a car can physically take (it turns about 15 units wide at a crawl)

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }

  function smoothClosed(ctrl, perSeg) {
    const n = ctrl.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n];
      const p1 = ctrl[i];
      const p2 = ctrl[(i + 1) % n];
      const p3 = ctrl[(i + 2) % n];
      for (let k = 0; k < perSeg; k++) out.push(catmull(p0, p1, p2, p3, k / perSeg));
    }
    return out;
  }

  // Evenly spaced points along a closed polyline.
  function resample(poly, spacing) {
    const n = poly.length;
    const cum = [0];
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = cum[n];
    const count = Math.max(8, Math.round(total / spacing));
    const step = total / count;
    const out = [];
    let i = 0;
    for (let k = 0; k < count; k++) {
      const target = k * step;
      while (target > cum[i + 1]) i++;
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const u = (target - cum[i]) / (cum[i + 1] - cum[i] || 1);
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
    return { pts: out, step: step, length: total };
  }

  function buildTrack(ctrl, width, name, obstacles) {
    const smooth = smoothClosed(ctrl, 30);
    const rs = resample(smooth, SPACING);
    const pts = rs.pts;
    const n = pts.length;
    const cols = W / CELL;
    const rows = H / CELL;
    const mask = new Uint8Array(cols * rows);

    // Stamp a disc along every centerline sample: a thick road with round joins.
    const rr = width / 2 / CELL;
    const rc = Math.ceil(rr);
    for (let i = 0; i < n; i++) {
      const cx = Math.round(pts[i].x / CELL);
      const cy = Math.round(pts[i].y / CELL);
      for (let dy = -rc; dy <= rc; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= rows) continue;
        for (let dx = -rc; dx <= rc; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= cols) continue;
          if (dx * dx + dy * dy <= rr * rr) mask[y * cols + x] = 1;
        }
      }
    }

    // Cones punch holes in the road mask: cars see them as walls and hitting one counts as leaving the road.
    const cones = (obstacles || []).map((o) => ({ x: o.x, y: o.y }));
    const orr = OBSTACLE_R / CELL;
    const orc = Math.ceil(orr);
    for (const o of cones) {
      const cx = Math.round(o.x / CELL);
      const cy = Math.round(o.y / CELL);
      for (let dy = -orc; dy <= orc; dy++) {
        for (let dx = -orc; dx <= orc; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          if (dx * dx + dy * dy <= orr * orr) mask[y * cols + x] = 0;
        }
      }
    }

    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = i * rs.step;

    // Unit tangent and left-hand normal at every centerline sample.
    const normals = pts.map((p, i) => {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      return { x: -ty / l, y: tx / l, tx: tx / l, ty: ty / l };
    });

    const track = {
      name: name || 'Custom',
      ctrl: ctrl,
      width: width,
      pts: pts,
      n: n,
      s: s,
      normals: normals,
      step: rs.step,
      length: rs.length,
      obstacles: cones,
      W: W,
      H: H,
      startX: pts[0].x,
      startY: pts[0].y,
      startHeading: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),

      onTrack: function (x, y) {
        const ix = (x / CELL) | 0;
        const iy = (y / CELL) | 0;
        if (x < 0 || y < 0 || ix >= cols || iy >= rows) return false;
        return mask[iy * cols + ix] === 1;
      },

      // Distance a ray travels from (x,y) along angle a before leaving the road.
      rayDist: function (x, y, a, max) {
        const dx = Math.cos(a) * 3;
        const dy = Math.sin(a) * 3;
        let d = 0;
        let px = x;
        let py = y;
        while (d < max) {
          d += 3;
          px += dx;
          py += dy;
          const ix = (px / CELL) | 0;
          const iy = (py / CELL) | 0;
          if (px < 0 || py < 0 || ix >= cols || iy >= rows || mask[iy * cols + ix] === 0) return d;
        }
        return max;
      },

      // Nearest centerline sample, searched only near the last known one (cheap and loop-safe).
      nearest: function (x, y, hint, win) {
        let best = hint;
        let bestD = Infinity;
        for (let k = -win; k <= win; k++) {
          const i = (hint + k + n) % n;
          const dx = pts[i].x - x;
          const dy = pts[i].y - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      },

      // Is (x,y) within `margin` of a cone's edge?
      nearObstacle: function (x, y, margin) {
        const lim = OBSTACLE_R + margin;
        for (const o of cones) if ((o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) < lim * lim) return true;
        return false;
      },

      // Returns null when the track is usable, otherwise a short reason a person can act on.
      validate: function () {
        if (ctrl.length < 4) return 'Add at least 4 points';
        if (rs.length < 1500) return 'Track is too short';
        if (rs.length > 9000) return 'Track is too long';
        for (let i = 0; i < n; i++) {
          if (pts[i].x < width || pts[i].y < width || pts[i].x > W - width || pts[i].y > H - width) return 'Track runs too close to the edge of the map';
        }
        const gap = Math.ceil((width * 3) / rs.step);
        const lim = width * 1.1;
        for (let i = 0; i < n; i++) {
          for (let j = i + gap; j < n; j++) {
            if (n - (j - i) < gap) continue;
            const dx = pts[i].x - pts[j].x;
            const dy = pts[i].y - pts[j].y;
            if (dx * dx + dy * dy < lim * lim) return 'Track crosses itself or comes too close to itself';
          }
        }
        const k = 6;
        for (let i = 0; i < n; i++) {
          const a = pts[(i - k + n) % n];
          const b = pts[i];
          const c = pts[(i + k) % n];
          const ab = Math.hypot(b.x - a.x, b.y - a.y);
          const bc = Math.hypot(c.x - b.x, c.y - b.y);
          const ca = Math.hypot(a.x - c.x, a.y - c.y);
          const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
          const radius = area2 > 1e-6 ? (ab * bc * ca) / (2 * area2) : Infinity;
          if (radius < MIN_RADIUS) return 'A corner is tighter than a car can turn';
        }
        return null;
      },
    };
    return track;
  }

  F1.buildTrack = buildTrack;
  F1.smoothClosed = smoothClosed;
  F1.OBSTACLE_R = OBSTACLE_R;

  F1.PRESETS = {
    circuit: {
      name: 'Grand Circuit',
      width: 90,
      // starts on the top straight so the grid has room
      ctrl: [
        { x: 700, y: 140 }, { x: 1100, y: 200 }, { x: 1400, y: 350 }, { x: 1300, y: 550 },
        { x: 1000, y: 600 }, { x: 1150, y: 800 }, { x: 800, y: 880 }, { x: 500, y: 800 },
        { x: 300, y: 650 }, { x: 450, y: 500 }, { x: 200, y: 400 }, { x: 300, y: 200 },
      ],
    },
    speedway: {
      name: 'Speedway',
      width: 100,
      ctrl: [
        { x: 800, y: 130 }, { x: 1250, y: 170 }, { x: 1450, y: 400 }, { x: 1380, y: 700 },
        { x: 1000, y: 860 }, { x: 600, y: 860 }, { x: 220, y: 700 }, { x: 150, y: 400 }, { x: 350, y: 170 },
      ],
    },
    serpent: {
      name: 'Serpent',
      width: 84,
      ctrl: [
        { x: 250, y: 200 }, { x: 450, y: 130 }, { x: 650, y: 260 }, { x: 850, y: 130 },
        { x: 1050, y: 260 }, { x: 1250, y: 150 }, { x: 1450, y: 300 }, { x: 1450, y: 600 },
        { x: 1300, y: 820 }, { x: 1100, y: 740 }, { x: 900, y: 860 }, { x: 700, y: 740 },
        { x: 500, y: 860 }, { x: 250, y: 780 }, { x: 150, y: 500 },
      ],
    },
  };
})(globalThis);
