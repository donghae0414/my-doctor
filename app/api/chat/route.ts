import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, streamText, type TextStreamPart } from "ai"

import { MEDICAL_SYSTEM_PROMPT } from "@/lib/ai/medical-system-prompt"
import { requireSession } from "@/lib/auth/require-session"
import { IMAGE_REQUEST_BYTE_LIMIT } from "@/lib/images/request-budget"

import { isSafeSourceUrl, safeParseChatRequest } from "./request-boundary"

const PROVIDER_FAILURE_MESSAGE =
  "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요."

type ChatTools = {
  readonly web_search: ReturnType<typeof openai.tools.webSearch>
}

function createSafeStreamTransform(): TransformStream<
  TextStreamPart<ChatTools>,
  TextStreamPart<ChatTools>
> {
  let hasAnswerText = false
  let hasFailureDisclosure = false

  const discloseFailure = (
    controller: TransformStreamDefaultController<TextStreamPart<ChatTools>>,
  ) => {
    if (hasFailureDisclosure) return
    controller.enqueue({ type: "text-start", id: "provider-unavailable" })
    controller.enqueue({
      type: "text-delta",
      id: "provider-unavailable",
      text: PROVIDER_FAILURE_MESSAGE,
    })
    controller.enqueue({ type: "text-end", id: "provider-unavailable" })
    hasFailureDisclosure = true
  }

  return new TransformStream({
    transform(part, controller) {
      switch (part.type) {
        case "text-start":
        case "text-end":
        case "start":
        case "start-step":
        case "finish-step":
        case "abort":
          controller.enqueue(part)
          return
        case "text-delta":
          if (part.text.length > 0) hasAnswerText = true
          controller.enqueue(part)
          return
        case "source":
          switch (part.sourceType) {
            case "url":
              if (isSafeSourceUrl(part.url)) controller.enqueue(part)
              return
            case "document":
              return
          }
          return
        case "finish":
          if (!hasAnswerText) discloseFailure(controller)
          controller.enqueue(part)
          return
        case "error":
          discloseFailure(controller)
          return
        case "reasoning-start":
        case "reasoning-delta":
        case "reasoning-end":
        case "reasoning-file":
        case "file":
        case "custom":
        case "tool-input-start":
        case "tool-input-delta":
        case "tool-input-end":
        case "tool-call":
        case "tool-result":
        case "tool-error":
        case "tool-output-denied":
        case "tool-approval-request":
        case "tool-approval-response":
        case "raw":
          return
      }
    },
  })
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request): Promise<Response> {
  const authorization = await requireSession()
  if (!authorization.authorized) return jsonError("인증이 필요합니다.", 401)

  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > IMAGE_REQUEST_BYTE_LIMIT) {
    return jsonError("요청 크기는 4,000,000바이트 이하여야 합니다.", 413)
  }

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > IMAGE_REQUEST_BYTE_LIMIT) {
    return jsonError("요청 크기는 4,000,000바이트 이하여야 합니다.", 413)
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("요청 형식이 올바르지 않습니다.", 400)
    throw error
  }
  const parsed = await safeParseChatRequest(body)
  if (!parsed.success) return jsonError("요청 형식이 올바르지 않습니다.", 400)

  const messages = await convertToModelMessages(parsed.data.messages)
  try {
    const currentText = parsed.data.messages
      .at(-1)
      ?.parts.find((part) => part.type === "text")?.text
    const model =
      process.env["PLAYWRIGHT_TEST"] === "1"
        ? (await import("@/lib/ai/playwright-provider")).createPlaywrightLanguageModel(
            process.env,
            currentText,
          )
        : openai(parsed.data.model)
    const tools = {
      web_search: openai.tools.webSearch({ externalWebAccess: true }),
    }
    const result = streamText({
      model,
      system: MEDICAL_SYSTEM_PROMPT,
      messages,
      tools,
      toolChoice: "required",
      maxOutputTokens: 4096,
      providerOptions: {
        openai: {
          // reasoningMode: "pro", // temporarily lowered to standard; restore by swapping the two lines
          reasoningMode: "standard",
          reasoningEffort: parsed.data.effort,
          store: false,
          reasoningSummary: null,
        },
      },
      experimental_transform: createSafeStreamTransform,
    })

    return result.toUIMessageStreamResponse({
      sendReasoning: false,
      sendSources: true,
      onError: () => PROVIDER_FAILURE_MESSAGE,
    })
  } catch {
    // no-excuse-ok: catch -- this HTTP boundary deliberately masks provider/search details.
    return jsonError(PROVIDER_FAILURE_MESSAGE, 502)
  }
}
