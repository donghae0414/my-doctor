import type { FileUIPart, UIMessage } from "ai"

import { type ImageNormalizer, normalizeImages } from "./normalize-image"

export const IMAGE_REQUEST_BYTE_LIMIT = 4_000_000

const COMPRESSION_ATTEMPTS = [
  { maxDimension: 2048, quality: 0.82 },
  { maxDimension: 2048, quality: 0.68 },
  { maxDimension: 2048, quality: 0.54 },
  { maxDimension: 1792, quality: 0.48 },
  { maxDimension: 1536, quality: 0.42 },
  { maxDimension: 1280, quality: 0.36 },
  { maxDimension: 1024, quality: 0.3 },
  { maxDimension: 768, quality: 0.26 },
  { maxDimension: 512, quality: 0.22 },
] as const

export class ImageRequestBudgetError extends Error {
  readonly name = "ImageRequestBudgetError"
  readonly code = "irreducible"

  constructor(options?: ErrorOptions) {
    super("첨부 이미지를 전송 가능한 크기로 줄일 수 없습니다. 이미지 수를 줄여 주세요.", options)
  }
}

type FitImageRequestOptions<RequestBody> = {
  readonly originals: readonly File[]
  readonly buildRequest: (images: readonly FileUIPart[]) => RequestBody
  readonly normalize?: ImageNormalizer
}

type FittedImageRequest<RequestBody> = {
  readonly body: RequestBody
  readonly images: readonly FileUIPart[]
  readonly serializedBody: string
  readonly byteLength: number
}

type SendImageRequestOptions<RequestBody, TransportResult> = FitImageRequestOptions<RequestBody> & {
  readonly transport: (serializedBody: string) => Promise<TransportResult>
}

type SentImageRequest<RequestBody, TransportResult> = FittedImageRequest<RequestBody> & {
  readonly transportResult: TransportResult
}

function serializeRequest(body: unknown): { readonly value: string; readonly byteLength: number } {
  let value: string | undefined
  try {
    value = JSON.stringify(body)
  } catch (error) {
    if (error instanceof TypeError) throw new ImageRequestBudgetError({ cause: error })
    throw error
  }
  if (value === undefined) throw new ImageRequestBudgetError()
  return { value, byteLength: new TextEncoder().encode(value).byteLength }
}

export async function fitImageRequestToBudget<RequestBody>(
  options: FitImageRequestOptions<RequestBody>,
): Promise<FittedImageRequest<RequestBody>> {
  const imageNormalizer = options.normalize ?? normalizeImages

  for (const target of COMPRESSION_ATTEMPTS) {
    const images = await imageNormalizer(options.originals, target)
    const body = options.buildRequest(images)
    const serialized = serializeRequest(body)
    if (serialized.byteLength <= IMAGE_REQUEST_BYTE_LIMIT) {
      return {
        body,
        images,
        serializedBody: serialized.value,
        byteLength: serialized.byteLength,
      }
    }
  }

  throw new ImageRequestBudgetError()
}

function isImageFilePart(part: UIMessage["parts"][number]): part is FileUIPart {
  return part.type === "file" && part.mediaType.startsWith("image/")
}

function priorImageMarker(part: FileUIPart, role: UIMessage["role"]): string {
  const filename = (part.filename ?? "이름 없음")
    .normalize("NFKC")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127 ? " " : character
    })
    .join("")
    .replace(/[<>{}[\]]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120)
  const context = role === "user" ? "이전 사용자 첨부 이미지" : "이전 응답 첨부 이미지"
  return `[${context}: ${filename.length > 0 ? filename : "이름 없음"}; 이미지 바이트 제외]`
}

export function omitPriorTurnImageBytes(messages: readonly UIMessage[]): readonly UIMessage[] {
  let latestUserTurn = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== undefined && message.role === "user") {
      latestUserTurn = index
      break
    }
  }

  return messages.map((message, index) =>
    index === latestUserTurn
      ? message
      : {
          ...message,
          parts: message.parts.flatMap((part) =>
            isImageFilePart(part)
              ? [{ type: "text" as const, text: priorImageMarker(part, message.role) }]
              : [part],
          ),
        },
  )
}

export async function sendImageRequestWithinBudget<RequestBody, TransportResult>(
  options: SendImageRequestOptions<RequestBody, TransportResult>,
): Promise<SentImageRequest<RequestBody, TransportResult>> {
  const fitted = await fitImageRequestToBudget(options)
  const transportResult = await options.transport(fitted.serializedBody)
  return { ...fitted, transportResult }
}
