(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  const W = 1600;
  const H = 1000;
  const GRAB = 24; // how close a click must be to grab a control point
  const MAX_CONES = 14;
  const CONE_GAP = 70; // minimum distance between two cone centres
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Evenly spaced points along a closed polyline.
  function resampleClosed(pts, count) {
    const n = pts.length;
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + dist(pts[i], pts[(i + 1) % n]));
    const total = cum[n];
    const out = [];
    let i = 0;
    for (let k = 0; k < count; k++) {
      const t = (k * total) / count;
      while (t > cum[i + 1]) i++;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const u = (t - cum[i]) / (cum[i + 1] - cum[i] || 1);
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
    return { pts: out, total: total };
  }

  // A freehand stroke becomes a smooth loop of control points.
  function strokeToControlPoints(stroke) {
    const closing = dist(stroke[0], stroke[stroke.length - 1]);
    const raw = resampleClosed(stroke, Math.max(stroke.length, 60));
    if (raw.total < 700) return { error: 'Draw a bigger loop' };
    if (closing > raw.total * 0.3) return { error: 'End the stroke near where you started so the loop closes' };
    const count = clamp(Math.round(raw.total / 120), 8, 28);
    let pts = resampleClosed(stroke, count).pts;
    for (let pass = 0; pass < 2; pass++) {
      const prev = pts;
      pts = prev.map((p, i) => ({
        x: 0.25 * prev[(i - 1 + count) % count].x + 0.5 * p.x + 0.25 * prev[(i + 1) % count].x,
        y: 0.25 * prev[(i - 1 + count) % count].y + 0.5 * p.y + 0.25 * prev[(i + 1) % count].y,
      }));
    }
    return { ctrl: pts.map((p) => ({ x: Math.round(clamp(p.x, 70, W - 70)), y: Math.round(clamp(p.y, 70, H - 70)) })) };
  }

  function createEditor(canvas, onChange) {
    const ed = {
      ctrl: [],
      width: 90,
      obstacles: [],
      tool: 'path',
      name: 'Custom',
      built: null, // the current track (with cones), when buildable
      reason: 'Draw a loop to start',
      note: '', // last action's feedback, e.g. why a cone was refused
      drag: null,
      stroke: null,
      hover: -1,
      enabled: false, // the canvas is shared with the race views, so only react while the editor tab is open
    };

    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    const nearestPoint = (p) => {
      let best = -1;
      let bd = GRAB;
      ed.ctrl.forEach((c, i) => {
        const d = dist(c, p);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };

    // Rebuild the track and work out whether it is usable.
    function recheck() {
      ed.built = null;
      ed.bare = null;
      if (ed.ctrl.length < 4) {
        ed.reason = ed.ctrl.length ? 'Add at least 4 points' : 'Draw a loop to start';
        return onChange();
      }
      const bare = F1.buildTrack(ed.ctrl, ed.width, ed.name, []);
      ed.reason = bare.validate();
      if (!ed.reason && ed.obstacles.length) {
        if (ed.obstacles.some((o) => !bare.onTrack(o.x, o.y))) ed.reason = 'A cone is off the road: move it or remove it';
        else {
          const withCones = F1.buildTrack(ed.ctrl, ed.width, ed.name, ed.obstacles);
          if (!F1.getPlan(withCones).avoidsCones) ed.reason = 'The cones leave no clean line (road too narrow there)';
          else ed.built = withCones;
        }
      } else if (!ed.reason) ed.built = bare;
      ed.bare = bare;
      onChange();
    }

    function touch() {
      ed.name = 'Custom';
      ed.note = '';
      recheck();
    }

    function insertPoint(p) {
      if (ed.ctrl.length < 3) {
        ed.ctrl.push(p);
        return ed.ctrl.length - 1;
      }
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < ed.ctrl.length; i++) {
        const a = ed.ctrl[i];
        const b = ed.ctrl[(i + 1) % ed.ctrl.length];
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2, 0, 1);
        const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      ed.ctrl.splice(best + 1, 0, p);
      return best + 1;
    }

    function pointerDown(e) {
      if (!ed.enabled || e.button === 2) return;
      const p = toWorld(e);
      canvas.setPointerCapture(e.pointerId);
      if (ed.tool === 'cones') return placeCone(p);
      const i = nearestPoint(p);
      if (i >= 0) ed.drag = { idx: i };
      else if (ed.ctrl.length === 0) ed.stroke = [p];
      else {
        ed.drag = { idx: insertPoint({ x: Math.round(p.x), y: Math.round(p.y) }) };
        touch();
      }
    }

    function pointerMove(e) {
      if (!ed.enabled) return;
      const p = toWorld(e);
      if (ed.drag) {
        ed.ctrl[ed.drag.idx] = { x: Math.round(clamp(p.x, 20, W - 20)), y: Math.round(clamp(p.y, 20, H - 20)) };
        ed.moved = true;
      } else if (ed.stroke) {
        if (dist(p, ed.stroke[ed.stroke.length - 1]) > 8) ed.stroke.push(p);
      } else ed.hover = ed.tool === 'path' ? nearestPoint(p) : -1;
    }

    function pointerUp() {
      if (!ed.enabled) return;
      if (ed.drag) {
        ed.drag = null;
        if (ed.moved) touch();
        ed.moved = false;
      } else if (ed.stroke) {
        const s = ed.stroke;
        ed.stroke = null;
        if (s.length < 12) {
          ed.note = 'Drag to draw a loop';
          return onChange();
        }
        const r = strokeToControlPoints(s);
        if (r.error) {
          ed.note = r.error;
          return onChange();
        }
        ed.ctrl = r.ctrl;
        ed.obstacles = [];
        touch();
      }
    }

    function removeAt(p) {
      const i = nearestPoint(p);
      if (i < 0) return false;
      ed.ctrl.splice(i, 1);
      touch();
      return true;
    }

    function placeCone(p) {
      const hit = ed.obstacles.findIndex((o) => dist(o, p) < 22);
      if (hit >= 0) {
        ed.obstacles.splice(hit, 1);
        return touch();
      }
      if (!ed.bare) {
        ed.note = 'Draw the road first';
        return onChange();
      }
      if (ed.obstacles.length >= MAX_CONES) {
        ed.note = 'At most ' + MAX_CONES + ' cones';
        return onChange();
      }
      if (!ed.bare.onTrack(p.x, p.y)) {
        ed.note = 'Cones go on the road';
        return onChange();
      }
      if (ed.obstacles.some((o) => dist(o, p) < CONE_GAP)) {
        ed.note = 'Too close to another cone';
        return onChange();
      }
      const bare = ed.bare;
      let ni = 0;
      let nd = Infinity;
      bare.pts.forEach((q, i) => {
        const d = dist(q, p);
        if (d < nd) {
          nd = d;
          ni = i;
        }
      });
      if (ni > bare.n - 60 || ni < 20) {
        ed.note = 'Keep the start and grid area clear';
        return onChange();
      }
      ed.obstacles.push({ x: Math.round(p.x), y: Math.round(p.y) });
      const before = ed.obstacles.length;
      touch();
      if (ed.reason && ed.reason.indexOf('cones') >= 0) {
        ed.obstacles.length = before - 1;
        const why = ed.reason;
        touch();
        ed.note = why;
        onChange();
      }
    }

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('contextmenu', (e) => {
      if (!ed.enabled) return;
      e.preventDefault();
      if (ed.tool === 'path') removeAt(toWorld(e));
    });
    canvas.addEventListener('dblclick', (e) => {
      if (ed.enabled && ed.tool === 'path') removeAt(toWorld(e));
    });

    ed.load = function (def) {
      ed.ctrl = def.ctrl.map((c) => ({ x: c.x, y: c.y }));
      ed.width = def.width;
      ed.obstacles = (def.obstacles || []).map((o) => ({ x: o.x, y: o.y }));
      ed.name = def.name || 'Custom';
      ed.note = '';
      recheck();
    };
    ed.setWidth = function (w) {
      ed.width = w;
      touch();
    };
    ed.clear = function () {
      ed.ctrl = [];
      ed.obstacles = [];
      ed.name = 'Custom';
      ed.note = '';
      recheck();
    };
    ed.definition = function () {
      return { name: ed.name, width: ed.width, ctrl: ed.ctrl.map((c) => ({ x: c.x, y: c.y })), obstacles: ed.obstacles.map((o) => ({ x: o.x, y: o.y })) };
    };
    ed.toJSON = function () {
      const d = ed.definition();
      return JSON.stringify({ name: d.name, width: d.width, ctrl: d.ctrl, obstacles: d.obstacles });
    };
    // Returns an error message, or null on success.
    ed.fromJSON = function (text) {
      let d;
      try {
        d = JSON.parse(text);
      } catch (e) {
        return 'That is not valid JSON';
      }
      const okPt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
      if (!d || !Array.isArray(d.ctrl) || d.ctrl.length < 4 || d.ctrl.length > 80 || !d.ctrl.every(okPt)) return 'Needs "ctrl": a list of at least 4 {x, y} points';
      if (!Number.isFinite(d.width)) return 'Needs a numeric "width"';
      const obstacles = Array.isArray(d.obstacles) ? d.obstacles : [];
      if (!obstacles.every(okPt) || obstacles.length > MAX_CONES) return '"obstacles" must be at most ' + MAX_CONES + ' {x, y} points';
      ed.load({ name: 'Custom', width: clamp(Math.round(d.width), 56, 120), ctrl: d.ctrl.map((p) => ({ x: clamp(Math.round(p.x), 20, W - 20), y: clamp(Math.round(p.y), 20, H - 20) })), obstacles: obstacles });
      return null;
    };
    ed.summary = function () {
      if (ed.reason) return { ok: false, text: ed.reason };
      const t = ed.built;
      return { ok: true, text: 'Valid: ' + Math.round(t.length) + ' px lap, ' + ed.ctrl.length + ' points, ' + ed.obstacles.length + ' cones' };
    };

    return ed; // starts empty: ed.reason already says "Draw a loop to start"
  }

  F1.createEditor = createEditor;
})(globalThis);
