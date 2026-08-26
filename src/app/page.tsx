import { Feed } from "@/components/feed";

export default function Home({ searchParams }: PageProps<"/">) {
  return <Feed searchParams={searchParams} basePath="/" />;
}
