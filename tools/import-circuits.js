// Converts real circuit centerlines (GeoJSON, github.com/bacinger/f1-circuits, MIT) into track presets.
// Usage: node tools/import-circuits.js <f1-circuits.geojson> [id,id,...] [--report]
//   --report   only print which circuits survive conversion; write nothing
// With ids it writes js/circuits.js.
const fs = require('fs');
const path = require('path');
const F1 = require('../tests/load.js');

const file = process.argv[2];
const ids = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '').split(',').filter(Boolean);
const reportOnly = process.argv.includes('--report');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const SHORT = {
  'it-1922': 'Monza',
  'be-1925': 'Spa-Francorchamps',
  'br-1940': 'Interlagos',
  'at-1969': 'Red Bull Ring',
  'au-1953': 'Albert Park',
  'it-1953': 'Imola',
};

const W = 1600;
const H = 1000;
const MIN_WIDTH = 56;
const MAX_WIDTH = 92;

// lon/lat -> metres (equirectangular, fine at circuit scale), north up.
function project(coords) {
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  return coords.map((c) => ({ x: (c[0] - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111320, y: -(c[1] - lat0) * 110540 }));
}

function rotate(pts, a) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return pts.map((p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }));
}

function bbox(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Evenly spaced points along a closed polyline.
function resampleClosed(pts, count) {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
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

// Rotate the list so the lap starts at the end of the straightest ~300px stretch (room for the grid behind it).
function startOnStraight(pts) {
  const n = pts.length;
  const spacing = resampleClosed(pts, n).total / n;
  const win = Math.max(3, Math.round(300 / spacing));
  const turn = pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  });
  let best = 0;
  let bestSum = Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < win; k++) s += turn[(i - k + n) % n];
    if (s < bestSum) {
      bestSum = s;
      best = i;
    }
  }
  return pts.slice(best).concat(pts.slice(0, best));
}

function convert(feature) {
  const coords = feature.geometry.coordinates.slice();
  const f = coords[0];
  const l = coords[coords.length - 1];
  if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) coords.pop();
  const metres = project(coords);
  // try both orientations, keep the one that lets the track be drawn larger
  const orient = [0, Math.PI / 2].map((a) => {
    const r = rotate(metres, a);
    const b = bbox(r);
    return { r: r, b: b, k: Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0)) };
  });
  const o = orient[0].k >= orient[1].k ? orient[0] : orient[1];
  for (let width = MAX_WIDTH; width >= MIN_WIDTH; width -= 4) {
    const pad = width + 14;
    const k = Math.min((W - 2 * pad) / (o.b.x1 - o.b.x0), (H - 2 * pad) / (o.b.y1 - o.b.y0));
    const world = o.r.map((p) => ({ x: pad + (p.x - o.b.x0) * k + ((W - 2 * pad) - (o.b.x1 - o.b.x0) * k) / 2, y: pad + (p.y - o.b.y0) * k + ((H - 2 * pad) - (o.b.y1 - o.b.y0) * k) / 2 }));
    const total = resampleClosed(world, world.length).total;
    const count = Math.max(24, Math.min(80, Math.round(total / 110)));
    const ctrl = startOnStraight(resampleClosed(world, count).pts).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    const track = F1.buildTrack(ctrl, width, feature.properties.Name);
    const reason = track.validate();
    if (!reason) return { ok: true, width: width, ctrl: ctrl, length: track.length, metresPerPx: 1 / k, rotated: o === orient[1] };
    if (width === MIN_WIDTH) return { ok: false, reason: reason, width: width };
  }
}

if (reportOnly || !ids.length) {
  for (const f of data.features) {
    const r = convert(f);
    console.log((f.properties.id + '          ').slice(0, 10), (f.properties.Name + '                                        ').slice(0, 42), r.ok ? `OK  width ${r.width}  ${r.length.toFixed(0)}px  ${r.metresPerPx.toFixed(1)} m/px` : `no  (${r.reason})`);
  }
  process.exit(0);
}

const out = {};
for (const id of ids) {
  const f = data.features.find((x) => x.properties.id === id);
  if (!f) throw new Error('unknown circuit id ' + id);
  const r = convert(f);
  if (!r.ok) throw new Error(id + ' cannot be converted: ' + r.reason);
  out[id] = { name: SHORT[id] || f.properties.Name, fullName: f.properties.Name, location: f.properties.Location, width: r.width, ctrl: r.ctrl, realLengthM: f.properties.length };
  console.log(id, f.properties.Name, 'width', r.width, 'points', r.ctrl.length);
}
const body =
  '// Circuit centerlines from github.com/bacinger/f1-circuits (MIT License, Copyright (c) 2016 Tomislav Bacinger),\n' +
  '// projected, scaled to the map and thinned to control points by tools/import-circuits.js.\n' +
  'globalThis.F1 = globalThis.F1 || {};\nglobalThis.F1.CIRCUITS = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'circuits.js'), body);
console.log('wrote js/circuits.js', (body.length / 1024).toFixed(1) + ' KB');
