import type { Metadata } from "next";
import { Feed } from "@/components/feed";

export const metadata: Metadata = {
  title: "News",
};

export default function News({ searchParams }: PageProps<"/news">) {
  return <Feed searchParams={searchParams} view="news" basePath="/news" />;
}
