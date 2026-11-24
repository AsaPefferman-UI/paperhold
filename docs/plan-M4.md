# Plan: M4 Forms and sign

## Scope

Fill AcroForm fields and optionally flatten; visual signature (draw, type, or upload; placed by
drag or keyboard; optional "remember on this device" with a "forget" button); password protect
and unlock with qpdf, AES-256 only.

## Design

- `inspectForm` returns field descriptions through a new `OpOutput.data` (JSON-safe); `fillForm`
  validates every value against the field type and options before writing, regenerates
  appearances with Helvetica, and can flatten.
- `sign` takes a PNG/JPEG and placements in page fractions (top-left origin, as displayed), and
  stays upright on rotated pages (same visual-to-user-space mapping as page numbers).
- `protect` / `unlock` run qpdf in the worker. Passwords are passed with qpdf's named options
  (`--user-password=`, `--owner-password=`, `--password=`) so a password starting with `-` can
  never be read as a flag. Owner password is random when the user does not set one. Encryption
  state is read from the trailer with pdf-lib (this qpdf build's `--is-encrypted` needs the
  password). Passwords never leave the worker and are never logged.
- Saved signatures: IndexedDB, only after the user ticks "Remember"; stored as bytes (WebKit
  cannot persist Blobs); "Forget my signature" deletes it. Never sent anywhere.
- The visual-signature caveat is a permanent note under the tool title, not a dismissible banner.

## Acceptance criteria and their tests

| # | Criterion | Automated test |
| --- | --- | --- |
| 1 | Form fields listed with types, values, options; none for plain PDFs | `core/test/forms-sign-encrypt.test.ts` |
| 2 | Every field type filled; values readable by pdf-lib and pdf.js; flatten removes fields and keeps the text on the page | unit + golden `form-flattened.png`; e2e |
| 3 | Bad values, unknown fields, non-Latin text rejected with clear messages | unit |
| 4 | Signature placed where chosen, on one or every page, upright on rotated pages | unit + goldens `signature-*.png`; e2e (drawn and typed) |
| 5 | Signature tool says it is not a certified e-signature | e2e (`role="note"` text) |
| 6 | Saved signature is opt-in, survives reload, and "Forget" deletes it | e2e |
| 7 | Protect uses AES-256 (R6, AESv3) with chosen permissions; pdf.js needs the password | unit (qpdf `--show-encryption`) ; e2e |
| 8 | Unlock round-trips; wrong password and not-encrypted inputs explained | unit + e2e |
| 9 | Every new route: CSP, zero violations, zero uploads, axe | guard fixture, `security.spec.ts`, `a11y.spec.ts` |
