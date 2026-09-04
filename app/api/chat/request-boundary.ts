import {
  safeValidateUIMessages,
  type FileUIPart,
  type SourceUrlUIPart,
  type TextUIPart,
  type UIMessage,
} from "ai"
import { z } from "zod"

const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const
const MODELS = ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6-terra"] as const

export function isSafeSourceUrl(url: string): boolean {
  if (!URL.canParse(url)) return false
  const protocol = new URL(url).protocol
  return protocol === "http:" || protocol === "https:"
}

const textPartSchema = z
  .strictObject({
    type: z.literal("text"),
    text: z.string().min(1),
    state: z.enum(["streaming", "done"]).optional(),
    providerMetadata: z.unknown().optional(),
  })
  .transform(
    (part): TextUIPart =>
      part.state === undefined
        ? { type: part.type, text: part.text }
        : { type: part.type, text: part.text, state: part.state },
  )
const stepPartSchema = z.strictObject({ type: z.literal("step-start") })
const sourcePartSchema = z
  .strictObject({
    type: z.literal("source-url"),
    sourceId: z.string().min(1),
    url: z.url().refine(isSafeSourceUrl),
    title: z.string().min(1).optional(),
    providerMetadata: z.unknown().optional(),
  })
  .transform(
    (part): SourceUrlUIPart =>
      part.title === undefined
        ? { type: part.type, sourceId: part.sourceId, url: part.url }
        : { type: part.type, sourceId: part.sourceId, url: part.url, title: part.title },
  )
const imagePartSchema = z
  .strictObject({
    type: z.literal("file"),
    mediaType: z.literal("image/jpeg"),
    filename: z.string().min(1).optional(),
    url: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
    providerMetadata: z.unknown().optional(),
  })
  .transform(
    (part): FileUIPart =>
      part.filename === undefined
        ? { type: part.type, mediaType: part.mediaType, url: part.url }
        : {
            type: part.type,
            mediaType: part.mediaType,
            filename: part.filename,
            url: part.url,
          },
  )
const messageSchema = z
  .strictObject({
    id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    metadata: z.unknown().optional(),
    parts: z
      .array(
        z.discriminatedUnion("type", [
          textPartSchema,
          stepPartSchema,
          sourcePartSchema,
          imagePartSchema,
        ]),
      )
      .min(1),
  })
  .transform(
    ({ id, role, parts }): UIMessage => ({
      id,
      role,
      parts,
    }),
  )

const chatRequestEnvelopeSchema = z.strictObject({
  effort: z.enum(EFFORTS).default("medium"),
  id: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  messages: z.unknown(),
  model: z.enum(MODELS).default("gpt-5.6-sol"),
  trigger: z.literal("submit-message").optional(),
})

const chatRequestPolicySchema = z
  .strictObject({
    effort: z.enum(EFFORTS).default("medium"),
    id: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    messages: z.array(messageSchema).min(1),
    model: z.enum(MODELS).default("gpt-5.6-sol"),
    trigger: z.literal("submit-message").optional(),
  })
  .superRefine(({ messages }, context) => {
    const currentTurnIndex = messages.length - 1
    if (messages[currentTurnIndex]?.role !== "user") {
      context.addIssue({ code: "custom", message: "current turn must be a user message" })
    }

    let currentImageCount = 0
    for (const [messageIndex, message] of messages.entries()) {
      for (const part of message.parts) {
        if (part.type !== "file") continue
        if (messageIndex !== currentTurnIndex || message.role !== "user") {
          context.addIssue({
            code: "custom",
            message: "images belong only to the current user turn",
          })
        }
        currentImageCount += 1
      }
    }
    if (currentImageCount > 4) {
      context.addIssue({ code: "custom", message: "at most four current-turn images are allowed" })
    }
  })

type ChatRequest = Omit<z.infer<typeof chatRequestPolicySchema>, "messages"> & {
  readonly messages: UIMessage[]
}

type SafeParseChatRequestResult =
  | { readonly success: true; readonly data: ChatRequest }
  | { readonly success: false }

export async function safeParseChatRequest(input: unknown): Promise<SafeParseChatRequestResult> {
  const envelope = chatRequestEnvelopeSchema.safeParse(input)
  if (!envelope.success) return { success: false }

  const validatedMessages = await safeValidateUIMessages({
    messages: envelope.data.messages,
  })
  if (!validatedMessages.success) return { success: false }

  const policyResult = chatRequestPolicySchema.safeParse({
    ...envelope.data,
    messages: validatedMessages.data,
  })
  if (!policyResult.success) return { success: false }

  return { success: true, data: policyResult.data }
}
