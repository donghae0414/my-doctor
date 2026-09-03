import { MockLanguageModelV4, simulateReadableStream } from "ai/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  openai: vi.fn(),
  webSearch: vi.fn(),
}))

vi.mock("@/lib/auth/require-session", () => ({ requireSession: mocks.requireSession }))
vi.mock("@ai-sdk/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-sdk/openai")>()
  mocks.webSearch.mockImplementation(actual.openai.tools.webSearch)
  return {
    ...actual,
    openai: Object.assign(mocks.openai, {
      tools: { ...actual.openai.tools, webSearch: mocks.webSearch },
    }),
  }
})

import { POST } from "./route"

const USAGE = {
  inputTokens: { total: 4, noCache: 4, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 4, text: 3, reasoning: 1 },
} as const

function requestWithBody(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function validBody(parts: readonly unknown[] = [{ type: "text", text: "질문" }]): unknown {
  return { messages: [{ id: "user-1", role: "user", parts }] }
}

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>
type MockStreamChunk =
  MockStreamResult["stream"] extends ReadableStream<infer Chunk> ? Chunk : never

function modelWithChunks(chunks: MockStreamChunk[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }),
    },
  })
}

async function streamBody(
  model: MockLanguageModelV4,
  body: unknown = validBody(),
): Promise<string> {
  mocks.openai.mockReturnValue(model)
  const response = await POST(requestWithBody(body))
  expect(response.status).toBe(200)
  return response.text()
}

function parseUiChunks(body: string): readonly unknown[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line): unknown => JSON.parse(line.slice("data: ".length)))
}

beforeEach(() => {
  mocks.requireSession.mockReset()
  mocks.requireSession.mockResolvedValue({ authorized: true })
  mocks.openai.mockReset()
  mocks.webSearch.mockClear()
})

describe("POST /api/chat boundary", () => {
  it("returns 401 before reading malformed JSON or invoking OpenAI", async () => {
    // Given: an unauthorized request whose body cannot be parsed.
    mocks.requireSession.mockResolvedValue({ authorized: false })
    const request = new Request("http://localhost/api/chat", { method: "POST", body: "{" })

    // When: the route handles the request.
    const response = await POST(request)

    // Then: authorization wins and no provider seam is touched.
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "인증이 필요합니다." })
    expect(mocks.openai).not.toHaveBeenCalled()
    expect(mocks.webSearch).not.toHaveBeenCalled()
  })

  it("rejects a body over 4,000,000 bytes before parsing or invoking OpenAI", async () => {
    // Given: an authenticated request one byte above the server budget.
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "x".repeat(4_000_001),
    })

    // When: the route measures the body.
    const response = await POST(request)

    // Then: the provider is untouched and the response is bounded.
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "요청 크기는 4,000,000바이트 이하여야 합니다." })
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: "malformed JSON",
      request: new Request("http://localhost/api/chat", { method: "POST", body: "{" }),
    },
    { name: "unknown part", request: requestWithBody(validBody([{ type: "audio", url: "x" }])) },
    {
      name: "invalid SDK provider metadata",
      request: requestWithBody(
        validBody([
          {
            type: "text",
            text: "질문",
            providerMetadata: { openai: "invalid" },
          },
        ]),
      ),
    },
    { name: "empty messages", request: requestWithBody({ messages: [] }) },
  ])("rejects $name with the same Korean schema error", async ({ request }) => {
    // Given: an authenticated malformed request.

    // When: the route parses the boundary.
    const response = await POST(request)

    // Then: malformed details do not escape and OpenAI is not called.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "요청 형식이 올바르지 않습니다." })
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it("accepts normalized images only on the current user turn", async () => {
    // Given: a current turn with normalized JPEG data and a deterministic response.
    const model = modelWithChunks([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "확인했습니다." },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
    ])
    const image = {
      type: "file",
      mediaType: "image/jpeg",
      filename: "현재.jpg",
      url: "data:image/jpeg;base64,AA==",
    }

    // When: the current image-bearing request streams.
    await streamBody(model, validBody([{ type: "text", text: "봐 주세요" }, image]))

    // Then: the model prompt includes that current image.
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain("AA==")
  })

  it("accepts a follow-up turn with SDK provider metadata and strips it before the model call", async () => {
    // Given: useChat sends the previous OpenAI response as part of the second request.
    const model = modelWithChunks([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "두 번째 답변" },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
    ])
    const body = {
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "첫 질문" }] },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "text",
              text: "첫 답변",
              state: "done",
              providerMetadata: {
                openai: { itemId: "msg_123", phase: "final_answer", annotations: [] },
              },
            },
            {
              type: "source-url",
              sourceId: "source-1",
              url: "https://example.com/evidence",
              title: "근거",
              providerMetadata: { openai: { itemId: "src_123" } },
            },
          ],
        },
        { id: "user-2", role: "user", parts: [{ type: "text", text: "두 번째 질문" }] },
      ],
    }

    // When: the follow-up request reaches the route.
    await streamBody(model, body)

    // Then: conversational text remains, but untrusted provider metadata is not forwarded.
    const prompt = JSON.stringify(model.doStreamCalls[0]?.prompt)
    expect(prompt).toContain("첫 답변")
    expect(prompt).toContain("두 번째 질문")
    expect(prompt).not.toContain("msg_123")
    expect(prompt).not.toContain("src_123")
  })

  it("rejects prior-turn, non-JPEG, remote, or fifth images before OpenAI", async () => {
    // Given: each image violates the normalized current-turn contract.
    const image = { type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,AA==" }
    const invalidBodies = [
      {
        messages: [
          { id: "old", role: "user", parts: [image] },
          { id: "now", role: "user", parts: [{ type: "text", text: "현재" }] },
        ],
      },
      validBody([{ ...image, mediaType: "image/png" }]),
      validBody([{ ...image, url: "https://example.com/a.jpg" }]),
      validBody(Array.from({ length: 5 }, () => image)),
    ]

    // When: each malformed request reaches the schema boundary.
    const responses = await Promise.all(invalidBodies.map((body) => POST(requestWithBody(body))))

    // Then: every request is rejected without provider access.
    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400, 400])
    expect(mocks.openai).not.toHaveBeenCalled()
  })
})

