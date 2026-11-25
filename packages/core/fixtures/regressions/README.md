Inputs found by `pnpm fuzz` that made an operation hang. Each is a mutated copy of a synthetic
corpus file (same licence as the project). `test/fuzz-regressions.test.ts` checks that every
op now finishes quickly with a typed error.

- `xref-huge-field-width.pdf`: xref stream with `/W [1 2 999999999]` (pdf-lib spun on it).
- `png-truncated-idat.png`: PNG whose IDAT chunk claims more bytes than the file has (pdf-lib's
  PNG decoder spun on it).
