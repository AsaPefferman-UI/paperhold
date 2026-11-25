import { useEffect } from 'react';
import { contentSecurityPolicy } from '../../security-headers.ts';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../router.tsx';
import { SITE } from '../site.ts';
import { PAGES, TOOLS, type ToolMeta } from '../tools.ts';
import '../landing.css';

const GROUPS: { title: string; paths: string[] }[] = [
  { title: 'Arrange', paths: ['/merge', '/split', '/organize', '/page-numbers', '/watermark'] },
  { title: 'Convert', paths: ['/compress', '/images-to-pdf', '/pdf-to-images', '/ocr'] },
  { title: 'Sign and secure', paths: ['/fill-form', '/sign', '/protect', '/unlock'] },
];

const byPath = (p: string) => TOOLS.find((t) => t.path === p) as ToolMeta;

export default function Home() {
  useEffect(() => {
    document.title = `${SITE.name}: ${PAGES[0]!.name}`;
  }, []);
  // The real policy this site is served with, so the claim on this page cannot drift from it.
  const connect = contentSecurityPolicy()
    .split('; ')
    .find((d) => d.startsWith('connect-src'));

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Your PDFs never leave this tab</h1>
          <p className="hero-lede">Merge, split, compress, sign and OCR, all on your own device.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#tools">
              Choose a tool
            </a>
            <Link className="text-link" href="/privacy">
              Check it yourself
            </Link>
          </div>
        </div>
        <figure className="hero-shot">
          <img
            src="/landing/merge-tool.png"
            width={1280}
            height={720}
            alt="The Merge tool with three PDFs listed in order, each with a numbered index tab."
            fetchPriority="high"
          />
        </figure>
      </section>

      <section id="tools" className="index" aria-labelledby="tools-title">
        <h2 id="tools-title">Every tool, in one folder</h2>
        <div className="index-groups">
          {GROUPS.map((g) => (
            <div key={g.title} className="index-group">
              <h3>{g.title}</h3>
              <ul>
                {g.paths.map(byPath).map((t, i) => (
                  <li key={t.path}>
                    <Link href={t.path} className="index-link">
                      <span className="tab" data-tone={i % 4} aria-hidden="true">
                        {t.tab.slice(0, 1)}
                      </span>
                      <span className="index-name">{t.name}</span>
                      <span className="index-desc">{t.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="proof" aria-labelledby="proof-title">
        <div>
          <h2 id="proof-title">A rule your browser enforces</h2>
          <p>
            Every page is served with this line in its Content Security Policy. It tells your
            browser to refuse any connection to another server, even if our own code tried.
          </p>
          <Link className="text-link" href="/privacy">
            How to verify it in two minutes
          </Link>
        </div>
        <pre className="policy">
          <code>{connect}</code>
        </pre>
      </section>

      <section className="facts" aria-labelledby="facts-title">
        <h2 id="facts-title">No account, no upload, no catch</h2>
        <ul className="fact-list">
          <li>
            <Icon name="lock" />
            <span>Files are processed in your browser and never sent anywhere.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>Works offline after your first visit.</span>
          </li>
          <li>
            <Icon name="download" />
            <span>
              Free and open source under AGPL-3.0.{' '}
              <a className="text-link" href={SITE.repoUrl} rel="noopener">
                Read the code
              </a>
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
