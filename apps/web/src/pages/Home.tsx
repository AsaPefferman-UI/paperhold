import { useEffect } from 'react';
import { Link } from '../router.tsx';
import { SITE_NAME, SITE_TAGLINE, TOOLS } from '../tools.ts';

export default function Home() {
  useEffect(() => {
    document.title = `${SITE_NAME}: ${SITE_TAGLINE}`;
  }, []);
  return (
    <div className="home">
      <h1>PDF tools that never upload your files</h1>
      <p className="lede">
        Everything runs in your browser. Nothing leaves your device except the files you download.
      </p>
      <ul className="tool-index">
        {TOOLS.map((t) => (
          <li key={t.path}>
            <Link href={t.path}>{t.name}</Link>
            <span>{t.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
