# Security policy

Paperhold processes every file in your browser. Its core promise is that files never leave your
device. Anything that could break that promise is a vulnerability we want to hear about.

## Reporting a vulnerability

Report privately through **GitHub Security Advisories** ("Report a vulnerability" on the
repository's Security tab), or by email to the security contact listed on the site's
`/privacy` page (set in `apps/web/site.config.ts`). Please do not open a public issue.

Include what you found, how to reproduce it (a synthetic PDF is ideal; never send real private
documents), and the impact you believe it has.

Response targets:

- Acknowledgement within 3 working days.
- An initial assessment within 7 days.
- A fix or mitigation for high and critical issues within 30 days, with credit if you want it.

## Supported versions

Only the latest release (the deployed site and the `main` branch) is supported. Self-hosters
should track the latest tag.

## In scope

- Any way for a page, dependency, or crafted PDF to send file contents or file names off the
  device (CSP bypass, request smuggling through allowed origins, service worker abuse).
- Script execution from a crafted PDF, file name, or metadata (pdf.js, pdf-lib, qpdf, tesseract).
- Weak protection from the Protect tool (it must only ever produce AES-256).
- Supply-chain issues in our build or release process.

## Out of scope

- A malicious PDF crashing or slowing its own tab (we treat it as a robustness bug; please file
  a normal issue with a synthetic sample).
- Findings that require a compromised browser or operating system.

## How to verify our privacy claim yourself

The response headers include a strict Content Security Policy whose `connect-src` is `'self'`,
so the page cannot open connections to any other host. Open DevTools, go to the Network tab,
run any tool, and confirm that no request carries your file. Our end-to-end tests fail the
build if any request leaves the origin or carries a body larger than 1 KB.
