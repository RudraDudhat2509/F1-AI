(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  // Every selectable track. `name` doubles as the key for pre-trained champions.
  const list = [];
  const add = (key, group, p) => list.push(Object.assign({ key: key, group: group, obstacles: [] }, p));

  add('circuit', 'Original tracks', F1.PRESETS.circuit);
  add('speedway', 'Original tracks', F1.PRESETS.speedway);
  add('serpent', 'Original tracks', F1.PRESETS.serpent);
  add('circuit-cones', 'Original tracks', {
    name: 'Grand Circuit + Cones',
    width: F1.PRESETS.circuit.width,
    ctrl: F1.PRESETS.circuit.ctrl,
    obstacles: [
      { x: 1124, y: 226 }, { x: 1316, y: 561 }, { x: 1133, y: 789 },
      { x: 612, y: 866 }, { x: 457, y: 534 }, { x: 261, y: 204 },
    ],
  });
  for (const id of ['it-1922', 'be-1925', 'br-1940', 'at-1969', 'au-1953', 'it-1953']) {
    if (F1.CIRCUITS && F1.CIRCUITS[id]) add(id, 'Real circuits', F1.CIRCUITS[id]);
  }

  F1.PRESET_LIST = list;
  F1.presetByKey = (key) => list.find((p) => p.key === key);
})(globalThis);
