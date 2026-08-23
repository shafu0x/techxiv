import { generateObject } from "ai";
import { z } from "zod";
import {
  CATEGORIES,
  CLASSIFIER_MODEL,
  CLASSIFIER_PROMPT,
  type Category,
  type Kind,
  KINDS,
} from "./taxonomy";

export type Classifiable = { slug: string; title: string };
export type Label = { category: Category; kind: Kind };

const BATCH_SIZE = 40;
const CONCURRENCY = 8;

const schema = z.object({
  labels: z
    .array(
      z.object({
        index: z.number().int(),
        category: z.enum(CATEGORIES),
        kind: z.enum(KINDS),
      }),
    )
    .describe("One entry per numbered post, in the same order"),
});

async function labelBatch(batch: Classifiable[]) {
  const list = batch.map((post, index) => `${index}. [${post.slug}] ${post.title}`).join("\n");

  const { object } = await generateObject({
    model: CLASSIFIER_MODEL,
    schema,
    system: CLASSIFIER_PROMPT,
    prompt: `Label all ${batch.length} posts. Return one entry per post using its number as index.\n\n${list}`,
  });

  const labels = new Map<number, Label>();
  for (const label of object.labels) {
    if (label.index >= 0 && label.index < batch.length) {
      labels.set(label.index, { category: label.category, kind: label.kind });
    }
  }

  return labels;
}

/**
 * Labels posts in batches. Returns a map keyed by title so callers can match
 * results back regardless of ordering. Batches that fail are left unlabeled
 * rather than throwing, so one bad batch cannot lose a whole run.
 */
export async function classifyPosts(
  posts: Classifiable[],
  onProgress?: (done: number, total: number) => void,
) {
  const batches: Classifiable[][] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    batches.push(posts.slice(i, i + BATCH_SIZE));
  }

  const results = new Map<string, Label>();
  let done = 0;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const window = batches.slice(i, i + CONCURRENCY);

    await Promise.all(
      window.map(async (batch) => {
        try {
          const labels = await labelBatch(batch);
          for (const [index, label] of labels) {
            results.set(batch[index].title, label);
          }
        } catch (error) {
          console.error("classify batch failed:", error instanceof Error ? error.message : error);
        }
        done += batch.length;
        onProgress?.(done, posts.length);
      }),
    );
  }

  return results;
}
