(function (g) {
  const F1 = (g.F1 = g.F1 || {});
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Every trainer exposes the same surface so the rest of the app doesn't care which algorithm it is:
  //   pop[]      individuals { id, genome, fitness } to evaluate this generation
  //   evolve()   call after setting .fitness on each; builds the next pop
  //   records    id -> { gen, parents, muts, kind, fitness } (lineage, for the family tree)
  //   top(k)     the k best individuals ever seen (the "champions")
  class Base {
    constructor(o) {
      this.size = o.size || 40;
      this.rng = o.rng || F1.makeRng(1);
      this.gen = 0;
      this.nextId = 1;
      this.records = {};
      this.pop = [];
      this.archive = [];
    }

    randomGenome() {
      const a = new Float32Array(F1.genomeSize(F1.NN_SIZES));
      for (let i = 0; i < a.length; i++) a[i] = this.rng.gauss() * 0.8;
      return a;
    }

    reg(genome, parents, muts, kind) {
      const ind = { id: this.nextId++, genome: genome, fitness: 0 };
      this.records[ind.id] = { id: ind.id, gen: this.gen, parents: parents, muts: muts, kind: kind, fitness: null };
      return ind;
    }

    // Sort the evaluated pop, log fitness into lineage records, update the champion archive.
    rank() {
      const sorted = this.pop.slice().sort((a, b) => b.fitness - a.fitness);
      for (const ind of sorted) this.records[ind.id].fitness = ind.fitness;
      for (const ind of sorted.slice(0, 5)) {
        if (!this.archive.some((a) => a.id === ind.id)) this.archive.push({ id: ind.id, genome: ind.genome, fitness: ind.fitness });
      }
      this.archive.sort((a, b) => b.fitness - a.fitness);
      this.archive.length = Math.min(this.archive.length, 5);
      return sorted;
    }

    top(k) {
      return this.archive.slice(0, k);
    }
  }

  // ---- Genetic algorithm: tournament selection, uniform crossover, gaussian mutation, elitism.
  class GATrainer extends Base {
    constructor(o) {
      super(o);
      this.elites = 4;
      this.immigrants = 3;
      this.mutRate = 0.12;
      this.mutSigma = 0.35;
      this.tournament = 3;
      for (let i = 0; i < this.size; i++) this.pop.push(this.reg(this.randomGenome(), null, 0, 'random'));
    }

    _pick(sorted) {
      let best = null;
      for (let k = 0; k < this.tournament; k++) {
        const c = sorted[this.rng.int(sorted.length)];
        if (!best || c.fitness > best.fitness) best = c;
      }
      return best;
    }

    evolve() {
      const sorted = this.rank();
      this.gen++;
      const next = sorted.slice(0, this.elites); // elites carry over unchanged, same id
      const glen = sorted[0].genome.length;
      while (next.length < this.size - this.immigrants) {
        const a = this._pick(sorted);
        const b = this._pick(sorted);
        const genome = new Float32Array(glen);
        let muts = 0;
        for (let i = 0; i < glen; i++) {
          genome[i] = this.rng() < 0.5 ? a.genome[i] : b.genome[i];
          if (this.rng() < this.mutRate) {
            genome[i] += this.rng.gauss() * this.mutSigma;
            muts++;
          }
        }
        next.push(this.reg(genome, [a.id, b.id], muts, 'child'));
      }
      while (next.length < this.size) next.push(this.reg(this.randomGenome(), null, 0, 'random'));
      this.pop = next;
    }
  }

  // ---- Evolution strategy: sample around a mean, move the mean to the rank-weighted top samples.
  class ESTrainer extends Base {
    constructor(o) {
      super(o);
      this.sigma = 0.35;
      this.mu = Math.max(2, Math.floor(this.size / 4));
      this.mean = this.randomGenome().map((v) => v * 0.6);
      this.eliteIds = null;
      this._sample();
    }

    _sample() {
      const glen = this.mean.length;
      const meanInd = this.reg(Float32Array.from(this.mean), this.eliteIds, 0, 'mean');
      this.pop = [meanInd];
      while (this.pop.length < this.size) {
        const genome = new Float32Array(glen);
        for (let i = 0; i < glen; i++) genome[i] = this.mean[i] + this.sigma * this.rng.gauss();
        this.pop.push(this.reg(genome, [meanInd.id], glen, 'sample'));
      }
    }

    evolve() {
      const sorted = this.rank();
      this.gen++;
      const elite = sorted.slice(0, this.mu);
      const w = elite.map((_, i) => Math.log(this.mu + 0.5) - Math.log(i + 1));
      const wsum = w.reduce((a, b) => a + b, 0);
      const mean = new Float32Array(this.mean.length);
      elite.forEach((ind, i) => {
        for (let k = 0; k < mean.length; k++) mean[k] += (w[i] / wsum) * ind.genome[k];
      });
      this.mean = mean;
      this.eliteIds = elite.map((e) => e.id);
      this.sigma = Math.max(0.08, this.sigma * 0.985);
      this._sample();
    }
  }

  // ---- Hill climbing: keep one champion, try mutants of it, move only if a mutant is better.
  class HCTrainer extends Base {
    constructor(o) {
      super(o);
      this.mutRate = 0.2;
      this.mutSigma = 0.3;
      this.current = null;
      for (let i = 0; i < this.size; i++) this.pop.push(this.reg(this.randomGenome(), null, 0, 'random'));
    }

    evolve() {
      const sorted = this.rank();
      this.gen++;
      if (!this.current || sorted[0].fitness > this.current.fitness) this.current = sorted[0];
      const cur = this.current;
      const glen = cur.genome.length;
      const next = [cur];
      while (next.length < this.size) {
        const genome = Float32Array.from(cur.genome);
        let muts = 0;
        for (let i = 0; i < glen; i++) {
          if (this.rng() < this.mutRate) {
            genome[i] += this.rng.gauss() * this.mutSigma;
            muts++;
          }
        }
        next.push(this.reg(genome, [cur.id], muts, 'mutant'));
      }
      this.pop = next;
    }
  }

  // ---- Simulated annealing over the 4 tunable numbers of the reactive rule driver.
  // Each individual is one annealing chain: it proposes a neighbour, accepts worse moves with
  // probability exp(delta / T), and T cools every generation.
  class SATrainer extends Base {
    constructor(o) {
      super(o);
      this.T0 = 600;
      this.cool = 0.93;
      this.starting = true;
      this.chains = [];
      for (let i = 0; i < this.size; i++) this.pop.push(this.reg(this.randomGenome(), null, 0, 'random'));
    }

    randomGenome() {
      return Float32Array.from([this.rng(), this.rng(), this.rng(), this.rng()]);
    }

    temperature() {
      return this.T0 * Math.pow(this.cool, this.gen);
    }

    evolve() {
      this.rank();
      const T = this.temperature();
      this.gen++;
      if (this.starting) {
        this.chains = this.pop.slice();
        this.starting = false;
      } else {
        this.pop.forEach((cand, i) => {
          const d = cand.fitness - this.chains[i].fitness;
          if (d > 0 || this.rng() < Math.exp(d / T)) this.chains[i] = cand;
        });
      }
      const step = 0.04 + 0.3 * Math.min(1, this.temperature() / this.T0);
      this.pop = this.chains.map((cur) => {
        const genome = new Float32Array(4);
        for (let k = 0; k < 4; k++) genome[k] = clamp(cur.genome[k] + this.rng.gauss() * step, 0, 1);
        return this.reg(genome, [cur.id], 4, 'neighbor');
      });
    }
  }

  F1.GATrainer = GATrainer;
  F1.ESTrainer = ESTrainer;
  F1.HCTrainer = HCTrainer;
  F1.SATrainer = SATrainer;
})(globalThis);
