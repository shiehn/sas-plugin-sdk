/**
 * Text from a link (SDK 3.23.0): the limits and pure helpers around
 * `PluginHost.fetchUrlText`, shared by plugins (feature probe, failure text)
 * and the host (the Google Docs rewrite, the HTML-to-text reduction), so the
 * rules live in one tested place.
 */

import type { PluginHost, UrlTextFailureReason, UrlTextResult } from '../types/plugin-sdk.types';

/** Every `UrlTextFailureReason`, in the order the host's gates run. */
export const URL_TEXT_FAILURE_REASONS = [
  'capability-denied',
  'invalid-url',
  'unsupported-scheme',
  'blocked-address',
  'denied',
  'too-many-redirects',
  'timeout',
  'network',
  'http-error',
  'not-text',
  'too-large',
] as const satisfies readonly UrlTextFailureReason[];

// Compile-time: the list names every reason (a new reason fails the build here).
type MissingReason = Exclude<UrlTextFailureReason, (typeof URL_TEXT_FAILURE_REASONS)[number]>;
const everyReasonListed: MissingReason extends never ? true : never = true;
void everyReasonListed;

/** The host's caps for `fetchUrlText`. */
export const URL_TEXT_LIMITS = {
  /** Most characters of `text` returned, whatever `maxChars` asks. */
  maxChars: 200_000,
  /** Most response-body bytes read (`too-large` past it). */
  maxBytes: 2 * 1024 * 1024,
  /** Most redirects followed, each re-checked (`too-many-redirects` past it). */
  maxRedirects: 5,
  /** The whole fetch, redirects included (`timeout` past it); consent time not counted. */
  timeoutMs: 20_000,
} as const;

/** `min(maxChars, URL_TEXT_LIMITS.maxChars)`; a missing, non-finite or non-positive ask gets the cap. */
export function clampUrlTextChars(maxChars?: number): number {
  if (maxChars === undefined || !Number.isFinite(maxChars) || maxChars <= 0) return URL_TEXT_LIMITS.maxChars;
  return Math.min(Math.floor(maxChars), URL_TEXT_LIMITS.maxChars);
}

/** Whether this host can fetch links for plugins. */
export function hasUrlText(
  host: Partial<Pick<PluginHost, 'fetchUrlText'>> | null | undefined,
): host is Required<Pick<PluginHost, 'fetchUrlText'>> {
  return !!host && typeof host.fetchUrlText === 'function';
}

const GOOGLE_DOC_PATH = /^\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)(?:\/|$)/;

/**
 * A Google Docs editor or viewer link (`https://docs.google.com/document/d/<id>/edit…`,
 * also `/document/u/<n>/d/<id>/…`) as its plain-text export,
 * `https://docs.google.com/document/d/<id>/export?format=txt` (a `resourcekey`
 * parameter is kept). Null for anything else, including "published to the web"
 * links (`/document/d/e/<id>/pub`), which are ordinary HTML pages.
 */
export function googleDocsExportUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname.toLowerCase() !== 'docs.google.com') return null;
  const m = GOOGLE_DOC_PATH.exec(u.pathname);
  if (!m || m[1] === 'e') return null;
  const out = new URL(`https://docs.google.com/document/d/${m[1]}/export`);
  out.searchParams.set('format', 'txt');
  const key = u.searchParams.get('resourcekey');
  if (key) out.searchParams.set('resourcekey', key);
  return out.toString();
}

/**
 * Whether a response's `Content-Type` is text the host returns: `text/*`,
 * HTML/XHTML, JSON, XML and their `+json` / `+xml` kinds. A missing type is not text.
 */
export function isUrlTextContentType(contentType: string | null | undefined): boolean {
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!t) return false;
  return (
    t.startsWith('text/') ||
    t === 'application/xhtml+xml' ||
    t === 'application/json' ||
    t === 'application/xml' ||
    t.endsWith('+xml') ||
    t.endsWith('+json')
  );
}

// ---------------------------------------------------------------------------
// HTML → readable text
// ---------------------------------------------------------------------------

/** Dropped with their contents everywhere. */
const DROP_ALWAYS = ['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'canvas', 'head', 'title', 'select', 'button'];
/** Page chrome, dropped only when the page has no <main> or <article> to read instead. */
const DROP_CHROME = ['nav', 'header', 'footer', 'aside', 'form'];

/** Break markers (control characters never kept from the page). */
const LINE = '\u0001';
const PARA = '\u0002';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', laquo: '«', raquo: '»', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™',
  deg: '°', times: '×', divide: '÷', para: '¶', sect: '§', shy: '', zwj: '', zwnj: '',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // No NUL, no surrogates, no control characters (they would forge break markers).
      if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) return '';
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

