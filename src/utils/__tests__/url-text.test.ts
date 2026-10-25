import {
  URL_TEXT_FAILURE_REASONS,
  URL_TEXT_LIMITS,
  clampUrlTextChars,
  describeUrlTextFailure,
  googleDocsExportUrl,
  hasUrlText,
  htmlToReadableText,
  isUrlTextContentType,
} from '../url-text';
import type { PluginCapabilities, PluginHost, UrlTextRequest, UrlTextResult } from '../../types/plugin-sdk.types';

describe('URL_TEXT_LIMITS / clampUrlTextChars', () => {
  it('pins the host caps the docs promise', () => {
    expect(URL_TEXT_LIMITS).toEqual({ maxChars: 200_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 5, timeoutMs: 20_000 });
  });

  it('clamps to min(maxChars, 200 000) and defaults bad asks to the cap', () => {
    expect(clampUrlTextChars(12_000)).toBe(12_000);
    expect(clampUrlTextChars(1_000_000)).toBe(200_000);
    expect(clampUrlTextChars(99.9)).toBe(99);
    for (const bad of [undefined, 0, -5, NaN, Infinity]) expect(clampUrlTextChars(bad)).toBe(200_000);
  });
});

describe('hasUrlText', () => {
  it('is true only when the host has the method', () => {
    const fetchUrlText = async (): Promise<UrlTextResult> => ({ ok: true, text: '' });
    expect(hasUrlText({ fetchUrlText })).toBe(true);
    expect(hasUrlText({})).toBe(false);
    expect(hasUrlText(null)).toBe(false);
    expect(hasUrlText(undefined)).toBe(false);
  });

  it('narrows a full PluginHost so the call type-checks', async () => {
    const host = { fetchUrlText: async (req: UrlTextRequest) => ({ ok: true, text: req.url }) } as Partial<PluginHost>;
    if (!hasUrlText(host)) throw new Error('expected the probe to pass');
    await expect(host.fetchUrlText({ url: 'https://example.com', purpose: 'test' })).resolves.toEqual({ ok: true, text: 'https://example.com' });
  });

  it('is declared by the manifest capability urlText', () => {
    const caps: PluginCapabilities = { urlText: true };
    expect(caps.urlText).toBe(true);
  });
});

describe('googleDocsExportUrl', () => {
  const ID = '1AbC_dEf-123456789xyzXYZ';
  const EXPORT = `https://docs.google.com/document/d/${ID}/export?format=txt`;

  it.each([
    `https://docs.google.com/document/d/${ID}/edit`,
    `https://docs.google.com/document/d/${ID}/edit?usp=sharing`,
    `https://docs.google.com/document/d/${ID}/edit#heading=h.abc`,
    `https://docs.google.com/document/d/${ID}/view`,
    `https://docs.google.com/document/d/${ID}`,
    `https://docs.google.com/document/u/1/d/${ID}/edit`,
    `https://DOCS.google.com/document/d/${ID}/mobilebasic`,
    `http://docs.google.com/document/d/${ID}/edit`,
  ])('rewrites %s to the plain-text export', (url) => {
    expect(googleDocsExportUrl(url)).toBe(EXPORT);
  });

  it('keeps a resourcekey', () => {
    expect(googleDocsExportUrl(`https://docs.google.com/document/d/${ID}/edit?usp=sharing&resourcekey=0-abc`)).toBe(
      `${EXPORT}&resourcekey=0-abc`,
    );
  });

  it.each([
    'https://docs.google.com/document/d/e/2PACX-1vQabc/pub', // published to the web: plain HTML
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://evil.example/document/d/${ID}/edit`,
    `https://docs.google.com.evil.example/document/d/${ID}/edit`,
    `ftp://docs.google.com/document/d/${ID}/edit`,
    'not a url',
    '',
  ])('leaves %s alone', (url) => {
    expect(googleDocsExportUrl(url)).toBeNull();
  });
});

describe('isUrlTextContentType', () => {
  it.each(['text/html', 'text/plain; charset=utf-8', 'TEXT/MARKDOWN', 'application/xhtml+xml', 'application/json', 'application/xml', 'application/rss+xml', 'application/ld+json'])(
    '%s is text',
    (ct) => expect(isUrlTextContentType(ct)).toBe(true),
  );
  it.each(['application/pdf', 'image/png', 'application/octet-stream', 'audio/wav', '', null, undefined])('%s is not', (ct) =>
    expect(isUrlTextContentType(ct)).toBe(false),
  );
});

