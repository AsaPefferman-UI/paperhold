import { useEffect } from 'react';
import { Link } from '../router.tsx';
import { SITE } from '../site.ts';

export default function NotFound() {
  useEffect(() => {
    document.title = `Page not found | ${SITE.name}`;
  }, []);
  return (
    <div className="sheet">
      <h1>Page not found</h1>
      <p>
        There is no tool at this address. <Link href="/">See all tools</Link>.
      </p>
    </div>
  );
}
