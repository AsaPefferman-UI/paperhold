/** Minimal typing for the Emscripten qpdf build; the package's own d.ts omits what we use. */
export interface QpdfModuleOptions {
  noInitialRun: true;
  locateFile?: (path: string) => string;
}

export interface QpdfInstance {
  callMain(args: string[]): number;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
}

export type QpdfFactory = (opts: QpdfModuleOptions) => Promise<QpdfInstance>;

export interface QpdfResult {
  code: number;
  stdout: string;
  stderr: string;
  files: Record<string, Uint8Array>;
}

/**
 * Run qpdf once in a fresh instance (qpdf's global state is not reusable across callMain).
 * `inputs` are written to the virtual FS root; `outputs` are read back afterwards.
 */
export async function runQpdf(
  factory: QpdfFactory,
  args: string[],
  inputs: Record<string, Uint8Array> = {},
  outputs: string[] = [],
  locateFile?: (path: string) => string,
): Promise<QpdfResult> {
  const out: string[] = [];
  const err: string[] = [];
  // This build binds console.log/error at instantiation and ignores `print`, so swap them in briefly.
  const { log, error } = console;
  // eslint-disable-next-line no-console -- swapping, not logging
  console.log = (s: unknown) => out.push(String(s));
  console.error = (s: unknown) => err.push(String(s));
  let mod: QpdfInstance;
  try {
    mod = await factory({ noInitialRun: true, ...(locateFile ? { locateFile } : {}) });
  } finally {
    // eslint-disable-next-line no-console -- restoring the original
    console.log = log;
    console.error = error;
  }
  for (const [name, bytes] of Object.entries(inputs)) mod.FS.writeFile(`/${name}`, bytes);
  let code: number;
  try {
    code = mod.callMain(args);
  } catch (e) {
    const status = (e as { status?: unknown }).status;
    code = typeof status === 'number' ? status : 99;
  }
  const files: Record<string, Uint8Array> = {};
  for (const name of outputs) {
    try {
      files[name] = mod.FS.readFile(`/${name}`);
    } catch {
      // A missing output is reported through the exit code.
    }
  }
  return { code, stdout: out.join('\n'), stderr: err.join('\n'), files };
}
