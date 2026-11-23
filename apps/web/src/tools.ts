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
  {
    path: '/split',
    name: 'Split PDF',
    description: 'Extract pages or split a PDF into several files by ranges or every few pages.',
    accept: 'application/pdf,.pdf',
  },
  {
    path: '/organize',
    name: 'Organize pages',
    description: 'Reorder, rotate and delete pages, with a thumbnail of every page.',
    accept: 'application/pdf,.pdf',
  },
  {
    path: '/page-numbers',
    name: 'Page numbers',
    description: 'Add page numbers in the corner or centre you choose.',
    accept: 'application/pdf,.pdf',
  },
  {
    path: '/watermark',
    name: 'Watermark',
    description: 'Stamp text such as DRAFT or CONFIDENTIAL across your pages.',
    accept: 'application/pdf,.pdf',
  },
  {
    path: '/compress',
    name: 'Compress PDF',
    description: 'Make a PDF smaller by re-encoding its images, with three quality levels.',
    accept: 'application/pdf,.pdf',
  },
  {
    path: '/images-to-pdf',
    name: 'Images to PDF',
    description: 'Turn JPG, PNG, HEIC (iPhone) and other images into one PDF.',
    accept: 'image/*,.heic,.heif,.avif',
  },
  {
    path: '/pdf-to-images',
    name: 'PDF to images',
    description: 'Save each page of a PDF as a PNG or JPG image.',
    accept: 'application/pdf,.pdf',
  },
];

export const SITE_NAME = 'pdf-tools';
export const SITE_TAGLINE = 'Free PDF tools that never upload your files.';