const FAILURE_STREAMS: ReadonlyArray<{
  readonly name: string
  readonly chunks: MockStreamChunk[]
}> = [
  {
    name: "provider error",
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "error", error: new Error("api-secret") },
    ],
  },
  {
    name: "incomplete output",
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "finish", finishReason: { unified: "other", raw: "incomplete" }, usage: USAGE },
    ],
  },
]

describe("POST /api/chat safe stream", () => {
  it("streams text and safe URL sources while omitting reasoning, tools, and unsafe schemes", async () => {
    // Given: the model emits every sensitive or displayable chunk class.
    const model = modelWithChunks([
      { type: "stream-start", warnings: [] },
      { type: "reasoning-start", id: "thought" },
      { type: "reasoning-delta", id: "thought", delta: "숨은 추론" },
      { type: "reasoning-end", id: "thought" },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "근거가 서로 충돌하여 확인이 필요합니다." },
      {
        type: "source",
        sourceType: "url",
        id: "safe",
        url: "https://cdc.gov/evidence",
        title: "CDC",
        providerMetadata: { openai: { cited: true } },
      },
      {
        type: "source",
        sourceType: "url",
        id: "http",
        url: "http://example.org/evidence",
        title: "HTTP",
      },
      { type: "source", sourceType: "url", id: "bad", url: "javascript:alert(1)", title: "Bad" },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
    ])

    // When: the exact UI stream is consumed.
    const body = await streamBody(model)

    // Then: only answer text and http(s) source content reach the client surface.
    const chunks = parseUiChunks(body)
    expect(chunks).toContainEqual({
      type: "text-delta",
      id: "answer",
      delta: "근거가 서로 충돌하여 확인이 필요합니다.",
    })
    expect(chunks).toContainEqual({
      type: "source-url",
      sourceId: "safe",
      url: "https://cdc.gov/evidence",
      title: "CDC",
      providerMetadata: { openai: { cited: true } },
    })
    expect(body).toContain("http://example.org/evidence")
    expect(body).not.toContain("숨은 추론")
    expect(body).not.toContain("reasoning")
    expect(body).not.toContain("javascript:")
  })

  it.each(FAILURE_STREAMS)(
    "renders a bounded generic Korean disclosure for $name",
    async ({ chunks }) => {
      // Given: the provider cannot produce usable answer text.
      const model = modelWithChunks(chunks)

      // When: the UI stream is consumed.
      const body = await streamBody(model)

      // Then: unavailable evidence is disclosed without leaking or inventing a citation.
      expect(body).toContain(
        "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      )
      expect(body).not.toContain("api-secret")
      expect(body).not.toContain("source-url")
      expect(body.length).toBeLessThan(2_000)
    },
  )

  it("masks a synchronous web-search setup failure", async () => {
    // Given: search setup fails with sensitive provider detail.
    mocks.openai.mockReturnValue(modelWithChunks([]))
    mocks.webSearch.mockImplementationOnce(() => {
      throw new Error("search-key")
    })

    // When: the route prepares the required search tool.
    const response = await POST(requestWithBody(validBody()))

    // Then: a bounded generic Korean disclosure replaces the exception.
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    })
    expect(mocks.openai).toHaveBeenCalledOnce()
  })
})
