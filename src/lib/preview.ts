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
};

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)",
  accept: "text/html,application/xhtml+xml",
};
const TIMEOUT_MS = 8_000;
const MAX_INPUT = 2_000_000;
const MAX_OUTPUT = 400_000;
const MIN_TEXT = 500;
const HIDDEN_CLASS = /\b(?:sr-only|visually-hidden|screen-reader(?:-only)?|a11y-hidden)\b/i;

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

  return sanitizeHtml(html, {
    ...SANITIZE,
    transformTags: { a: link, img: image },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !frame.attribs.src) || HIDDEN_CLASS.test(frame.attribs.class ?? ""),
  });
}

function textLength(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

async function fromPage(url: string): Promise<Preview | null> {
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

/** Some hosts refuse non-browser clients, but their feed often carries the whole post. */
async function fromFeed(slug: string, url: string): Promise<Preview | null> {
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

    const body =
      item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] ??
      item.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1];
    if (!body) {
      return null;
    }

    const html = sanitize(unwrap(body), url).trim();
    if (textLength(html) < MIN_TEXT) {
      return null;
    }

    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return {
      title: title ? unwrap(title).replace(/\s+/g, " ").trim() || null : null,
      html: html.slice(0, MAX_OUTPUT),
    };
  }

  return null;
}

async function extract(slug: string, url: string): Promise<Preview> {
  const page = await fromPage(url).catch(() => null);
  if (page) {
    return page;
  }

  const feed = await fromFeed(slug, url).catch(() => null);
  return feed ?? { title: null, html: null };
}

export async function getPreview(id: string): Promise<Preview | null> {
  "use cache: remote";
  cacheTag("preview", `preview:${id}`);
  cacheLife("days");

  const post = await getPrisma().post.findUnique({
    where: { id },
    select: { url: true, organization: { select: { slug: true } } },
  });
  if (!post) {
    return null;
  }

  return extract(post.organization.slug, canonicalPostUrl(post.url));
}
