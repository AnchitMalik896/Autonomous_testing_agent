/**
 * The "hands" (ultra_updated.md §5): a seeded PRNG that regenerates the exact same
 * variant tables from the manifest's frozen seed on every run, every machine.
 * mulberry32 — tiny, deterministic, good enough for input variation (not crypto).
 */
export class SeededPrng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  string(len: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet[this.int(0, alphabet.length - 1)];
    return out;
  }
}

/**
 * Freeze target for spec-author: variant tables are generated once per run from the
 * frozen seed and are byte-identical across runs (FR-T12).
 */
export function variantTable<T>(seed: number, count: number, gen: (r: SeededPrng, i: number) => T): T[] {
  const r = new SeededPrng(seed);
  return Array.from({ length: count }, (_, i) => gen(r, i));
}
