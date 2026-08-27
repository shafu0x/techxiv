export const PAGE_SIZE = 20;
export const VIRAL_THRESHOLD = 73;

export type FeedPost = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  viralityScore: number | null;
  organization: {
    name: string;
    logo: string;
  };
};