describe('htmlToReadableText', () => {
  it('returns the title and the body text, without markup, scripts or styles', () => {
    const html = `<!doctype html><html><head><title>The Tower &amp; the Tide</title>
      <style>p { color: red }</style><script>window.secret = "x";</script></head>
      <body><h1>Lore</h1><p>The tower <b>fell</b> in the year&nbsp;300.</p>
      <script type="text/javascript">alert(1)</script><noscript>enable js</noscript></body></html>`;
    const r = htmlToReadableText(html);
    expect(r.title).toBe('The Tower & the Tide');
    expect(r.text).toBe('Lore\n\nThe tower fell in the year 300.');
  });

  it('reads <main> (or <article>) and drops page chrome when it is there', () => {
    const html = `<body><nav>Home | About</nav><header><a>Site</a></header>
      <main><header><h1>Chapter 1</h1></header><p>Rain on the harbour.</p></main>
      <aside>Ads</aside><footer>© 2026</footer></body>`;
    expect(htmlToReadableText(html).text).toBe('Chapter 1\n\nRain on the harbour.');

    const articles = '<body><nav>x</nav><article><p>One</p></article><div>noise</div><article><p>Two</p></article></body>';
    expect(htmlToReadableText(articles).text).toBe('One\n\nTwo');
  });

  it('drops chrome but keeps the body when the page marks no content', () => {
    const html = '<body><nav>Menu</nav><div>The keeper</div><div>sings at dusk</div><footer>links</footer><form><input></form></body>';
    expect(htmlToReadableText(html).text).toBe('The keeper\nsings at dusk');
  });

  it('turns lists, breaks and tables into lines', () => {
    const html = '<ul><li>verse</li><li>chorus</li></ul>line one<br>line two<table><tr><th>Who</th><th>Where</th></tr><tr><td>Ana</td><td>Tower</td></tr></table>';
    expect(htmlToReadableText(html).text).toBe('- verse\n- chorus\n\nline one\nline two\n\nWho\tWhere\nAna\tTower');
  });

  it('decodes entities once, so escaped markup stays text', () => {
    const r = htmlToReadableText('<p>&lt;script&gt;alert(1)&lt;/script&gt; &#8220;hi&#8221; &#x2014; caf&eacute; &bogus;</p>');
    expect(r.text).toBe('<script>alert(1)</script> “hi” — caf&eacute; &bogus;');
  });

  it('reads source line breaks as spaces, like a browser', () => {
    expect(htmlToReadableText('<p>The tower\n      fell\r\n at dusk.</p>\n\n<p>Then rain.</p>').text).toBe('The tower fell at dusk.\n\nThen rain.');
  });

  it('drops control characters, so the page cannot forge breaks', () => {
    expect(htmlToReadableText('<p>a&#1;b\u0002c&#x85;d</p>').text).toBe('abcd');
  });

  it('survives comments, unclosed scripts and invalid numeric entities', () => {
    expect(htmlToReadableText('<p>kept</p><!-- <p>hidden</p> --><p>also &#0; &#xD800; kept</p><script>var x = 1').text).toBe(
      'kept\n\nalso kept',
    );
  });

  it('keeps a <title> outside <head> out of the text', () => {
    expect(htmlToReadableText('<title>T</title><p>hi</p>')).toEqual({ text: 'hi', title: 'T' });
  });

  it('has no title key when the page has none', () => {
    expect(htmlToReadableText('<p>plain</p>')).toEqual({ text: 'plain' });
    expect(htmlToReadableText('just text, no tags')).toEqual({ text: 'just text, no tags' });
  });

  it('reduces a 2 MB page quickly', () => {
    const para = '<div class="c"><p>The tide climbs the <a href="#">tower</a> stairs &amp; sings.</p><script>var a=1;</script></div>\n';
    const html = `<html><body>${para.repeat(Math.ceil((2 * 1024 * 1024) / para.length))}</body></html>`;
    const t0 = Date.now();
    const r = htmlToReadableText(html);
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(r.text.startsWith('The tide climbs the tower stairs & sings.')).toBe(true);
    expect(r.text).not.toContain('var a');
  });
});

describe('describeUrlTextFailure', () => {
  it('is empty for a success', () => {
    expect(describeUrlTextFailure({ ok: true, text: 'x' })).toBe('');
  });

  it('has a sentence for every reason, naming the site where it helps', () => {
    for (const reason of URL_TEXT_FAILURE_REASONS) {
      const s = describeUrlTextFailure({ ok: false, reason, status: 500 }, 'https://lore.example/page');
      expect(s).toMatch(/^[A-Z].*\.$/);
      expect(s).not.toMatch(/undefined/);
    }
    expect(describeUrlTextFailure({ ok: false, reason: 'denied' }, 'https://lore.example/a')).toBe('Reading from lore.example was not allowed.');
    expect(describeUrlTextFailure({ ok: false, reason: 'http-error', status: 403 }, 'https://docs.google.com/x')).toMatch(
      /^Access was refused by docs\.google\.com \(403\).*shared publicly\.$/,
    );
    expect(describeUrlTextFailure({ ok: false, reason: 'http-error', status: 404 })).toBe('There is no such page on the site (404).');
    expect(describeUrlTextFailure({ ok: false, reason: 'not-text', contentType: 'application/pdf' })).toBe(
      'The link is not a text page (it is application/pdf).',
    );
    expect(describeUrlTextFailure({ ok: false, reason: 'too-large' })).toBe('The page is too large to read (over 2 MB).');
  });

  it('copes with a reason from a newer host and with a bad url', () => {
    const fromNewerHost = { ok: false, reason: 'quota' } as unknown as UrlTextResult;
    expect(describeUrlTextFailure(fromNewerHost, '::nope::')).toBe('Could not read the link (quota).');
  });
});
