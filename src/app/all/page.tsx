import { Feed } from "@/components/feed";

export default function All({ searchParams }: PageProps<"/all">) {
  return <Feed searchParams={searchParams} view="all" basePath="/all" />;
}
