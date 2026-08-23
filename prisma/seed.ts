import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

type OrgRow = {
  slug: string;
  name: string;
  blogUrl: string;
};

type PostRow = {
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeonHttp(connectionString, {}),
  });

  const orgs = JSON.parse(
    await readFile(new URL("./data/orgs.json", import.meta.url), "utf8"),
  ) as OrgRow[];
  const posts = JSON.parse(
    await readFile(new URL("./data/posts.json", import.meta.url), "utf8"),
  ) as PostRow[];

  for (const org of orgs) {
    const svg = path.join(process.cwd(), "public/orgs", `${org.slug}.svg`);
    const png = path.join(process.cwd(), "public/orgs", `${org.slug}.png`);
    const logo = existsSync(svg)
      ? `/orgs/${org.slug}.svg`
      : existsSync(png)
        ? `/orgs/${org.slug}.png`
        : null;

    if (!logo) {
      throw new Error(`Missing logo for ${org.slug}`);
    }

    await prisma.organization.upsert({
      where: { slug: org.slug },
      create: {
        slug: org.slug,
        name: org.name,
        blogUrl: org.blogUrl,
        logo,
      },
      update: {
        name: org.name,
        blogUrl: org.blogUrl,
        logo,
      },
    });
  }

  const organizations = await prisma.organization.findMany();
  const orgIds = new Map(organizations.map((org) => [org.slug, org.id]));

  for (const post of posts) {
    const organizationId = orgIds.get(post.slug);
    if (!organizationId) {
      throw new Error(`Unknown organization slug ${post.slug}`);
    }

    await prisma.post.upsert({
      where: { url: post.url },
      create: {
        title: post.title,
        url: post.url,
        publishedAt: new Date(post.publishedAt),
        organizationId,
      },
      update: {
        title: post.title,
        publishedAt: new Date(post.publishedAt),
        organizationId,
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
