/** In-place radix-2 complex FFT, without dependencies. */
export function fft(real, imaginary) {
  const n = real.length;
  if (n < 2 || (n & (n - 1)) || imaginary.length !== n) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -2 * Math.PI / size, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let base = 0; base < n; base += size) {
      let r = 1, im = 0;
      for (let j = 0; j < size / 2; j++) {
        const a = base + j, b = a + size / 2;
        const br = real[b] * r - imaginary[b] * im, bi = real[b] * im + imaginary[b] * r;
        real[b] = real[a] - br; imaginary[b] = imaginary[a] - bi;
        real[a] += br; imaginary[a] += bi;
        const next = r * wr - im * wi;
        im = r * wi + im * wr; r = next;
      }
    }
  }
}
