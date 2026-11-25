// Password protect / unlock via qpdf. AES-256 (R6) only: RC4 and AES-128 are never offered.
import { PDFDocument } from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { looksLikePdf, preflight } from '../pdf.ts';
import { baseName, PDF_MIME } from '../output.ts';
import type { OpContext, OpOutput, Services } from '../protocol.ts';
import { runQpdf, type QpdfResult } from '../qpdf.ts';

type FileArg = { name: string; bytes: ArrayBuffer };

export interface ProtectArgs {
  file: FileArg;
  /** Needed to open the file. */
  userPassword: string;
  /** Needed to change permissions; a random one is generated when empty. */
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
}

export interface UnlockArgs {
  file: FileArg;
  /** May be empty for files that only restrict permissions. */
  password: string;
}

const MAX_PASSWORD = 127; // qpdf truncates longer R6 passwords

function qpdfOf(ctx: OpContext): NonNullable<Services['qpdf']> {
  if (!ctx.services?.qpdf)
    throw new PdfToolsError('unsupported', 'Encryption is not available here.');
  return ctx.services.qpdf;
}

function run(ctx: OpContext, args: string[], input: Uint8Array): Promise<QpdfResult> {
  const { factory, locateFile } = qpdfOf(ctx);
  return runQpdf(factory, args, { 'in.pdf': input }, ['out.pdf'], locateFile);
}

/** qpdf exit codes: 0 ok, 3 ok with warnings, 2 error. */
const ok = (r: QpdfResult) => (r.code === 0 || r.code === 3) && !!r.files['out.pdf'];

function checkInput(name: string, bytes: Uint8Array): void {
  if (!looksLikePdf(bytes)) throw new PdfToolsError('damaged', `${name}: This file is not a PDF.`);
  try {
    preflight(bytes);
  } catch (err) {
    throw new PdfToolsError('damaged', `${name}: ${(err as Error).message}`);
  }
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** pdf-lib reads the trailer's /Encrypt without needing the password. */
async function isEncrypted(name: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.isEncrypted;
  } catch {
    throw new PdfToolsError('damaged', `${name}: This PDF is damaged and could not be read.`);
  }
}

export async function protect(args: ProtectArgs, ctx: OpContext): Promise<OpOutput> {
  const user = args.userPassword ?? '';
  const owner = args.ownerPassword || randomPassword();
  if (!user) throw new PdfToolsError('invalid_input', 'Enter a password.');
  if (user.length > MAX_PASSWORD || owner.length > MAX_PASSWORD) {
    throw new PdfToolsError(
      'invalid_input',
      `Passwords can be at most ${MAX_PASSWORD} characters.`,
    );
  }
  const input = new Uint8Array(args.file.bytes);
  checkInput(args.file.name, input);
  if (await isEncrypted(args.file.name, input)) {
    throw new PdfToolsError(
      'invalid_input',
      `${args.file.name}: This PDF already has a password. Remove it first.`,
    );
  }
  ctx.progress(0.3);
  const encrypt = (bytes: Uint8Array) =>
    run(
      ctx,
      [
        // Named forms, so a password that starts with "-" can never be read as an option.
        '--encrypt',
        `--user-password=${user}`,
        `--owner-password=${owner}`,
        '--bits=256',
        `--print=${args.allowPrinting ? 'full' : 'none'}`,
        `--extract=${args.allowCopying ? 'y' : 'n'}`,
        `--modify=${args.allowEditing ? 'all' : 'none'}`,
        '--',
        '/in.pdf',
        '/out.pdf',
      ],
      bytes,
    );
  let r = await encrypt(input);
  if (!ok(r)) {
    // qpdf is strict about broken xref streams; pdf-lib often recovers them. Retry once with a
    // clean copy so a slightly damaged file can still be protected.
    const repaired = await PDFDocument.load(input, { updateMetadata: false })
      .then((doc) => doc.save({ useObjectStreams: false }))
      .catch(() => undefined);
    if (repaired) r = await encrypt(repaired);
  }
  if (!ok(r))
    throw new PdfToolsError(
      'damaged',
      `${args.file.name}: This PDF is damaged or could not be encrypted.`,
    );
  ctx.progress(1);
  return {
    files: [
      {
        name: `${baseName(args.file.name)}-protected.pdf`,
        mime: PDF_MIME,
        bytes: r.files['out.pdf']!,
      },
    ],
  };
}

export async function unlock(args: UnlockArgs, ctx: OpContext): Promise<OpOutput> {
  const input = new Uint8Array(args.file.bytes);
  checkInput(args.file.name, input);
  if (!(await isEncrypted(args.file.name, input))) {
    throw new PdfToolsError(
      'invalid_input',
      `${args.file.name}: This PDF is not password-protected.`,
    );
  }
  ctx.progress(0.3);
  const r = await run(
    ctx,
    [`--password=${args.password ?? ''}`, '--decrypt', '/in.pdf', '/out.pdf'],
    input,
  );
  if (!ok(r)) {
    if (/invalid password/i.test(r.stderr)) throw new PdfToolsError('wrong_password');
    throw new PdfToolsError(
      'damaged',
      `${args.file.name}: This PDF is damaged or could not be unlocked.`,
    );
  }
  ctx.progress(1);
  return {
    files: [
      {
        name: `${baseName(args.file.name)}-unlocked.pdf`,
        mime: PDF_MIME,
        bytes: r.files['out.pdf']!,
      },
    ],
  };
}
