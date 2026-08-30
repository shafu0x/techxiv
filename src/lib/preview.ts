import { cacheLife, cacheTag } from "next/cache";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";
import { FEEDS } from "./feeds";
import { getPrisma } from "./prisma";
import { canonicalPostUrl } from "./url";

export type Preview = {
  title: string | null;
  html: string | null;
  summary: string | null;
};

// Bumping this discards cached previews, including failures cached by earlier versions.
const VERSION = 4;

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)",
  accept: "text/html,application/xhtml+xml",
};
const TIMEOUT_MS = 8_000;
const MAX_INPUT = 2_000_000;
const MAX_OUTPUT = 400_000;
const MIN_TEXT = 500;
const ANCHOR_TEXT =
  /^(?:#|¶|§|link|copy link.*|permalink|anchor|link to (?:this )?(?:heading|section))?$/i;
const HIDDEN_SELECTOR = [
  "sr-only",
  "visually-hidden",
  "visuallyhidden",
  "screen-reader-text",
  "screen-reader-only",
  "a11y-hidden",
]
  .map((name) => `[class~="${name}"]`)
  .join(", ");

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "sup",
    "sub",
    "small",
    "mark",
    "kbd",
    "a",
    "img",
    "figure",
    "figcaption",
    "picture",
    "source",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "dl",
    "dt",
    "dd",
    "span",
    "div",
    "section",
    "article",
    "aside",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "width", "height"],
    source: ["srcset", "type"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

function resolve(raw: string | undefined, base: string) {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// Heading permalinks ("#", "Copy link to heading") are site chrome, not article text.
function isHeadingAnchor(href: string | undefined, text: string, base: string) {
  if (!href || !href.includes("#")) {
    return false;
  }
  return href.split("#")[0] === base.split("#")[0] && ANCHOR_TEXT.test(text.trim());
}

// Visually hidden helpers ("(opens in a new window)") read as noise once the styling is gone.
function stripHidden(html: string) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const node of document.querySelectorAll(HIDDEN_SELECTOR)) {
    node.remove();
  }
  const body = document.body?.innerHTML;
  return body ? body : html;
}

function sanitize(html: string, base: string) {
  const link: sanitizeHtml.Transformer = (tagName, attribs) => {
    const href = resolve(attribs.href, base);
    const next: Record<string, string> = href
      ? { href, target: "_blank", rel: "noopener noreferrer" }
      : {};
    return { tagName, attribs: next };
  };
  const image: sanitizeHtml.Transformer = (tagName, attribs) => {
    const src = resolve(attribs.src, base);
    const next: Record<string, string> = src
      ? { src, alt: attribs.alt ?? "", loading: "lazy", decoding: "async" }
      : {};
    return { tagName, attribs: next };
  };

  return sanitizeHtml(stripHidden(html), {
    ...SANITIZE,
    transformTags: { a: link, img: image },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !frame.attribs.src) ||
      (frame.tag === "a" && isHeadingAnchor(frame.attribs.href, frame.text, base)),
  });
}

function textLength(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

async function fromPage(url: string): Promise<Omit<Preview, "summary"> | null> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    return null;
  }

  const base = response.url || url;
  const raw = (await response.text()).slice(0, MAX_INPUT);
  const { document } = parseHTML(raw);

  // Readability resolves relative links against the document's base; linkedom has none.
  const head = document.querySelector("head") ?? document.documentElement;
  const baseTag = document.createElement("base");
  baseTag.setAttribute("href", base);
  head.prepend(baseTag);

  const article = new Readability(document as unknown as Document, {
    charThreshold: 200,
  }).parse();
  if (!article?.content) {
    return null;
  }

  const html = sanitize(article.content, base).trim();
  if (textLength(html) < MIN_TEXT) {
    return null;
  }

  return { title: article.title || null, html: html.slice(0, MAX_OUTPUT) };
}

function unwrap(value: string) {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) {
    return cdata[1];
  }
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

type FeedItem = {
  title: string | null;
  body: string | null;
  description: string | null;
};

/** Some hosts refuse non-browser clients, but their feed carries the whole post or at least a blurb. */
async function fromFeed(slug: string, url: string): Promise<FeedItem | null> {
  const feed = FEEDS[slug];
  if (!feed) {
    return null;
  }

  const response = await fetch(feed, {
    cache: "no-store",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    return null;
  }

  const xml = (await response.text()).slice(0, MAX_INPUT);
  for (const item of xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? []) {
    const link = unwrap(
      item.match(/<link[^>]*href="([^"]+)"/i)?.[1] ??
        item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
        "",
    ).trim();
    if (canonicalPostUrl(link) !== url) {
      continue;
    }

    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const body =
      item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] ??
      item.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1];
    const description = item.match(
      /<(?:description|summary)[^>]*>([\s\S]*?)<\/(?:description|summary)>/i,
    )?.[1];

    const html = body ? sanitize(unwrap(body), url).trim() : "";
    const blurb = description
      ? sanitizeHtml(unwrap(description), { allowedTags: [], allowedAttributes: {} })
          .replace(/\s+/g, " ")
          .trim()
      : "";

    return {
      title: title ? unwrap(title).replace(/\s+/g, " ").trim() || null : null,
      body: textLength(html) >= MIN_TEXT ? html.slice(0, MAX_OUTPUT) : null,
      description: blurb || null,
    };
  }

  return null;
}

async function extract(slug: string, url: string): Promise<Preview> {
  const page = await fromPage(url).catch(() => null);
  if (page) {
    return { ...page, summary: null };
  }

  const item = await fromFeed(slug, url).catch(() => null);
  return {
    title: item?.title ?? null,
    html: item?.body ?? null,
    summary: item?.body ? null : (item?.description ?? null),
  };
}

async function cachedPreview(id: string, _version: number): Promise<Preview | null> {
  "use cache: remote";
  cacheTag("preview", `preview:${id}`);

  const post = await getPrisma().post.findUnique({
    where: { id },
    select: { url: true, organization: { select: { slug: true } } },
  });
  if (!post) {
    cacheLife("hours");
    return null;
  }

  const preview = await extract(post.organization.slug, canonicalPostUrl(post.url));
  // Hosts block or rate-limit unpredictably, so a miss gets retried soon rather than pinned for days.
  if (preview.html || preview.summary) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }
  return preview;
}

export function getPreview(id: string) {
  return cachedPreview(id, VERSION);
}
