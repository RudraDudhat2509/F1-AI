# F1 AI

Six different algorithms learn (or plan) to drive the same track, then race each other. You can race them too, and you can draw your own tracks.

Open `index.html` in a browser. There is no build step, no server and no dependencies.

## What it does

- **Train tab:** the four learning teams train side by side under identical rules (40 cars each, same time window, same fitness = distance covered). Watch generations improve live, with a generation clock and an elapsed timer.
- **Race tab:** grid start, N laps, leaderboard. Drive yourself with WASD or the arrow keys against the AI. Leaving the track freezes a car for 3 seconds, for everyone.
- **Ghost replay:** after a race, every car's best lap replays at once, color-coded by team.
- **Track editor:** draw a loop freehand, drag points to reshape it, place cones, import and export tracks as JSON. A live check refuses tracks that cross themselves, run off the map or have corners no car could take.
- **Tracks:** 10 built in. Four original tracks (one with cones) and six real circuits: Monza, Spa-Francorchamps, Interlagos, Red Bull Ring, Albert Park and Imola.
- **Leader's racing line:** the current leader's actual path, drawn live and coloured by speed (green flat out, red slow). In training it follows the leading car and shows the previous generation's leader faintly underneath, so you can watch the line improve as the cars learn. In a race it shows the leader's current and previous lap.
- **Toggles:** leader's racing line, top 3 badges, car labels, sensor rays.

## The teams

All cars share the same physics. Only the brain differs.

| Team | Algorithm | What it does |
|---|---|---|
| Vector | Evolution Strategy | Samples around a mean, moves the mean to the rank-weighted best samples |
| Helix | Genetic Algorithm | Tournament selection, uniform crossover, gaussian mutation, elitism |
| Ascent | Hill Climbing | Keeps one champion, tries mutants, moves only if one is better |
| Ember | Simulated Annealing | Tunes 4 numbers of a rule-based driver, accepts worse moves with a cooling probability |
| Atlas | A* + pure pursuit | A* over a graph of track cross-sections finds a racing line (and routes around cones), pure pursuit follows it |
| Rookie | Reactive rules | Fixed parameters, no learning (baseline) |

The three neural-net teams use the same small network: 8 inputs (7 distance sensors plus speed), 10 hidden units, 2 outputs (steering and throttle). Ember tunes a rule-based driver instead, and Atlas and Rookie do not learn.

## Results

Best lap seen during pre-training (seed 7, 40 cars per team, 200 generations on Grand Circuit and 250 on the rest). "-" means the team never completed a lap.

| Track | Vector (ES) | Helix (GA) | Ascent (hill climbing) | Ember (annealing) |
|---|---|---|---|---|
| Grand Circuit | 14.65s | 15.73s | **14.52s** | 17.30s |
| Speedway | **10.75s** | 10.77s | 10.78s | 11.45s |
| Serpent | **14.75s** | 14.95s | - | 16.80s |
| Grand Circuit + Cones | **15.22s** | 15.47s | 15.50s | 18.10s |
| Monza | **12.23s** | **12.23s** | - | 13.35s |
| Spa-Francorchamps | 19.58s | **19.18s** | 19.38s | 21.68s |
| Interlagos | 23.77s | **23.68s** | 43.43s | 26.00s |
| Red Bull Ring | **16.43s** | 16.87s | 18.25s | 18.52s |
| Albert Park | 10.20s | **10.13s** | 10.20s | 11.25s |
| Imola | **12.82s** | 13.87s | 13.33s | - |

Evolution strategy or the genetic algorithm is fastest on 9 of 10 tracks. Hill climbing gets stuck in a local optimum and never learns a lap on 3 tracks. Annealing only tunes 4 numbers, so it starts near its ceiling and plateaus. This is a single seed; multi-seed comparison is planned.

## Tests

Plain Node scripts, no framework:

`tests/load.js` is a shared helper that loads the browser code into Node. The others are the actual tests:

```
node tests/headless.js 150    # do all four learners improve under identical training?
node tests/classical.js       # do the A* and rules drivers complete laps?
node tests/leaderline.js      # is a re-simulated car path exactly the path the car drove?
node tests/presets.js         # is every preset valid, and can Atlas plan and lap it?
node tests/race.js it-1922    # full race with the pre-trained champions on one track
node tools/pretrain.js be-1925 250 7   # retrain one track and rewrite js/pretrained/be-1925.js
```

## Team

Course project by:

| Name | Roll no. |
|---|---|
| Aryan Kose | B24EE09 |
| Rudra Dudhat | B24DS506 |
| S Aparajith | B24DS507 |
| Vatsal Yadav | B24DS036 |

### Who owns what

The code is split into four parts, each between about 690 and 810 lines (pre-trained data not counted). Each person owns their files and the tests that go with them.

| Person | Part | Files | Lines |
|---|---|---|---|
| Rudra Dudhat | Learners and car core: the four learning algorithms, the neural net, car physics and sensors, training heats and races, pre-training | `js/trainers.js`, `js/nn.js`, `js/car.js`, `js/sim.js`, `js/teams.js`, `js/rng.js`, `js/pretrained/`, `tools/pretrain.js`, `tests/headless.js`, `tests/load.js` | about 690 |
| S Aparajith | Track builder and classical drivers: spline track, validation, A* racing line, pure pursuit, rule driver, leader line tracker, real circuit import | `js/track.js`, `js/drivers.js`, `js/leaderline.js`, `tools/import-circuits.js`, `tests/classical.js`, `tests/leaderline.js` | about 760 |
| Aryan Kose | App and UI: tabs, controls, HUD, leaderboard, ghost replay, styling | `js/app.js`, `index.html`, `css/style.css` | about 810 |
| Vatsal Yadav | Rendering, editor and track list: canvas drawing, the track editor, the built-in tracks, preset and race tests | `js/render2d.js`, `js/editor.js`, `js/presets.js`, `js/circuits.js`, `tests/presets.js`, `tests/race.js` | about 730 |

The git history was committed from one account, so this table is the record of ownership, not the commit log.

## Layout

- `js/track.js` track builder (spline, road mask, cones, centerline, validation)
- `js/presets.js`, `js/circuits.js` the built-in tracks (circuits are generated by `tools/import-circuits.js`)
- `js/car.js` physics, ray sensors, lap timing, ghost recording
- `js/trainers.js` the four learning algorithms
- `js/drivers.js` A* racing line, pure pursuit, rule driver, player input
- `js/sim.js` training heats and races
- `js/leaderline.js` rebuilds the leading car's path so its racing line can be drawn live
- `js/editor.js` the track editor
- `js/app.js`, `js/render2d.js`, `index.html`, `css/style.css` the UI
- `js/pretrained/` champions trained ahead of time, one file per track

## Credits

Real circuit centerlines come from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT License), projected, scaled to the map and thinned to control points. Only circuits that survive the conversion are included: at this scale a road wide enough for the cars makes some layouts overlap themselves (Suzuka's crossover, Monaco) or have corners too tight to drive.

## Roadmap

Not built yet: multi-seed comparison, analytics tab with lineage tree, click-to-inspect cars, pit strategy, 3D view.