function dropElements(html: string, tags: readonly string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ')
      // An element never closed (truncated page): drop to the end.
      .replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'i'), ' ');
  }
  return out;
}

function innerOf(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  const parts: string[] = [];
  for (let m = re.exec(html); m; m = re.exec(html)) parts.push(m[1]);
  return parts;
}

/**
 * Reduce an HTML page to the text a reader sees, for a model or a text box:
 * no markup, no scripts or styles, page chrome (nav, header, footer, aside,
 * forms) dropped unless the page marks its content with `<main>` or
 * `<article>` (then only that is read), block elements as line breaks, list
 * items as "- ", table cells tab-separated, entities decoded, blank lines
 * collapsed. `title` is the `<title>`. Pure and dependency-free: the output is
 * plain text, never HTML, so it is safe to show or to prompt with.
 */
export function htmlToReadableText(html: string): { text: string; title?: string } {
  const noComments = html.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ').replace(/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/g, ' ');

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(noComments);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : '';

  let body = dropElements(noComments, DROP_ALWAYS);
  const main = innerOf(body, 'main');
  const content = main.length > 0 ? main : innerOf(body, 'article');
  body = content.length > 0 ? content.join(PARA) : dropElements(body, DROP_CHROME);

  // Source whitespace is one space (as a browser renders it); breaks come from
  // the markup as markers, so `</li><li>` or `</tr><tr>` is one line break and
  // `</p><p>` one blank line, however many tags sit between.
  const flat = body
    .replace(/[\u0001\u0002]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, PARA)
    .replace(/<li\b[^>]*>/gi, `${LINE}- `)
    .replace(/<(td|th)\b[^>]*>/gi, '\t')
    .replace(/<\/?(h[1-6]|p|blockquote|pre|table|ul|ol|dl)\b[^>]*>/gi, PARA)
    .replace(/<\/?(div|section|article|main|header|footer|nav|aside|dt|dd|figure|figcaption|address|details|summary)\b[^>]*>/gi, LINE)
    .replace(/<tr\b[^>]*>/gi, LINE)
    .replace(/<[^>]*>/g, '');

  const text = decodeEntities(flat)
    .replace(/[ \t]*[\u0001\u0002][\s\u0001\u0002]*/g, (run) => (run.includes(PARA) ? '\n\n' : '\n'))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, (ws) => (ws.includes('\t') ? '\t' : ' ')).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return title ? { text, title } : { text };
}

// ---------------------------------------------------------------------------
// Failure text for panels
// ---------------------------------------------------------------------------

/**
 * One sentence for a panel when `fetchUrlText` returned no text ('' when it
 * did). `url` (the link the user gave) names the site where that helps.
 */
export function describeUrlTextFailure(result: UrlTextResult, url?: string): string {
  if (result.ok) return '';
  let site = 'the site';
  try {
    if (url) site = new URL(url).hostname || site;
  } catch {
    /* keep 'the site' */
  }
  switch (result.reason) {
    case 'capability-denied':
      return 'This panel is not allowed to read links.';
    case 'denied':
      return `Reading from ${site} was not allowed.`;
    case 'invalid-url':
      return 'That does not look like a web address.';
    case 'unsupported-scheme':
      return 'Only http and https links can be read.';
    case 'blocked-address':
      return `The address of ${site} is on a local or private network, so it cannot be read.`;
    case 'too-many-redirects':
      return 'The link redirected too many times.';
    case 'not-text':
      return `The link is not a text page${result.contentType ? ` (it is ${result.contentType})` : ''}.`;
    case 'too-large':
      return `The page is too large to read (over ${Math.round(URL_TEXT_LIMITS.maxBytes / (1024 * 1024))} MB).`;
    case 'http-error':
      if (result.status === 401 || result.status === 403) {
        return `Access was refused by ${site} (${result.status}): the page may need a sign-in or may not be shared publicly.`;
      }
      if (result.status === 404) return `There is no such page on ${site} (404).`;
      return `An error came back from ${site}${result.status ? ` (${result.status})` : ''}.`;
    case 'timeout':
      return `The request to ${site} timed out.`;
    case 'network':
      return `Could not reach ${site}.`;
    default:
      return `Could not read the link${result.reason ? ` (${result.reason})` : ''}.`;
  }
}
