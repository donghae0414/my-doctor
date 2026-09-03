import { ChatShellFixture } from "@/tests/e2e/chat-shell-fixture"

type ChatShellPageProps = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>
}

// biome-ignore lint/style/noDefaultExport: Next.js route fixtures require a default export.
export default async function ChatShellPage({ searchParams }: ChatShellPageProps) {
  const parameters = await searchParams
  return <ChatShellFixture theme={parameters["theme"] === "dark" ? "dark" : "light"} />
}
