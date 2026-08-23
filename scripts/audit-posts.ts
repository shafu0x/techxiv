import { config } from "dotenv";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, {}),
  });

  const removed = await prisma.post.deleteMany({
    where: { url: "https://www.datadoghq.com/product/kubernetes-autoscaling/" },
  });

  console.log("removed", removed.count, "total", await prisma.post.count());

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
