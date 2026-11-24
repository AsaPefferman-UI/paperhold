import {
  PDFButton,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  type PDFField,
} from 'pdf-lib';
import { PdfToolsError } from '../errors.ts';
import { baseName, PDF_MIME } from '../output.ts';
import { forFile, loadPdf, savePdf } from '../pdf.ts';
import type { OpContext, OpOutput } from '../protocol.ts';

type FileArg = { name: string; bytes: ArrayBuffer };

export type FormField =
  | {
      name: string;
      type: 'text';
      value: string;
      multiline: boolean;
      maxLength?: number;
      readOnly: boolean;
    }
  | { name: string; type: 'checkbox'; value: boolean; readOnly: boolean }
  | {
      name: string;
      type: 'dropdown' | 'radio';
      value: string;
      options: string[];
      readOnly: boolean;
    }
  | { name: string; type: 'list'; value: string[]; options: string[]; readOnly: boolean }
  | {
      name: string;
      type: 'unsupported';
      kind: 'button' | 'signature' | 'other';
      readOnly: boolean;
    };

export interface InspectFormArgs {
  file: FileArg;
}

export type FieldValue = string | boolean | string[];

export interface FillFormArgs {
  file: FileArg;
  values: Record<string, FieldValue>;
  /** Bake field values into the page so they can no longer be edited. */
  flatten: boolean;
}

/** Field names come from the file: cap what we hand back so a hostile form cannot flood the UI. */
const MAX_FIELDS = 2_000;

function describe(field: PDFField): FormField {
  const name = field.getName();
  const readOnly = field.isReadOnly();
  if (field instanceof PDFTextField) {
    const maxLength = field.getMaxLength();
    return {
      name,
      type: 'text',
      value: field.getText() ?? '',
      multiline: field.isMultiline(),
      ...(maxLength === undefined ? {} : { maxLength }),
      readOnly,
    };
  }
  if (field instanceof PDFCheckBox)
    return { name, type: 'checkbox', value: field.isChecked(), readOnly };
  if (field instanceof PDFDropdown) {
    return {
      name,
      type: 'dropdown',
      value: field.getSelected()[0] ?? '',
      options: field.getOptions(),
      readOnly,
    };
  }
  if (field instanceof PDFRadioGroup) {
    return {
      name,
      type: 'radio',
      value: field.getSelected() ?? '',
      options: field.getOptions(),
      readOnly,
    };
  }
  if (field instanceof PDFOptionList) {
    return {
      name,
      type: 'list',
      value: field.getSelected(),
      options: field.getOptions(),
      readOnly,
    };
  }
  const kind =
    field instanceof PDFButton ? 'button' : field instanceof PDFSignature ? 'signature' : 'other';
  return { name, type: 'unsupported', kind, readOnly };
}

export async function inspectForm(args: InspectFormArgs, ctx: OpContext): Promise<OpOutput> {
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const fields = doc.getForm().getFields().slice(0, MAX_FIELDS).map(describe);
    ctx.progress(1);
    return { files: [], data: fields };
  });
}

export async function fillForm(args: FillFormArgs, ctx: OpContext): Promise<OpOutput> {
  if (typeof args.values !== 'object' || args.values === null)
    throw new PdfToolsError('invalid_input');
  return forFile(args.file.name, async () => {
    const doc = await loadPdf(args.file.bytes);
    const form = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const [name, value] of Object.entries(args.values)) {
      const field = form.getFields().find((f) => f.getName() === name);
      if (!field) throw new PdfToolsError('invalid_input', `There is no field called "${name}".`);
      if (field.isReadOnly()) continue;
      const bad = () =>
        new PdfToolsError('invalid_input', `"${name}" cannot be set to that value.`);
      if (field instanceof PDFTextField) {
        if (typeof value !== 'string') throw bad();
        const max = field.getMaxLength();
        if (max !== undefined && value.length > max) {
          throw new PdfToolsError('invalid_input', `"${name}" allows at most ${max} characters.`);
        }
        try {
          for (const line of value.split(/\r?\n/)) font.encodeText(line);
        } catch {
          throw new PdfToolsError(
            'invalid_input',
            `"${name}" can only contain Latin characters for now (letters, digits and common punctuation).`,
          );
        }
        field.setText(value || undefined);
      } else if (field instanceof PDFCheckBox) {
        if (typeof value !== 'boolean') throw bad();
        if (value) field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
        if (typeof value !== 'string') throw bad();
        if (value === '') field.clear();
        else if (!field.getOptions().includes(value)) throw bad();
        else field.select(value);
      } else if (field instanceof PDFOptionList) {
        if (!Array.isArray(value) || value.some((v) => !field.getOptions().includes(v)))
          throw bad();
        if (value.length === 0) field.clear();
        else field.select(value);
      }
    }
    ctx.progress(0.6);
    form.updateFieldAppearances(font);
    if (args.flatten) form.flatten();
    const bytes = await savePdf(doc);
    ctx.progress(1);
    const suffix = args.flatten ? 'flattened' : 'filled';
    return {
      files: [{ name: `${baseName(args.file.name)}-${suffix}.pdf`, mime: PDF_MIME, bytes }],
    };
  });
}
