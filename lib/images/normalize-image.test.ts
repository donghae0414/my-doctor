import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  createBrowserImageRuntime,
  ImageNormalizationError,
  type ImageRuntime,
  normalizeImages,
} from "./normalize-image"

const heicTo = vi.hoisted(() => vi.fn())
vi.mock("heic-to", () => ({ heicTo }))

const FIXTURE_DIRECTORY = join(process.cwd(), "tests/fixtures/images")
const TEN_MEBIBYTES = 10 * 1024 * 1024

async function fixtureFile(
  fixtureName: string,
  mediaType: string,
  modeledSize?: number,
): Promise<File> {
  const bytes = await readFile(join(FIXTURE_DIRECTORY, fixtureName))
  const paddingSize = modeledSize === undefined ? 0 : modeledSize - bytes.byteLength
  const parts: BlobPart[] = paddingSize > 0 ? [bytes, new Uint8Array(paddingSize)] : [bytes]
  return new File(parts, fixtureName, { type: mediaType })
}

function createRuntime(dimensions = { width: 4032, height: 3024 }): ImageRuntime {
  return {
    decode: vi.fn(async () => ({
      ...dimensions,
      source: document.createElement("canvas"),
      close: vi.fn(),
    })),
    encodeJpeg: vi.fn(
      async (_image, target) =>
        new Blob([`jpeg:${target.width}x${target.height}:${target.quality}`], {
          type: "image/jpeg",
        }),
    ),
  }
}

describe("normalizeImages", () => {
  it("normalizes four 10 MiB originals across the agreed still formats", async () => {
    // Given: the maximum count and exact maximum original size.
    const originals = await Promise.all([
      fixtureFile("oriented-6.jpg", "image/jpeg", TEN_MEBIBYTES),
      fixtureFile("still.png", "image/png", TEN_MEBIBYTES),
      fixtureFile("still.webp", "image/webp", TEN_MEBIBYTES),
      fixtureFile("still.gif", "image/gif", TEN_MEBIBYTES),
    ])
    const runtime = createRuntime({ width: 1200, height: 800 })

    // When: all originals cross the image boundary.
    const parts = await normalizeImages(originals, { runtime })

    // Then: transient originals become metadata-free AI SDK JPEG data URL parts.
    expect(parts).toHaveLength(4)
    expect(parts.every((part) => part.type === "file")).toBe(true)
    expect(parts.every((part) => part.mediaType === "image/jpeg")).toBe(true)
    expect(parts.every((part) => part.url.startsWith("data:image/jpeg;base64,"))).toBe(true)
    expect(parts.map((part) => part.filename)).toEqual([
      "oriented-6.jpg",
      "still.png",
      "still.webp",
      "still.gif",
    ])
    expect(heicTo).not.toHaveBeenCalled()
  })

  it("honors decoded orientation and caps the long edge at 2048 pixels", async () => {
    // Given: an EXIF-orientation fixture decoded by the browser as portrait.
    const original = await fixtureFile("oriented-6.jpg", "image/jpeg")
    const runtime = createRuntime({ width: 3024, height: 4032 })

    // When: the oriented image is normalized.
    await normalizeImages([original], { runtime })

    // Then: the canvas target preserves portrait orientation and caps its long edge.
    expect(runtime.encodeJpeg).toHaveBeenCalledWith(
      expect.objectContaining({ width: 3024, height: 4032 }),
      { width: 1536, height: 2048, quality: 0.82 },
    )
  })

  it("asks the browser decoder to apply embedded orientation", async () => {
    // Given: a browser bitmap decoder spy.
    const original = await fixtureFile("oriented-6.jpg", "image/jpeg")
    const close = vi.fn()
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 10, height: 20, close })
    vi.stubGlobal("createImageBitmap", createImageBitmap)

    // When: the production browser runtime decodes the image.
    const decoded = await createBrowserImageRuntime().decode(original)
    decoded.close()

    // Then: orientation is delegated explicitly and the bitmap remains releasable.
    expect(createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: "from-image" })
    expect(close).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it("dynamically converts HEIC before normalization", async () => {
    // Given: a valid HEIC boundary fixture and a deterministic converter result.
    const original = await fixtureFile("still.heic", "image/heic", TEN_MEBIBYTES)
    const converted = new Blob(["converted-jpeg"], { type: "image/jpeg" })
    heicTo.mockResolvedValueOnce(converted)
    const runtime = createRuntime({ width: 800, height: 1200 })

    // When: the HEIC original is normalized.
    const parts = await normalizeImages([original], { runtime })

    // Then: the converter receives only the HEIC and the result is normalized as JPEG.
    expect(heicTo).toHaveBeenCalledWith({ blob: original, type: "image/jpeg", quality: 1 })
    expect(runtime.decode).toHaveBeenCalledWith(converted)
    expect(parts[0]?.mediaType).toBe("image/jpeg")
  })

  it.each([
    { name: "fifth image", expectedCode: "too_many" },
    { name: "larger than 10 MiB", expectedCode: "too_large" },
    { name: "unsupported bytes", expectedCode: "unsupported" },
    { name: "animated GIF", expectedCode: "animated_gif" },
  ])("rejects $name locally", async ({ expectedCode, name }) => {
    // Given: one malformed boundary class.
    const still = await fixtureFile("oriented-6.jpg", "image/jpeg")
    const originals =
      name === "fifth image"
        ? [still, still, still, still, still]
        : name === "larger than 10 MiB"
          ? [await fixtureFile("oriented-6.jpg", "image/jpeg", TEN_MEBIBYTES + 1)]
          : name === "unsupported bytes"
            ? [await fixtureFile("unsupported.txt", "image/jpeg")]
            : [await fixtureFile("animated.gif", "image/gif")]

    // When: validation runs before decoding.
    let caught: ImageNormalizationError | undefined
    try {
      await normalizeImages(originals, { runtime: createRuntime() })
    } catch (error) {
      if (!(error instanceof ImageNormalizationError)) throw error
      caught = error
    }

    // Then: a typed Korean error identifies the local rejection class.
    expect(caught).toMatchObject({
      name: "ImageNormalizationError",
      code: expectedCode,
      message: expect.stringMatching(/[가-힣]/u),
    })
  })

  it("maps corrupt HEIC conversion to a typed Korean error", async () => {
    // Given: a HEIC-signature fixture whose decoder rejects its corrupt body.
    const original = await fixtureFile("corrupt.heic", "image/heic")
    heicTo.mockRejectedValueOnce(new TypeError("decoder internals must stay hidden"))

    // When: conversion runs.
    let caught: ImageNormalizationError | undefined
    try {
      await normalizeImages([original], { runtime: createRuntime() })
    } catch (error) {
      if (!(error instanceof ImageNormalizationError)) throw error
      caught = error
    }

    // Then: callers receive a stable pre-fetch error without decoder details.
    expect(caught).toMatchObject({
      name: "ImageNormalizationError",
      code: "corrupt",
      message: expect.stringMatching(/[가-힣]/u),
    })
    expect(caught?.message).not.toContain("decoder internals")
  })
})
