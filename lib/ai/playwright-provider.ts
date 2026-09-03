import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { z } from "zod"

const PlaywrightGateSchema = z.literal("1")
const ProviderOptionsSchema = z.object({
  openai: z.object({ reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]) }),
})
const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
} as const

type PlaywrightStreamPart =
  Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never

export class PlaywrightProviderAccessError extends Error {
  readonly name = "PlaywrightProviderAccessError"

  constructor() {
    super("Playwright provider is disabled")
  }
}

function finish(): PlaywrightStreamPart {
  return { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE }
}

function text(id: string, value: string): readonly PlaywrightStreamPart[] {
  const providerMetadata = { openai: { itemId: id, phase: "final_answer" } } as const
  return [
    { type: "text-start", id, providerMetadata },
    { type: "text-delta", id, delta: value },
    { type: "text-end", id, providerMetadata },
  ]
}

export function createPlaywrightLanguageModel(environment: NodeJS.ProcessEnv, scenario = "") {
  if (!PlaywrightGateSchema.safeParse(environment["PLAYWRIGHT_TEST"]).success) {
    throw new PlaywrightProviderAccessError()
  }

  if (scenario.includes("TASK13_PROVIDER_ERROR")) throw new PlaywrightProviderAccessError()

  return new MockLanguageModelV4({
    provider: "playwright",
    modelId: "task13",
    doStream: async (options) => {
      if (scenario.includes("TASK13_HOLD")) {
        return {
          stream: new ReadableStream<PlaywrightStreamPart>({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] })
              for (const part of text("held", "[held]")) controller.enqueue(part)
            },
          }),
        }
      }

      const effort = ProviderOptionsSchema.parse(options.providerOptions).openai.reasoningEffort
      const sourceTitle = scenario.includes("TASK14_LONG_SOURCE")
        ? `신생아 수유와 체중 증가를 함께 살펴보는 보호자 안내 ${"LONG-SOURCE-TITLE-".repeat(12)}`
        : "TASK13_SOURCE"
      const chunks: PlaywrightStreamPart[] = [
        { type: "stream-start", warnings: [] },
        ...text("answer", `[effort:${effort}]`),
        {
          type: "source",
          sourceType: "url",
          id: "task13-safe",
          url: "https://example.com/task13",
          title: sourceTitle,
        },
        {
          type: "source",
          sourceType: "url",
          id: "task13-unsafe",
          url: "javascript:alert(1)",
          title: "TASK13_UNSAFE_SOURCE",
        },
        finish(),
      ]
      return {
        stream: simulateReadableStream({
          chunks,
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      }
    },
  })
}
