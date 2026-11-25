// Deterministic byte-level mutations for fuzzing. Small and dependency-free on purpose.

/** mulberry32: a tiny seeded PRNG, so any failing case can be reproduced from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MUTATORS = [
  'flipBits',
  'overwrite',
  'insert',
  'remove',
  'duplicate',
  'truncate',
  'number',
  'splice',
] as const;

export type Mutator = (typeof MUTATORS)[number];

/** Apply 1-3 random mutations. `other` is a second input for splicing. */
export function mutate(
  input: Uint8Array,
  random: () => number,
  other?: Uint8Array,
): { bytes: Uint8Array; applied: Mutator[] } {
  let b: Uint8Array = input.slice();
  const applied: Mutator[] = [];
  const int = (n: number) => Math.floor(random() * n);
  const rounds = 1 + int(3);
  for (let r = 0; r < rounds && b.length > 0; r++) {
    const m = MUTATORS[int(MUTATORS.length)]!;
    applied.push(m);
    const at = int(b.length);
    const len = 1 + int(Math.min(64, b.length - at));
    switch (m) {
      case 'flipBits':
        for (let i = 0; i < 1 + int(20); i++) b[int(b.length)]! ^= 1 << int(8);
        break;
      case 'overwrite':
        for (let i = 0; i < len; i++) b[at + i] = int(256);
        break;
      case 'insert': {
        const extra = Uint8Array.from({ length: len }, () => int(256));
        b = concat(b.subarray(0, at), extra, b.subarray(at));
        break;
      }
      case 'remove':
        b = concat(b.subarray(0, at), b.subarray(at + len));
        break;
      case 'duplicate':
        b = concat(b.subarray(0, at + len), b.subarray(at, at + len), b.subarray(at + len));
        break;
      case 'truncate':
        b = b.slice(0, Math.max(1, at));
        break;
      case 'number': {
        // Rewrite an ASCII number: object numbers, lengths, xref offsets, counts.
        const text = new TextDecoder('latin1').decode(b);
        const re = /\d+/g;
        const matches = [...text.matchAll(re)];
        const hit = matches[int(matches.length)];
        if (hit?.index !== undefined) {
          const choices = ['0', '-1', '999999999', '2147483648', String(int(100)), '1e9'];
          const rep = new TextEncoder().encode(choices[int(choices.length)]!);
          b = concat(b.subarray(0, hit.index), rep, b.subarray(hit.index + hit[0].length));
        }
        break;
      }
      case 'splice':
        if (other && other.length > 0) {
          const from = int(other.length);
          b = concat(b.subarray(0, at), other.subarray(from, from + 1 + int(4096)));
        }
        break;
    }
  }
  return { bytes: b, applied };
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
