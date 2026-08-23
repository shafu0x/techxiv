import { readFile, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import { classifyPosts } from "../src/lib/classify";
import { type Category, type Kind } from "../src/lib/taxonomy";

config({ path: ".env.local" });

type PostRow = {
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
  category?: Category;
  kind?: Kind;
};

const DATA = new URL("../prisma/data/posts.json", import.meta.url);

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }

  const posts = JSON.parse(await readFile(DATA, "utf8")) as PostRow[];
  const pending = posts.filter((post) => !post.category || !post.kind);

  console.log(`${posts.length} posts, ${pending.length} need labels`);
  if (pending.length === 0) {
    return;
  }

  const labels = await classifyPosts(pending, (done, total) => {
    if (done % 400 === 0 || done === total) {
      console.log(`  ${done}/${total}`);
    }
  });

  let labeled = 0;
  for (const post of posts) {
    const label = labels.get(post.title);
    if (label && (!post.category || !post.kind)) {
      post.category = label.category;
      post.kind = label.kind;
      labeled += 1;
    }
  }

  await writeFile(DATA, `${JSON.stringify(posts, null, 2)}\n`);

  const missing = posts.filter((post) => !post.category).length;
  console.log(`labeled ${labeled}, still missing ${missing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
