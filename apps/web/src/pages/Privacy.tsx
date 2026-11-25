import { useEffect } from 'react';
import { contentSecurityPolicy } from '../../security-headers.ts';
import { Link } from '../router.tsx';
import { SITE } from '../site.ts';
import { PAGES } from '../tools.ts';
import '../landing.css';

export default function Privacy() {
  const page = PAGES.find((p) => p.path === '/privacy')!;
  useEffect(() => {
    document.title = `${page.name} | ${SITE.name}`;
  }, [page.name]);
  const analyticsOn = SITE.analytics.provider !== 'none';
  const csp = contentSecurityPolicy(
    analyticsOn ? { provider: 'cloudflare', token: 'x'.repeat(16) } : { provider: 'none' },
  );

  return (
    <article className="doc" aria-labelledby="doc-title">
      <h1 id="doc-title">How to verify we never upload your files</h1>
      <p className="lede">
        You should not have to trust us. These checks take two minutes and need nothing but your
        browser.
      </p>

      <h2>1. Watch the network while a tool runs</h2>
      <ol>
        <li>
          Open your browser&rsquo;s developer tools and choose the <strong>Network</strong> tab:
          <kbd>F12</kbd> in Chrome, Edge and Firefox; in Safari, turn on{' '}
          <em>Show features for web developers</em> in Settings, then press <kbd>Option</kbd>{' '}
          <kbd>Command</kbd> <kbd>I</kbd>.
        </li>
        <li>
          Tick <strong>Preserve log</strong> and clear the list.
        </li>
        <li>
          Open any tool, for example <Link href="/merge">Merge PDFs</Link>, add a file and run it.
        </li>
      </ol>
      <p>
        You will see only <code>GET</code> requests to this site for its own files: scripts, styles,
        fonts, and on some tools the PDF engine, image decoders or OCR language data. None of them
        carries your file, and no request goes to any other address
        {analyticsOn ? ' except the analytics beacon described below' : ''}.
      </p>

      <h2>2. Pull the plug</h2>
      <p>
        After your first visit, switch off Wi-Fi or turn on airplane mode, then use a tool again. It
        still works, because everything runs on your device.
      </p>

      <h2>3. Read the rule your browser enforces</h2>
      <p>
        In the Network tab, select the first request (the page itself) and look at its response
        headers. The <code>content-security-policy</code> header is:
      </p>
      <pre className="policy">
        <code>{csp.split('; ').join(';\n')}</code>
      </pre>
      <p>
        <code>connect-src</code> lists the only places this page may send data to.{' '}
        <code>&apos;self&apos;</code> means this site, and the site has no endpoint that accepts
        files: it is a set of static files. Your browser blocks every other destination, even for
        code we did not write.
      </p>

      <h2>4. Our tests check it on every change</h2>
      <p>
        The automated browser tests that guard every change to this project fail if any request
        leaves this site, uses anything other than <code>GET</code>, or carries more than 1 KB, and
        if the browser reports any policy violation. The test code is public in{' '}
        <a href={`${SITE.repoUrl}/blob/main/apps/web/e2e/fixtures.ts`} rel="noopener">
          apps/web/e2e/fixtures.ts
        </a>
        .
      </p>

      <h2>5. Check that this site is that code</h2>
      <p>
        Each release publishes the SHA-256 hash of every file and a signed build provenance
        statement on the{' '}
        <a href={`${SITE.repoUrl}/releases`} rel="noopener">
          releases page
        </a>
        . Compare them with the files your browser downloaded, or run{' '}
        <code>gh attestation verify</code> on the release archive.
      </p>

      <h2>Analytics</h2>
      {analyticsOn ? (
        <p>
          This site counts page views with Cloudflare Web Analytics: no cookies, no personal data,
          and no file names or contents. That is why the policy above allows
          <code> cloudflareinsights.com</code> and nothing else.
        </p>
      ) : (
        <p>This site runs no analytics at all.</p>
      )}

      <h2>Things we cannot see</h2>
      <p>
        Your files, their names, their contents, the number of pages, your signature, your
        passwords. Saved signatures, if you choose to save one, stay in this browser until you press{' '}
        <em>Forget my signature</em>.
      </p>
      <p className="doc-contact">
        Found something that contradicts this page? Please report it privately:{' '}
        <a href={`mailto:${SITE.contact.security}`}>{SITE.contact.security}</a>.
      </p>
    </article>
  );
}
