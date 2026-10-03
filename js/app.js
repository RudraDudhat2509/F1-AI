(function () {
  const F1 = globalThis.F1;
  const R = F1.render2d;
  const $ = (id) => document.getElementById(id);
  const ctx = $('view').getContext('2d');

  let track;
  let plan;
  let trackLayer;
  let pre; // pre-trained champions for the current track, if it is a named preset
  let currentDef;

  let mode = 'train';
  let paused = false;
  let training;
  let race = null;
  let raceOver = false;
  let replay = null;
  let frameNo = 0;
  let elapsedMs = 0; // wall-clock training time; paused time and other tabs don't count
  let lastTs = performance.now();
  let editorLoaded = false;
  let lineCache = null; // training: the leader's path tracker { id, gen, tracker }
  let prevPath = null; // the previous generation's leader line, drawn faintly underneath
  const keys = { w: false, a: false, s: false, d: false };

  const fmt = (ticks) => {
    const s = ticks / 60;
    const m = Math.floor(s / 60);
    return m ? m + ':' + (s % 60).toFixed(2).padStart(5, '0') : s.toFixed(2) + 's';
  };
  const lapText = (v) => (v === Infinity || v == null ? '-' : fmt(v));

  // ------------------------------------------------------------------ choosing a track
  function buildTrackSelect() {
    const groups = {};
    for (const p of F1.PRESET_LIST) (groups[p.group] = groups[p.group] || []).push(p);
    $('trackSel').innerHTML =
      Object.keys(groups)
        .map((g) => '<optgroup label="' + g + '">' + groups[g].map((p) => '<option value="' + p.key + '">' + p.name + '</option>').join('') + '</optgroup>')
        .join('') + '<option value="custom" hidden>Custom track</option>';
  }

  // Swap the whole app onto a new track. Returns false (and changes nothing) if the track is unusable.
  function applyTrack(def, selectKey) {
    const t = F1.buildTrack(def.ctrl, def.width, def.name, def.obstacles || []);
    if (t.validate()) return false;
    track = t;
    plan = F1.getPlan(t);
    trackLayer = R.drawTrackLayer(t);
    currentDef = def;
    pre = (F1.PRETRAINED && F1.PRETRAINED[def.name]) || null; // an edited track is renamed "Custom", so it never matches
    race = null;
    raceOver = false;
    replay = null;
    keys.w = keys.a = keys.s = keys.d = false;
    showBanner('');
    $('replayBtn').classList.add('hidden');
    $('boardTitle').textContent = 'Leaderboard';
    $('source').querySelector('option[value=pre]').disabled = !pre;
    $('source').value = pre ? 'pre' : 'live';
    $('hint').textContent = pre ? 'Leaving the track costs 3 seconds, for everyone.' : 'No pre-trained brains for this track. Train first, then race with "Live training".';
    resetTraining();
    updateBoard();
    const custom = def.name === 'Custom';
    $('trackSel').querySelector('option[value=custom]').hidden = !custom;
    $('trackSel').value = custom ? 'custom' : selectKey || (F1.PRESET_LIST.find((p) => p.name === def.name) || {}).key;
    return true;
  }

  // ------------------------------------------------------------------ training tab
  function resetTraining() {
    training = new F1.Training(track, { size: 40, seed: 7 });
    lineCache = null;
    prevPath = null;
    elapsedMs = 0;
    updateTrainHud();
  }

  function buildTeamList() {
    $('teamList').innerHTML = F1.TEAMS.map(
      (t) =>
        '<div class="team" title="' + t.algo + '"><i style="background:' + t.color + '"></i><b>' + t.name + '</b><em id="tm-' + t.id + '">-</em><small>' + t.algo + '</small></div>'
    ).join('');
  }

  function updateTrainHud() {
    const cars = training.heat.cars;
    let lead = cars[0];
    let alive = 0;
    for (const c of cars) {
      if (c.alive) alive++;
      if (c.dist > lead.dist) lead = c;
    }
    $('gen').textContent = training.gen;
    $('alive').textContent = alive + ' / ' + cars.length;
    $('bestDist').textContent = Math.round(lead.dist);
    $('bestLap').textContent = lapText(Math.min(...cars.map((c) => c.bestLap), ...training.teams.map((t) => training.history[t.id].bestLap)));
    $('genClock').textContent = (training.heat.tick * F1.DT).toFixed(1) + ' / ' + training.seconds + 's';
    const sec = Math.floor(elapsedMs / 1000);
    $('elapsed').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    $('leader').textContent = lead.meta.team.name;
    $('leader').style.color = lead.meta.team.color === '#c3c8ce' ? '#1d1d22' : lead.meta.team.color;
    for (const t of F1.TEAMS) {
      const el = $('tm-' + t.id);
      if (t.learner) {
        const h = training.history[t.id];
        el.textContent = h.best.length ? Math.round(h.best[h.best.length - 1]) + ' | ' + lapText(h.bestLap) : '-';
      } else {
        el.textContent = t.id === 'astar' ? (plan.avoidsCones ? 'plans: ' + plan.expanded + ' nodes' : 'no clean line') : 'fixed rules';
      }
    }
    // Running best: a generation's best can dip (annealing's neighbours may be worse), the record can't.
    R.drawChart(
      $('chart'),
      training.teams.map((t) => {
        let top = 0;
        return { data: training.history[t.id].best.map((v) => (top = Math.max(top, v))), color: t.color };
      })
    );
  }

  // The leader's racing line, live: follow the leading car's exact path as it drives (a new tracker
  // whenever the lead changes hands), so you watch the line improve as the generations learn. The
  // previous generation's leader stays faintly underneath to show what changed.
  function drawLeaderLine() {
    const lead = F1.leaderOf(training.heat.cars);
    if (!lead) return;
    const id = lead.meta.ind.id;
    if (!lineCache || lineCache.id !== id || lineCache.gen !== training.gen) {
      if (lineCache && lineCache.gen !== training.gen) prevPath = lineCache.tracker.path;
      lineCache = { id: id, gen: training.gen, tracker: new F1.PathTracker(track, lead.meta.team, lead.meta.ind.genome) };
    }
    lineCache.tracker.advanceTo(training.heat.tick);
    if (prevPath) R.drawTraceLine(ctx, prevPath, 0.28, 4);
    R.drawTraceLine(ctx, lineCache.tracker.path, 0.95, 5);
  }

  function drawTrain() {
    ctx.drawImage(trackLayer, 0, 0);
    if ($('tgLine').checked) drawLeaderLine();
    const cars = training.heat.cars;
    let lead = null;
    for (const c of cars) if (c.alive && (!lead || c.dist > lead.dist)) lead = c;
    // crashed cars stay where they stopped as faint team-coloured ghosts, under the live ones
    for (const c of cars) if (!c.alive) R.drawGhost(ctx, c.x, c.y, c.heading, c.meta.team.color, 0.22);
    for (const c of cars) if (c.alive && c !== lead) R.drawCar(ctx, c, c.meta.team.color, false);
    if (lead) {
      R.drawCar(ctx, lead, lead.meta.team.color, true);
      if ($('tgLabels').checked) R.drawLabel(ctx, lead.x, lead.y, lead.meta.team.name, '#1d1d22');
      if ($('tgSensors').checked) R.drawSensors(ctx, lead);
    }
  }

  function trainFrame() {
    const now = performance.now();
    if (!paused) elapsedMs += Math.min(now - lastTs, 250); // cap so a background tab doesn't add minutes
    lastTs = now;
    if (!paused) {
      const steps = Number($('speed').value);
      for (let i = 0; i < steps; i++) training.step();
    }
    if (frameNo % 6 === 0) updateTrainHud();
    setClock('GENERATION ' + training.gen, (training.heat.tick * F1.DT).toFixed(1) + 's', '/ ' + training.seconds + 's', training.heat.tick / training.heat.maxTicks);
    setLights(-1);
    drawTrain();
  }

  // ------------------------------------------------------------------ race tab
  function startRace() {
    const live = $('source').value === 'live';
    const source = live ? training.champions() : pre && pre.champions;
    if (!source) {
      $('hint').textContent = 'No pre-trained brains found. Train first, then pick "Live training".';
      return;
    }
    if (live && training.gen < 1) {
      $('hint').textContent = 'Live training has no champions yet. Open the Train tab and let it run a few generations first.';
      return;
    }
    if (document.activeElement) document.activeElement.blur();
    keys.w = keys.a = keys.s = keys.d = false;
    const driving = $('drive').checked;
    const lineup = F1.buildLineup(track, source, driving ? new F1.PlayerBrain(keys) : null);
    race = new F1.Race(track, lineup, Number($('laps').value));
    raceOver = false;
    replay = null;
    $('replayBtn').classList.add('hidden');
    $('boardTitle').textContent = 'Leaderboard';
    $('hint').textContent = driving ? 'W accelerate, S brake, A/D steer. Leaving the track costs 3 seconds.' : 'Spectating.';
    showBanner(driving ? 'WASD or arrow keys to drive' : 'Race in progress');
    updateBoard();
  }

  // The bar above the map holds the banner, start lights and clock, so nothing covers the track.
  function showBanner(text) {
    const b = $('banner');
    b.textContent = text;
    b.style.display = text ? 'inline-block' : 'none';
  }

  function setClock(label, value, max, frac) {
    $('clock').classList.remove('hidden');
    $('clockLabel').textContent = label;
    $('clockValue').textContent = value;
    $('clockMax').textContent = max;
    $('clockBar').style.visibility = frac == null ? 'hidden' : 'visible';
    $('clockBar').firstElementChild.style.width = frac == null ? '0' : Math.round(Math.min(1, frac) * 100) + '%';
  }

  function hideClock() {
    $('clock').classList.add('hidden');
  }

  // lit: 0-5 red lights, 6 = GO!, -1 = hidden
  function setLights(lit) {
    const el = $('lights');
    el.classList.toggle('hidden', lit < 0);
    el.classList.toggle('go', lit === 6);
    Array.from(el.querySelectorAll('i')).forEach((light, i) => light.classList.toggle('on', i < lit));
  }

  const dot = (t) => '<i style="background:' + t.color + '"></i>';

  function updateBoard() {
    if (!race) {
      $('board').innerHTML = '<p class="hint">Press Start race.</p>';
      return;
    }
    const st = race.standings();
    const winner = st[0];
    $('board').innerHTML = st
      .map((c, i) => {
        let info;
        if (c.finished) info = i === 0 ? fmt(c.finishTick) : '+' + ((c.finishTick - winner.finishTick) / 60).toFixed(1) + 's';
        else if (race.done) info = '+' + (race.laps - c.laps) + (race.laps - c.laps === 1 ? ' lap' : ' laps');
        else info = 'L' + Math.min(race.laps, c.laps + 1) + '/' + race.laps + (c.violations ? ' !' + c.violations : '');
        return '<div class="lb' + (c.meta.isPlayer ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span>' + dot(c.meta.team) + '<b>' + c.meta.label + '</b><em>' + info + '</em><em class="best">' + lapText(c.bestLap) + '</em></div>';
      })
      .join('');
    $('board').insertAdjacentHTML('afterbegin', '<div class="lb head"><span></span><i></i><b>Car</b><em>Race</em><em class="best">Best lap</em></div>');
  }

  function endRace() {
    raceOver = true;
    keys.w = keys.a = keys.s = keys.d = false;
    updateBoard();
    $('boardTitle').textContent = 'Final classification';
    $('replayBtn').classList.remove('hidden');
    startReplay();
    const me = race.cars.find((c) => c.meta.isPlayer);
    showBanner(me ? 'Finished P' + (race.standings().indexOf(me) + 1) + '. Best laps replaying as ghosts.' : 'Race complete. Best laps replaying as ghosts.');
  }

  function startReplay() {
    const ghosts = race.cars.filter((c) => c.bestTrace);
    if (!ghosts.length) return;
    replay = { t: 0, ghosts: ghosts, len: Math.max(...ghosts.map((c) => c.bestTrace.length / 3)) };
  }

  function drawRace() {
    ctx.drawImage(trackLayer, 0, 0);
    if (!race) return;

    if (replay) {
      const t = Math.min(replay.t, replay.len - 1);
      replay.ghosts.forEach((c, i) => {
        const tr = c.bestTrace;
        const k = Math.min(Math.floor(t), tr.length / 3 - 1) * 3;
        R.drawGhost(ctx, tr[k], tr[k + 1], tr[k + 2], c.meta.team.color);
        if ($('tgLabels').checked) R.drawLabel(ctx, tr[k], tr[k + 1] - (i % 4) * 13, c.meta.label, '#1d1d22');
      });
      return;
    }

    const order = race.standings();
    const me = race.cars.find((c) => c.meta.isPlayer);
    if ($('tgLine').checked && order[0]) {
      // the current race leader's recorded lap, with the lap before it faint underneath
      if (order[0].lastTrace) R.drawTraceLine(ctx, order[0].lastTrace, 0.28, 4);
      R.drawTraceLine(ctx, order[0].curTrace, 0.95, 5);
    }
    for (const c of race.cars) if (!c.meta.isPlayer) R.drawCar(ctx, c, c.meta.team.color, false);
    if (me) R.drawCar(ctx, me, me.meta.team.color, true);
    if ($('tgLabels').checked) order.forEach((c, i) => R.drawLabel(ctx, c.x, c.y - (i % 3) * 13, c.meta.label, '#1d1d22'));
    if ($('tgTop3').checked) order.slice(0, 3).forEach((c, i) => R.drawBadge(ctx, c.x, c.y, i + 1));
    if ($('tgSensors').checked) R.drawSensors(ctx, me || order[0]);
  }

  function updateRaceHud() {
    if (!race) {
      hideClock();
      setLights(-1);
    } else if (replay) {
      setClock('BEST-LAP REPLAY', fmt(Math.floor(Math.min(replay.t, replay.len - 1))), '', null);
      setLights(-1);
    } else {
      setClock('RACE', fmt(race.tick), '', null);
      if (race.countdown > 0) setLights(Math.min(5, Math.floor(((240 - race.countdown) / 240) * 6)));
      else setLights(race.tick < 50 ? 6 : -1);
    }
  }

  function raceFrame() {
    if (race && !raceOver) {
      const me = race.cars.find((c) => c.meta.isPlayer);
      const speed = me && !me.finished ? 1 : Number($('raceSpeed').value) * (me ? 8 : 1);
      for (let i = 0; i < speed; i++) if (!race.done) race.step();
      if (race.done) endRace();
      else if (frameNo % 6 === 0) updateBoard();
    } else if (replay) {
      replay.t += 1;
      if (replay.t > replay.len + 90) replay.t = 0;
    }
    updateRaceHud();
    drawRace();
  }

  // ------------------------------------------------------------------ track editor tab
  const TOOL_HINT = {
    path: 'Drag on the empty map to draw a loop. Then drag points to reshape it, click the road to add a point, right-click a point to delete it. The red point is the start; arrows show the direction.',
    cones: 'Click the road to place a cone, click a cone to remove it. Cones block the road: learners sense them and Atlas plans around them. Place them toward one side so cars have room to pass.',
  };

  function updateEditorUi() {
    const s = editor.summary();
    $('edStatus').textContent = s.text;
    $('edStatus').className = 'status ' + (s.ok ? 'ok' : 'bad');
    $('applyTrack').disabled = !s.ok;
    $('edNote').textContent = editor.note || '';
    $('width').value = editor.width;
    $('widthLabel').textContent = editor.width;
  }

  function setTool(tool) {
    editor.tool = tool;
    $('toolPath').classList.toggle('active', tool === 'path');
    $('toolCones').classList.toggle('active', tool === 'cones');
    $('toolHint').textContent = TOOL_HINT[tool];
  }

  const editor = F1.createEditor($('view'), updateEditorUi);

  // ------------------------------------------------------------------ wiring
  // Size the map to the space the layout gives it, keeping the 1600x1000 aspect, so no page scroll is needed.
  function fitMap() {
    const wrap = $('mapwrap');
    const scale = Math.min(wrap.clientWidth / 1600, wrap.clientHeight / 1000);
    if (!(scale > 0)) return;
    $('view').style.width = Math.floor(1600 * scale) + 'px';
    $('view').style.height = Math.floor(1000 * scale) + 'px';
  }
  new ResizeObserver(fitMap).observe($('mapwrap'));

  function frame() {
    frameNo++;
    if (mode === 'train') trainFrame();
    else if (mode === 'race') raceFrame();
    else {
      hideClock();
      setLights(-1);
      R.drawEditor(ctx, editor);
    }
    requestAnimationFrame(frame);
  }

  function setTab(tab) {
    mode = tab;
    editor.enabled = tab === 'edit';
    $('view').style.cursor = tab === 'edit' ? 'crosshair' : 'default';
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('pane-train').classList.toggle('hidden', tab !== 'train');
    $('pane-race').classList.toggle('hidden', tab !== 'race');
    $('pane-edit').classList.toggle('hidden', tab !== 'edit');
    $('showSec').classList.toggle('hidden', tab === 'edit');
    showBanner(tab === 'race' && race && !raceOver ? 'Race in progress' : '');
    if (tab === 'race' && !race) updateBoard();
    if (tab === 'edit' && !editorLoaded) {
      editorLoaded = true;
      editor.load(currentDef);
    }
    lastTs = performance.now();
  }

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('trackSel').addEventListener('change', () => {
    const p = F1.presetByKey($('trackSel').value);
    if (p) {
      applyTrack(p, p.key);
      if (editorLoaded) editor.load(p);
    }
  });
  $('speed').addEventListener('input', () => ($('speedLabel').textContent = $('speed').value + 'x'));
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume' : 'Pause';
  });
  $('reset').addEventListener('click', resetTraining);
  $('start').addEventListener('click', startRace);
  $('replayBtn').addEventListener('click', () => race && startReplay());

  $('toolPath').addEventListener('click', () => setTool('path'));
  $('toolCones').addEventListener('click', () => setTool('cones'));
  $('width').addEventListener('input', () => editor.setWidth(Number($('width').value)));
  $('loadCurrent').addEventListener('click', () => editor.load(currentDef));
  $('clearTrack').addEventListener('click', () => editor.clear());
  $('applyTrack').addEventListener('click', () => {
    const def = editor.definition();
    if (applyTrack(def)) setTab('train');
  });
  $('exportJson').addEventListener('click', () => {
    $('json').value = editor.toJSON();
    $('json').select();
    $('jsonNote').textContent = 'Copy this to save or share the track.';
  });
  $('importJson').addEventListener('click', () => {
    const err = editor.fromJSON($('json').value);
    $('jsonNote').textContent = err || 'Imported. Check the status, then "Use this track".';
  });

  const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (!k || mode !== 'race' || !race || raceOver) return;
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    keys[k] = true;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) keys[k] = false;
  });

  buildTeamList();
  buildTrackSelect();
  applyTrack(F1.presetByKey('circuit'), 'circuit');
  setTool('path');
  setTab('train');
  requestAnimationFrame(frame);

  // Test hook: lets automated checks drive the app without simulating every input.
  globalThis.F1_APP = { startRace: startRace, setTab: setTab, applyTrack: applyTrack, editor: editor, keys: keys, state: () => ({ mode: mode, race: race, raceOver: raceOver, replay: replay, track: track, pre: pre }) };
})();
