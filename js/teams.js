(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  // One team per algorithm. Every car uses identical physics; only the brain differs.
  // Learners train under the same budget: same population size, time window and fitness.
  const nn = (genome) => new F1.NNBrain(genome);
  const rule = (genome) => new F1.RuleBrain(genome);

  F1.TEAMS = [
    { id: 'es', name: 'Vector', algo: 'Evolution Strategy', color: '#1e41ff', learner: true, cars: 2,
      makeTrainer: (rng, size) => new F1.ESTrainer({ rng: rng, size: size }), makeBrain: nn },
    { id: 'ga', name: 'Helix', algo: 'Genetic Algorithm', color: '#e10600', learner: true, cars: 2,
      makeTrainer: (rng, size) => new F1.GATrainer({ rng: rng, size: size }), makeBrain: nn },
    { id: 'hc', name: 'Ascent', algo: 'Hill Climbing', color: '#ff8700', learner: true, cars: 2,
      makeTrainer: (rng, size) => new F1.HCTrainer({ rng: rng, size: size }), makeBrain: nn },
    { id: 'sa', name: 'Ember', algo: 'Simulated Annealing', color: '#00a19b', learner: true, cars: 2,
      makeTrainer: (rng, size) => new F1.SATrainer({ rng: rng, size: size }), makeBrain: rule },
    { id: 'astar', name: 'Atlas', algo: 'A* line + pure pursuit', color: '#c3c8ce', learner: false, cars: 1,
      makeFixedBrain: (track) => new F1.PursuitBrain(F1.getPlan(track), track) },
    { id: 'rule', name: 'Rookie', algo: 'Reactive rules (fixed)', color: '#a259d9', learner: false, cars: 1,
      makeFixedBrain: () => new F1.RuleBrain(F1.ROOKIE_PARAMS) },
  ];
  F1.PLAYER_TEAM = { id: 'you', name: 'You', algo: 'WASD', color: '#ffffff', learner: false, cars: 1 };
})(globalThis);
