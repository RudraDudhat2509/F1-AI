(function (g) {
  const F1 = (g.F1 = g.F1 || {});
  const P = F1.CAR;

  function pathOf(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  // Draw the road once to an offscreen canvas; everything else is drawn on top each frame.
  function drawTrackLayer(track) {
    const c = document.createElement('canvas');
    c.width = track.W;
    c.height = track.H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ebe7e2';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineJoin = 'round';

    pathOf(ctx, track.pts);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; // soft shadow
    ctx.lineWidth = track.width + 26;
    ctx.stroke();

    ctx.strokeStyle = '#19b4e8'; // kerbs
    ctx.lineWidth = track.width + 12;
    ctx.setLineDash([22, 18]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#f7f7f7';
    ctx.lineWidth = track.width + 6;
    ctx.stroke();

    ctx.strokeStyle = '#8a8a8f'; // asphalt
    ctx.lineWidth = track.width;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; // centre line
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 26]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const o of track.obstacles) drawCone(ctx, o.x, o.y);

    // start / finish line
    const p = track.pts[0];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(track.startHeading);
    const half = track.width / 2;
    const sq = 9;
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k * sq < track.width; k++) {
        ctx.fillStyle = (r + k) % 2 ? '#1d1d22' : '#ffffff';
        ctx.fillRect(r * sq - sq, -half + k * sq, sq, sq);
      }
    }
    ctx.restore();
    return c;
  }

  // The A* line, coloured by the speed the planner expects (red = slow corner, green = flat out).
  function drawRacingLine(ctx, plan) {
    const L = plan.line;
    const n = L.length;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i += 2) {
      const f = Math.max(0, Math.min(1, (plan.speed[i] - 40) / (P.MAXV - 40)));
      ctx.strokeStyle = 'hsla(' + Math.round(f * 125) + ',85%,45%,0.9)';
      ctx.beginPath();
      ctx.moveTo(L[i].x, L[i].y);
      ctx.lineTo(L[(i + 2) % n].x, L[(i + 2) % n].y);
      ctx.stroke();
    }
  }

  function carBody(ctx, x, y, heading, color, alpha, outline) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-10, -4, 26, 14);
    ctx.fillStyle = color;
    ctx.fillRect(-12, -6, 26, 12);
    ctx.strokeStyle = 'rgba(29,29,34,0.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-12, -6, 26, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(2, -3, 6, 6);
    if (outline) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1d1d22';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-15, -9, 32, 18);
    }
    ctx.restore();
  }

  function drawCar(ctx, car, color, outline) {
    carBody(ctx, car.x, car.y, car.heading, color, car.frozen > 0 ? 0.45 : 1, outline);
  }

  function drawGhost(ctx, x, y, heading, color) {
    carBody(ctx, x, y, heading, color, 0.6, false);
  }

  function drawLabel(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(text, x, y - 16);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - 16);
    ctx.restore();
  }

  const MEDAL = ['#e0b100', '#aeb4bb', '#c47a3a'];
  function drawBadge(ctx, x, y, place) {
    ctx.save();
    ctx.fillStyle = MEDAL[place - 1];
    ctx.strokeStyle = '#1d1d22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 16, y - 16, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d1d22';
    ctx.font = '800 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(place), x + 16, y - 15);
    ctx.restore();
  }

  function drawSensors(ctx, car) {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      const len = car.sensors[k] * P.RAYLEN;
      const a = car.heading + P.RAYS[k];
      ctx.strokeStyle = car.sensors[k] < 0.3 ? 'rgba(225,6,0,0.9)' : 'rgba(25,180,232,0.9)';
      ctx.beginPath();
      ctx.moveTo(car.x, car.y);
      ctx.lineTo(car.x + Math.cos(a) * len, car.y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCone(ctx, x, y) {
    const r = F1.OBSTACLE_R;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a00';
    ctx.strokeStyle = '#1d1d22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7a00';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The editor view: a cheap road preview (no collision mask), control points, cones, the stroke being drawn.
  function drawEditor(ctx, ed) {
    ctx.save(); // text alignment and dashes set below must not leak into other views
    ctx.fillStyle = '#ebe7e2';
    ctx.fillRect(0, 0, 1600, 1000);
    const ok = !ed.reason;
    if (ed.ctrl.length >= 3) {
      const sm = F1.smoothClosed(ed.ctrl, 16);
      ctx.lineJoin = 'round';
      pathOf(ctx, sm);
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = ed.width + 26;
      ctx.stroke();
      ctx.strokeStyle = ok ? '#19b4e8' : '#e5484d';
      ctx.lineWidth = ed.width + 12;
      ctx.setLineDash([22, 18]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#f7f7f7';
      ctx.lineWidth = ed.width + 6;
      ctx.stroke();
      ctx.strokeStyle = ok ? '#8a8a8f' : '#a98a8c';
      ctx.lineWidth = ed.width;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 26]);
      ctx.stroke();
      ctx.setLineDash([]);

      // start/finish strip and direction arrows
      const a = sm[0];
      const b = sm[1];
      const h = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(h);
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k * 9 < ed.width; k++) {
          ctx.fillStyle = (r + k) % 2 ? '#1d1d22' : '#ffffff';
          ctx.fillRect(r * 9 - 9, -ed.width / 2 + k * 9, 9, 9);
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of [0.2, 0.45, 0.7]) {
        const i = Math.floor(f * sm.length);
        const p = sm[i];
        const q = sm[(i + 1) % sm.length];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -10);
        ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    for (const o of ed.obstacles) drawCone(ctx, o.x, o.y);

    ed.ctrl.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, i === ed.hover || (ed.drag && ed.drag.idx === i) ? 12 : 9, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#e10600' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = i === 0 ? '#ffffff' : '#e10600';
      ctx.stroke();
    });

    if (ed.stroke && ed.stroke.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ed.stroke[0].x, ed.stroke[0].y);
      for (const p of ed.stroke) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#e10600';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (!ed.ctrl.length && !ed.stroke) {
      ctx.fillStyle = 'rgba(29,29,34,0.55)';
      ctx.font = '700 40px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Drag anywhere to draw a loop', 800, 490);
      ctx.font = '500 24px "Segoe UI", sans-serif';
      ctx.fillText('or pick a preset on the right', 800, 530);
    }
    ctx.restore();
  }

  function drawChart(canvas, series) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#e2dfda';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 10 + ((h - 24) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(w - 6, y);
      ctx.stroke();
    }
    const n = Math.max(...series.map((s) => s.data.length));
    if (n < 2) return;
    const max = Math.max(1, ...series.map((s) => Math.max(0, ...s.data)));
    ctx.fillStyle = '#7a7a84';
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.fillText(String(Math.round(max)), 2, 14);
    ctx.fillText('0', 14, h - 12);
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = 30 + ((w - 36) * i) / (n - 1);
        const y = h - 14 - ((h - 24) * v) / max;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  F1.render2d = {
    drawTrackLayer: drawTrackLayer,
    drawRacingLine: drawRacingLine,
    drawCar: drawCar,
    drawGhost: drawGhost,
    drawLabel: drawLabel,
    drawBadge: drawBadge,
    drawSensors: drawSensors,
    drawCone: drawCone,
    drawEditor: drawEditor,
    drawChart: drawChart,
  };
})(globalThis);
