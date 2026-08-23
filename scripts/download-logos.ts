import { mkdir, writeFile } from "node:fs/promises";
import orgs from "../prisma/data/orgs.json";

const WIKI: Record<string, string> = {
  openai: "OpenAI logo 2025 (symbol).svg",
  "jane-street": "Jane Street Capital Logo.svg",
};

async function saveFromUrl(url: string, slug: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    return false;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 80) {
    return false;
  }

  const type = response.headers.get("content-type") ?? "";
  const ext =
    type.includes("svg") || url.endsWith(".svg") || url.includes("simpleicons")
      ? "svg"
      : type.includes("png")
        ? "png"
        : "svg";
  await writeFile(`public/orgs/${slug}.${ext}`, buffer);
  console.log(`saved public/orgs/${slug}.${ext} (${url})`);
  return true;
}

async function main() {
  await mkdir("public/orgs", { recursive: true });

  for (const org of orgs) {
    const domain = new URL(org.blogUrl).hostname.replace(/^www\./, "");
    const wiki = WIKI[org.slug]
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(WIKI[org.slug])}`
      : null;
    const urls = [
      `https://cdn.simpleicons.org/${org.simpleIcon}`,
      wiki,
      `https://unavatar.io/${domain}`,
    ].filter((url): url is string => Boolean(url));

    let saved = false;
    for (const url of urls) {
      if (await saveFromUrl(url, org.slug)) {
        saved = true;
        break;
      }
    }

    if (!saved) {
      throw new Error(`No logo for ${org.slug}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
