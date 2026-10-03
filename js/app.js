(function () {
  const F1 = globalThis.F1;
  const R = F1.render2d;
  const $ = (id) => document.getElementById(id);

  const preset = F1.PRESETS.circuit;
  const track = F1.buildTrack(preset.ctrl, preset.width, preset.name);
  const plan = F1.getPlan(track);
  const pre = F1.PRETRAINED && F1.PRETRAINED[track.name];
  const trackLayer = R.drawTrackLayer(track);
  const ctx = $('view').getContext('2d');

  let mode = 'train';
  let paused = false;
  let training;
  let race = null;
  let raceOver = false;
  let replay = null;
  let frameNo = 0;
  const keys = { w: false, a: false, s: false, d: false };

  const fmt = (ticks) => {
    const s = ticks / 60;
    const m = Math.floor(s / 60);
    return m ? m + ':' + (s % 60).toFixed(2).padStart(5, '0') : s.toFixed(2) + 's';
  };
  const lapText = (v) => (v === Infinity || v == null ? '-' : fmt(v));

  // ------------------------------------------------------------------ training tab
  function resetTraining() {
    training = new F1.Training(track, { size: 40, seed: 7 });
    updateTrainHud();
  }

  function buildTeamList() {
    $('teamList').innerHTML = F1.TEAMS.map(
      (t) =>
        '<div class="team"><i style="background:' + t.color + '"></i><b>' + t.name + '</b><em id="tm-' + t.id + '">-</em><small>' + t.algo + '</small></div>'
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
    $('leader').textContent = lead.meta.team.name;
    $('leader').style.color = lead.meta.team.color === '#c3c8ce' ? '#1d1d22' : lead.meta.team.color;
    for (const t of F1.TEAMS) {
      const el = $('tm-' + t.id);
      if (t.learner) {
        const h = training.history[t.id];
        el.textContent = h.best.length ? Math.round(h.best[h.best.length - 1]) + ' | ' + lapText(h.bestLap) : '-';
      } else {
        el.textContent = t.id === 'astar' ? 'plans: ' + plan.expanded + ' nodes' : 'fixed rules';
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

  function drawTrain() {
    ctx.drawImage(trackLayer, 0, 0);
    if ($('tgLine').checked) R.drawRacingLine(ctx, plan);
    const cars = training.heat.cars;
    let lead = null;
    for (const c of cars) if (c.alive && (!lead || c.dist > lead.dist)) lead = c;
    for (const c of cars) if (c.alive && c !== lead) R.drawCar(ctx, c, c.meta.team.color, false);
    if (lead) {
      R.drawCar(ctx, lead, lead.meta.team.color, true);
      if ($('tgLabels').checked) R.drawLabel(ctx, lead.x, lead.y, lead.meta.team.name, '#1d1d22');
      if ($('tgSensors').checked) R.drawSensors(ctx, lead);
    }
  }

  function trainFrame() {
    if (!paused) {
      const steps = Number($('speed').value);
      for (let i = 0; i < steps; i++) training.step();
    }
    if (frameNo % 6 === 0) updateTrainHud();
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
      $('hint').textContent = 'Live training has no champions yet. Let it run a few generations first.';
      return;
    }
    if (document.activeElement) document.activeElement.blur();
    keys.w = keys.a = keys.s = keys.d = false;
    const driving = $('drive').checked;
    const lineup = F1.buildLineup(track, source, driving ? new F1.PlayerBrain(keys) : null);
    race = new F1.Race(track, lineup, Number($('laps').value));
    raceOver = false;
    replay = null;
    $('resultsSec').classList.add('hidden');
    $('boardTitle').textContent = 'Leaderboard';
    $('hint').textContent = driving ? 'W accelerate, S brake, A/D steer. Leaving the track costs 3 seconds.' : 'Spectating.';
    showBanner(driving ? 'WASD or arrow keys to drive' : 'Race in progress');
    updateBoard();
  }

  function showBanner(text) {
    const b = $('banner');
    b.textContent = text;
    b.style.display = text ? 'block' : 'none';
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
        else info = 'L' + Math.min(race.laps, c.laps + 1) + '/' + race.laps + (c.violations ? ' !' + c.violations : '');
        return '<div class="lb' + (c.meta.isPlayer ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span>' + dot(c.meta.team) + '<b>' + c.meta.label + '</b><em>' + info + '</em></div>';
      })
      .join('');
  }

  function endRace() {
    raceOver = true;
    keys.w = keys.a = keys.s = keys.d = false;
    updateBoard();
    $('boardTitle').textContent = 'Final classification';
    const timed = race.cars.filter((c) => c.bestTrace).sort((a, b) => a.bestLap - b.bestLap);
    $('results').innerHTML = timed
      .map((c, i) => '<div class="lb' + (c.meta.isPlayer ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span>' + dot(c.meta.team) + '<b>' + c.meta.label + '</b><em>' + fmt(c.bestLap) + '</em></div>')
      .join('');
    $('resultsSec').classList.remove('hidden');
    startReplay();
    const me = race.cars.find((c) => c.meta.isPlayer);
    showBanner(me ? 'Finished P' + (race.standings().indexOf(me) + 1) + '. Best laps replaying as ghosts.' : 'Race complete. Best laps replaying as ghosts.');
  }

  function startReplay() {
    const ghosts = race.cars.filter((c) => c.bestTrace);
    replay = { t: 0, ghosts: ghosts, len: Math.max(...ghosts.map((c) => c.bestTrace.length / 3)) };
  }

  function drawRace() {
    ctx.drawImage(trackLayer, 0, 0);
    if ($('tgLine').checked) R.drawRacingLine(ctx, plan);
    if (!race) return;

    if (replay) {
      const t = Math.min(replay.t, replay.len - 1);
      replay.ghosts.forEach((c, i) => {
        const tr = c.bestTrace;
        const k = Math.min(Math.floor(t), tr.length / 3 - 1) * 3;
        R.drawGhost(ctx, tr[k], tr[k + 1], tr[k + 2], c.meta.team.color);
        if ($('tgLabels').checked) R.drawLabel(ctx, tr[k], tr[k + 1] - (i % 4) * 13, c.meta.label, '#1d1d22');
      });
      ctx.save();
      ctx.fillStyle = 'rgba(29,29,34,0.85)';
      ctx.fillRect(1340, 20, 240, 44);
      ctx.fillStyle = '#fff';
      ctx.font = '700 22px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Lap ' + fmt(Math.floor(t)), 1460, 51);
      ctx.restore();
      return;
    }

    const order = race.standings();
    const me = race.cars.find((c) => c.meta.isPlayer);
    for (const c of race.cars) if (!c.meta.isPlayer) R.drawCar(ctx, c, c.meta.team.color, false);
    if (me) R.drawCar(ctx, me, me.meta.team.color, true);
    if ($('tgLabels').checked) order.forEach((c, i) => R.drawLabel(ctx, c.x, c.y - (i % 3) * 13, c.meta.label, '#1d1d22'));
    if ($('tgTop3').checked) order.slice(0, 3).forEach((c, i) => R.drawBadge(ctx, c.x, c.y, i + 1));
    if ($('tgSensors').checked) R.drawSensors(ctx, me || order[0]);
    if (race.countdown > 0) R.drawLights(ctx, race.countdown, 240);
    else if (race.tick < 50) R.drawGo(ctx);
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
    drawRace();
  }

  // ------------------------------------------------------------------ wiring
  function frame() {
    frameNo++;
    if (mode === 'train') trainFrame();
    else raceFrame();
    requestAnimationFrame(frame);
  }

  function setTab(tab) {
    mode = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('pane-train').classList.toggle('hidden', tab !== 'train');
    $('pane-race').classList.toggle('hidden', tab !== 'race');
    showBanner(tab === 'race' && race && !raceOver ? 'Race in progress' : '');
    if (tab === 'race' && !race) updateBoard();
  }

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('speed').addEventListener('input', () => ($('speedLabel').textContent = $('speed').value + 'x'));
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume' : 'Pause';
  });
  $('reset').addEventListener('click', resetTraining);
  $('start').addEventListener('click', startRace);
  $('replayBtn').addEventListener('click', () => race && startReplay());

  const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (!k || mode !== 'race' || !race || raceOver) return;
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    keys[k] = true;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) keys[k] = false;
  });

  buildTeamList();
  resetTraining();
  if (!pre) $('source').value = 'live';
  setTab('train');
  requestAnimationFrame(frame);

  // Test hook: lets automated checks drive the app without simulating a real keyboard.
  globalThis.F1_APP = { startRace: startRace, setTab: setTab, keys: keys, state: () => ({ mode: mode, race: race, raceOver: raceOver, replay: replay }) };
})();
