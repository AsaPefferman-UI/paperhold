import { describe, expect, it } from 'vitest';
import { isOpName, runOp } from '../src/dispatch.ts';
import { PdfToolsError, defaultMessage, toOpError } from '../src/errors.ts';
import { DEFAULT_LIMITS, checkFileSize, formatBytes } from '../src/limits.ts';
import { outputTransferables } from '../src/protocol.ts';
import { noopCtx } from './helpers.ts';

describe('dispatch', () => {
  it('knows registered ops only', () => {
    expect(isOpName('merge')).toBe(true);
    expect(isOpName('toString')).toBe(false);
    expect(isOpName('__proto__')).toBe(false);
    expect(isOpName(42)).toBe(false);
  });

  it('rejects unknown ops and malformed args with typed errors', async () => {
    // @ts-expect-error deliberately invalid op
    await expect(runOp('format-disk', {}, noopCtx)).rejects.toMatchObject({ code: 'unsupported' });
    // @ts-expect-error deliberately invalid args
    await expect(runOp('merge', null, noopCtx)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('errors', () => {
  it('serialises typed errors and hides unknown ones', () => {
    expect(toOpError(new PdfToolsError('encrypted'))).toEqual({
      code: 'encrypted',
      message: defaultMessage('encrypted'),
    });
    expect(toOpError(new Error('secret stack detail'))).toEqual({
      code: 'internal',
      message: defaultMessage('internal'),
    });
    expect(toOpError(new RangeError('Array buffer allocation failed')).code).toBe('too_large');
    expect(toOpError('a string').code).toBe('internal');
  });
});

describe('limits', () => {
  it('warns above 200 MB and refuses above the cap', () => {
    expect(checkFileSize(10)).toBe('ok');
    expect(checkFileSize(DEFAULT_LIMITS.warnBytes + 1)).toBe('warn');
    expect(() => checkFileSize(DEFAULT_LIMITS.maxBytes + 1)).toThrow(PdfToolsError);
    expect(() => checkFileSize(20, { ...DEFAULT_LIMITS, maxBytes: 10 })).toThrow(/limit is 10 B/);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.00 GB');
  });
});

describe('outputTransferables', () => {
  it('lists each output buffer for zero-copy transfer', () => {
    const a = new Uint8Array(4);
    expect(outputTransferables({ files: [{ name: 'a', mime: 'x', bytes: a }] })).toEqual([
      a.buffer,
    ]);
  });
});
