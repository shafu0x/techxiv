import { cacheLife, cacheTag } from "next/cache";
import { getPrisma } from "@/lib/prisma";

// Cached so the header and the page share one query, and so both can be
// prerendered instead of hitting the database per request.
export async function getOrganizations() {
  "use cache";
  cacheTag("orgs");
  cacheLife("days");

  return getPrisma().organization.findMany({ orderBy: { name: "asc" } });
}
