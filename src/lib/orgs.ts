import { cache } from "react";
import { getPrisma } from "@/lib/prisma";

// Cached so the header and the page share one query per request.
export const getOrganizations = cache(() =>
  getPrisma().organization.findMany({ orderBy: { name: "asc" } }),
);
