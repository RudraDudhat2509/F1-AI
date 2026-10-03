// Loads the simulation files into globalThis.F1 for Node tests (no DOM needed).
const path = require('path');
['rng', 'track', 'circuits', 'presets', 'nn', 'car', 'trainers', 'drivers', 'teams', 'sim'].forEach((f) => require(path.join('..', 'js', f + '.js')));
module.exports = globalThis.F1;
