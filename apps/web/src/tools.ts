// Tool metadata. Plain data so the build can also read it (per-route HTML titles, sitemap).
export interface ToolMeta {
  path: `/${string}`;
  name: string;
  /** One sentence, used on the page and as the meta description. */
  description: string;
  /** What the tool accepts, for the file picker. */
  accept: string;
}

export const TOOLS: readonly ToolMeta[] = [
  {
    path: '/merge',
    name: 'Merge PDFs',
    description: 'Combine several PDFs into one file, in the order you choose.',
    accept: 'application/pdf,.pdf',
  },
];

export const SITE_NAME = 'pdf-tools';
export const SITE_TAGLINE = 'Free PDF tools that never upload your files.';
