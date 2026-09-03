import type { FileUIPart } from "ai"

const MAX_IMAGE_COUNT = 4
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_DIMENSION = 2048
const DEFAULT_JPEG_QUALITY = 0.82

export const IMAGE_NORMALIZATION_ERROR_CODES = [
  "too_many",
  "too_large",
  "unsupported",
  "animated_gif",
  "corrupt",
] as const

export type ImageNormalizationErrorCode = (typeof IMAGE_NORMALIZATION_ERROR_CODES)[number]

const ERROR_MESSAGES = {
  too_many: "이미지는 한 번에 최대 4장까지 첨부할 수 있습니다.",
  too_large: "이미지 한 장의 크기는 10MB 이하여야 합니다.",
  unsupported: "지원하지 않는 이미지 형식입니다.",
  animated_gif: "움직이는 GIF는 첨부할 수 없습니다.",
  corrupt: "이미지를 읽을 수 없습니다. 다른 이미지를 선택해 주세요.",
} as const satisfies Record<ImageNormalizationErrorCode, string>

export class ImageNormalizationError extends Error {
  readonly name = "ImageNormalizationError"

  constructor(
    readonly code: ImageNormalizationErrorCode,
    options?: ErrorOptions,
  ) {
    super(ERROR_MESSAGES[code], options)
  }
}

export type DecodedImage = {
  readonly width: number
  readonly height: number
  readonly source: CanvasImageSource
  readonly close: () => void
}

export type NormalizationTarget = {
  readonly maxDimension: number
  readonly quality: number
}

export type ImageRuntime = {
  readonly decode: (image: Blob) => Promise<DecodedImage>
  readonly encodeJpeg: (image: DecodedImage, target: EncodedImageTarget) => Promise<Blob>
}

type EncodedImageTarget = {
  readonly width: number
  readonly height: number
  readonly quality: number
}

type NormalizeImageOptions = {
  readonly runtime?: ImageRuntime
  readonly maxDimension?: number
  readonly quality?: number
}

type DetectedFormat = "jpeg" | "png" | "webp" | "gif" | "heic"

export type ImageNormalizer = (
  originals: readonly File[],
  target: NormalizationTarget,
) => Promise<readonly FileUIPart[]>

function bytesStartWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value)
  )
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function detectFormat(bytes: Uint8Array): DetectedFormat | undefined {
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg"
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png"
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") return "webp"
  if (asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a") return "gif"
  const heifBrand = asciiAt(bytes, 8, 4)
  if (asciiAt(bytes, 4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/u.test(heifBrand)) {
    return "heic"
  }
  return undefined
}

function skipGifSubBlocks(bytes: Uint8Array, initialOffset: number): number | undefined {
  let offset = initialOffset
  while (offset < bytes.length) {
    const blockLength = bytes[offset]
    if (blockLength === undefined) return undefined
    offset += 1
    if (blockLength === 0) return offset
    offset += blockLength
  }
  return undefined
}

function gifFrameCount(bytes: Uint8Array): number | undefined {
  if (bytes.length < 13) return undefined
  const packed = bytes[10]
  if (packed === undefined) return undefined
  let offset = 13 + ((packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1))
  let frames = 0

  while (offset < bytes.length) {
    const marker = bytes[offset]
    if (marker === 0x3b) return frames
    if (marker === 0x21) {
      const nextOffset = skipGifSubBlocks(bytes, offset + 2)
      if (nextOffset === undefined) return undefined
      offset = nextOffset
      continue
    }
    if (marker !== 0x2c || offset + 10 > bytes.length) return undefined

    frames += 1
    const imagePacked = bytes[offset + 9]
    if (imagePacked === undefined) return undefined
    const colorTableBytes = (imagePacked & 0x80) === 0 ? 0 : 3 * 2 ** ((imagePacked & 0x07) + 1)
    const nextOffset = skipGifSubBlocks(bytes, offset + 11 + colorTableBytes)
    if (nextOffset === undefined) return undefined
    offset = nextOffset
  }
  return undefined
}

async function prepareDecodableImage(original: File): Promise<Blob> {
  const bytes = new Uint8Array(await original.arrayBuffer())
  const format = detectFormat(bytes)
  if (format === undefined) throw new ImageNormalizationError("unsupported")

  switch (format) {
    case "jpeg":
    case "png":
    case "webp":
      return original
    case "gif": {
      const frames = gifFrameCount(bytes)
      if (frames === undefined || frames === 0) throw new ImageNormalizationError("corrupt")
      if (frames > 1) throw new ImageNormalizationError("animated_gif")
      return original
    }
    case "heic":
      try {
        const { heicTo } = await import("heic-to")
        return await heicTo({ blob: original, type: "image/jpeg", quality: 1 })
      } catch (error) {
        throw new ImageNormalizationError("corrupt", { cause: error })
      }
    default:
      format satisfies never
      return format
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new ImageNormalizationError("corrupt"))
    })
    reader.addEventListener("error", () => reject(new ImageNormalizationError("corrupt")))
    reader.readAsDataURL(blob)
  })
}

export function createBrowserImageRuntime(): ImageRuntime {
  return {
    decode: async (image) => {
      const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" })
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      }
    },
    encodeJpeg: async (image, target) => {
      const canvas = document.createElement("canvas")
      canvas.width = target.width
      canvas.height = target.height
      const context = canvas.getContext("2d")
      if (context === null) throw new ImageNormalizationError("corrupt")
      context.drawImage(image.source, 0, 0, target.width, target.height)
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob === null) {
              reject(new ImageNormalizationError("corrupt"))
              return
            }
            resolve(blob)
          },
          "image/jpeg",
          target.quality,
        )
      })
    },
  }
}

export async function normalizeImages(
  originals: readonly File[],
  options: NormalizeImageOptions = {},
): Promise<readonly FileUIPart[]> {
  if (originals.length > MAX_IMAGE_COUNT) throw new ImageNormalizationError("too_many")
  if (originals.some((original) => original.size > MAX_ORIGINAL_BYTES)) {
    throw new ImageNormalizationError("too_large")
  }

  const runtime = options.runtime ?? createBrowserImageRuntime()
  const target = {
    maxDimension: options.maxDimension ?? DEFAULT_MAX_DIMENSION,
    quality: options.quality ?? DEFAULT_JPEG_QUALITY,
  }
  const normalized: FileUIPart[] = []

  for (const original of originals) {
    const decodable = await prepareDecodableImage(original)
    let decoded: DecodedImage
    try {
      decoded = await runtime.decode(decodable)
    } catch (error) {
      throw new ImageNormalizationError("corrupt", { cause: error })
    }

    try {
      const scale = Math.min(1, target.maxDimension / Math.max(decoded.width, decoded.height))
      const encoded = await runtime.encodeJpeg(decoded, {
        width: Math.max(1, Math.round(decoded.width * scale)),
        height: Math.max(1, Math.round(decoded.height * scale)),
        quality: target.quality,
      })
      normalized.push({
        type: "file",
        mediaType: "image/jpeg",
        filename: original.name,
        url: await blobToDataUrl(encoded),
      })
    } catch (error) {
      if (error instanceof ImageNormalizationError) throw error
      throw new ImageNormalizationError("corrupt", { cause: error })
    } finally {
      decoded.close()
    }
  }

  return normalized
}
