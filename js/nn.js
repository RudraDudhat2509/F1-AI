(function (g) {
  const F1 = (g.F1 = g.F1 || {});

  // Tiny feed-forward net: tanh everywhere. Genome is a flat array of weights then biases per layer.
  F1.NN_SIZES = [8, 10, 2];

  F1.genomeSize = function (sizes) {
    let total = 0;
    for (let l = 0; l < sizes.length - 1; l++) total += sizes[l] * sizes[l + 1] + sizes[l + 1];
    return total;
  };

  class NNBrain {
    constructor(genome, sizes) {
      this.genome = genome;
      this.sizes = sizes || F1.NN_SIZES;
      this.buf = this.sizes.map((n) => new Float32Array(n));
    }

    // inputs: 8 numbers in [0,1]; returns [steer, throttle] in [-1,1]
    think(inputs) {
      const sz = this.sizes;
      const gen = this.genome;
      let prev = this.buf[0];
      for (let i = 0; i < sz[0]; i++) prev[i] = inputs[i];
      let off = 0;
      for (let l = 0; l < sz.length - 1; l++) {
        const nin = sz[l];
        const nout = sz[l + 1];
        const out = this.buf[l + 1];
        for (let o = 0; o < nout; o++) {
          let sum = gen[off + nin * nout + o];
          for (let i = 0; i < nin; i++) sum += prev[i] * gen[off + o * nin + i];
          out[o] = Math.tanh(sum);
        }
        off += nin * nout + nout;
        prev = out;
      }
      return prev;
    }
  }

  F1.NNBrain = NNBrain;
})(globalThis);
