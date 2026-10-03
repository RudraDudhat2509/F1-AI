# F1 AI

Six different algorithms learn (or plan) to drive the same track, then race each other. You can race them too.

Open `index.html` in a browser. There is no build step, no server and no dependencies.

## What it does

- **Train tab:** the four learning teams train side by side under identical rules (40 cars each, same time window, same fitness = distance covered). Watch generations improve live.
- **Race tab:** grid start, N laps, leaderboard. Drive yourself with WASD or the arrow keys against the AI. Leaving the track freezes a car for 3 seconds, for everyone.
- **Ghost replay:** after a race, every car's best lap replays at once, color-coded by team.
- **Toggles:** A* racing line (coloured by planned speed), top 3 badges, car labels, sensor rays.

## The teams

All cars share the same physics. Only the brain differs.

| Team | Algorithm | What it does |
|---|---|---|
| Vector | Evolution Strategy | Samples around a mean, moves the mean to the rank-weighted best samples |
| Helix | Genetic Algorithm | Tournament selection, uniform crossover, gaussian mutation, elitism |
| Ascent | Hill Climbing | Keeps one champion, tries mutants, moves only if one is better |
| Ember | Simulated Annealing | Tunes 4 numbers of a rule-based driver, accepts worse moves with a cooling probability |
| Atlas | A* + pure pursuit | A* over a graph of track cross-sections finds a racing line, pure pursuit follows it |
| Rookie | Reactive rules | Fixed parameters, no learning (baseline) |

The three neural-net teams use the same small network (7 distance sensors plus speed in, steering and throttle out).

## Results

Seed 7, 200 generations, best lap on the preset circuit:

| Team | Best lap |
|---|---|
| Ascent (hill climbing) | 14.52s |
| Vector (evolution strategy) | 14.65s |
| Helix (genetic algorithm) | 15.73s |
| Ember (simulated annealing) | 17.30s |
| Rookie (fixed rules) | 20.37s |
| Atlas (A* + pure pursuit) | 20.67s |

This is a single seed. Multi-seed comparison is planned.

## Tests

Plain Node scripts, no framework:

```
node tests/headless.js 150   # do all four learners improve under identical training?
node tests/classical.js      # do the A* and rules drivers complete laps?
node tests/race.js           # does a full race with the pre-trained champions finish?
node tools/pretrain.js 200 7 # retrain and rewrite js/pretrained.js
```

## Layout

- `js/track.js` track builder (spline, road mask, centerline)
- `js/car.js` physics, ray sensors, lap timing, ghost recording
- `js/trainers.js` the four learning algorithms
- `js/drivers.js` A* racing line, pure pursuit, rule driver, player input
- `js/sim.js` training heats and races
- `js/app.js`, `js/render2d.js`, `index.html`, `css/style.css` the UI

## Roadmap

Track editor and obstacles, analytics tab with lineage tree, click-to-inspect cars, pit strategy, 3D view.
