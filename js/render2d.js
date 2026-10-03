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

  // Five start lights, then "GO".
  function drawLights(ctx, countdown, total) {
    const lit = Math.min(5, Math.floor(((total - countdown) / total) * 6));
    ctx.save();
    ctx.fillStyle = 'rgba(29,29,34,0.85)';
    ctx.fillRect(800 - 160, 40, 320, 70);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < lit ? '#ff1e1e' : '#3a3a40';
      ctx.beginPath();
      ctx.arc(800 - 120 + i * 60, 75, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGo(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(29,29,34,0.85)';
    ctx.fillRect(800 - 160, 40, 320, 70);
    ctx.fillStyle = '#31d158';
    ctx.font = '900 italic 44px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GO!', 800, 77);
    ctx.restore();
  }

  // Training clock on the track: generation number, time into the generation, and a progress bar.
  function drawTimer(ctx, gen, t, max) {
    const x = 22;
    const y = 22;
    ctx.save();
    ctx.scale(1.5, 1.5); // the canvas is shown scaled down, so draw this big enough to read from a distance
    ctx.fillStyle = 'rgba(29,29,34,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, 300, 74, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 15px "Segoe UI", sans-serif';
    ctx.fillText('GENERATION ' + gen, x + 18, y + 26);
    ctx.font = '800 28px "Segoe UI", sans-serif';
    ctx.fillText(t.toFixed(1) + 's', x + 18, y + 56);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 15px "Segoe UI", sans-serif';
    ctx.fillText('/ ' + max + 's', x + 108, y + 56);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 18, y + 64, 264, 4);
    const g = ctx.createLinearGradient(x + 18, 0, x + 282, 0);
    g.addColorStop(0, '#e10600');
    g.addColorStop(1, '#c4126b');
    ctx.fillStyle = g;
    ctx.fillRect(x + 18, y + 64, 264 * Math.min(1, t / max), 4);
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
    drawLights: drawLights,
    drawGo: drawGo,
    drawTimer: drawTimer,
    drawChart: drawChart,
  };
})(globalThis);
