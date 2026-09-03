import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { FileUIPart, UIMessage } from "ai"
import { describe, expect, it, vi } from "vitest"

import type { ImageNormalizer, NormalizationTarget } from "./normalize-image"
import {
  fitImageRequestToBudget,
  IMAGE_REQUEST_BYTE_LIMIT,
  ImageRequestBudgetError,
  omitPriorTurnImageBytes,
  sendImageRequestWithinBudget,
} from "./request-budget"

const FIXTURE_DIRECTORY = join(process.cwd(), "tests/fixtures/images")
const TEN_MEBIBYTES = 10 * 1024 * 1024

async function tenMebibyteFixture(fixtureName: string, mediaType: string): Promise<File> {
  const bytes = await readFile(join(FIXTURE_DIRECTORY, fixtureName))
  return new File([bytes, new Uint8Array(TEN_MEBIBYTES - bytes.byteLength)], fixtureName, {
    type: mediaType,
  })
}

function filePart(url: string, filename: string): FileUIPart {
  return { type: "file", mediaType: "image/jpeg", filename, url }
}

describe("fitImageRequestToBudget", () => {
  it("fits the complete four-image chat request below 4,000,000 UTF-8 bytes", async () => {
    // Given: deterministic maximum-size JPEG/HEIC originals and body overhead.
    const originals = await Promise.all([
      tenMebibyteFixture("oriented-6.jpg", "image/jpeg"),
      tenMebibyteFixture("still.heic", "image/heic"),
      tenMebibyteFixture("oriented-6.jpg", "image/jpeg"),
      tenMebibyteFixture("still.heic", "image/heic"),
    ])
    const normalize: ImageNormalizer = vi.fn(
      async (files: readonly File[], target: NormalizationTarget) =>
        files.map((file) =>
          filePart(
            `data:image/jpeg;base64,${"A".repeat(Math.round(target.quality * 1_350_000))}`,
            file.name,
          ),
        ),
    )

    // When: the full request, including Korean text and JSON syntax, is fitted.
    const result = await fitImageRequestToBudget({
      originals,
      normalize,
      buildRequest: (images) => ({
        effort: "medium",
        messages: [
          {
            id: "current",
            role: "user",
            parts: [{ type: "text", text: "산후 사진을 확인해 주세요." }, ...images],
          },
        ],
      }),
    })

    // Then: exact UTF-8 serialization is transport-safe and required compression occurred.
    expect(result.byteLength).toBe(new TextEncoder().encode(result.serializedBody).byteLength)
    expect(result.byteLength).toBe(3_672_532)
    expect(result.byteLength).toBeLessThanOrEqual(IMAGE_REQUEST_BYTE_LIMIT)
    expect(result.images).toHaveLength(4)
    expect(normalize).toHaveBeenCalledTimes(2)
    expect(normalize).toHaveBeenLastCalledWith(originals, {
      maxDimension: 2048,
      quality: 0.68,
    })
  })

  it("lowers quality and dimensions on a finite monotonic schedule", async () => {
    // Given: image output that remains too large until dimensions are reduced.
    const original = await tenMebibyteFixture("oriented-6.jpg", "image/jpeg")
    const observed: Array<{ readonly maxDimension: number; readonly quality: number }> = []
    const normalize: ImageNormalizer = vi.fn(
      async (_files: readonly File[], target: NormalizationTarget) => {
        observed.push(target)
        const size = target.maxDimension > 1536 ? IMAGE_REQUEST_BYTE_LIMIT : 64
        return [filePart(`data:image/jpeg;base64,${"A".repeat(size)}`, "fitted.jpg")]
      },
    )

    // When: the request fitter traverses its bounded attempts.
    const result = await fitImageRequestToBudget({
      originals: [original],
      normalize,
      buildRequest: (images) => ({ messages: [{ role: "user", parts: images }] }),
    })

    // Then: both controls only decrease and the loop terminates at the first fitting body.
    expect(observed.length).toBeGreaterThan(2)
    expect(observed.at(-1)?.maxDimension).toBe(1536)
    expect(result.byteLength).toBeLessThanOrEqual(IMAGE_REQUEST_BYTE_LIMIT)
    for (const [index, target] of observed.entries()) {
      const previous = observed[index - 1]
      if (previous !== undefined) {
        expect(target.maxDimension).toBeLessThanOrEqual(previous.maxDimension)
        expect(target.quality).toBeLessThanOrEqual(previous.quality)
      }
    }
  })

  it("measures UTF-8 bytes rather than JavaScript string length", async () => {
    // Given: Korean body text whose UTF-8 representation exceeds the platform limit.
    const bodyText = "가".repeat(1_400_000)

    // When: a request with no reducible image bytes is fitted.
    const captureError = () =>
      fitImageRequestToBudget({
        originals: [],
        buildRequest: () => ({ message: bodyText }),
      })

    // Then: byte-accurate local rejection wins over misleading character length.
    expect(JSON.stringify({ message: bodyText }).length).toBeLessThan(IMAGE_REQUEST_BYTE_LIMIT)
    await expect(captureError()).rejects.toMatchObject({
      name: "ImageRequestBudgetError",
      code: "irreducible",
    })
  })
})

describe("omitPriorTurnImageBytes", () => {
  it("removes stale image bytes when the actual current user turn is text-only", () => {
    // Given: an old image turn, an assistant reply, and the current text-only user turn.
    const messages: readonly UIMessage[] = [
      {
        id: "old-image",
        role: "user",
        parts: [filePart("data:image/jpeg;base64,STALE", "stale.jpg")],
      },
      { id: "reply", role: "assistant", parts: [{ type: "text", text: "확인했습니다." }] },
      { id: "current", role: "user", parts: [{ type: "text", text: "지금은 글로 질문합니다." }] },
    ]

    // When: the current request history is prepared.
    const serialized = JSON.stringify(omitPriorTurnImageBytes(messages))

    // Then: no prior-turn image bytes survive serialization.
    expect(serialized).not.toContain("data:image/jpeg;base64,STALE")
  })

  it("keeps only the latest image-bearing user turn in later requests", () => {
    // Given: local UI history containing stale and current image data URLs.
    const messages: readonly UIMessage[] = [
      {
        id: "first",
        role: "user",
        parts: [
          { type: "text", text: "이전 사진" },
          filePart("data:image/jpeg;base64,OLD", "old.jpg"),
        ],
      },
      { id: "reply", role: "assistant", parts: [{ type: "text", text: "확인했습니다." }] },
      {
        id: "latest",
        role: "user",
        parts: [
          { type: "text", text: "현재 사진" },
          filePart("data:image/jpeg;base64,NEW", "new.jpg"),
        ],
      },
      {
        id: "assistant-file",
        role: "assistant",
        parts: [filePart("data:image/jpeg;base64,ASSISTANT", "assistant.jpg")],
      },
    ]

    // When: transport history is prepared.
    const transportMessages = omitPriorTurnImageBytes(messages)
    const serialized = JSON.stringify(transportMessages)

    // Then: stale/assistant bytes are absent while actual current-user bytes remain.
    expect(serialized).not.toContain("OLD")
    expect(serialized).not.toContain("ASSISTANT")
    expect(serialized).toContain("NEW")
    expect(serialized).toContain("이전 사진")
  })

  it.each([
    { name: "empty history", messages: [] },
    {
      name: "history without a user turn",
      messages: [
        {
          id: "assistant-only",
          role: "assistant",
          parts: [filePart("data:image/jpeg;base64,ASSISTANT_ONLY", "assistant.jpg")],
        },
      ],
    },
  ] satisfies ReadonlyArray<{ readonly name: string; readonly messages: readonly UIMessage[] }>)(
    "removes all image bytes for $name",
    ({ messages }) => {
      // Given: history with no current user turn.

      // When: transport history is prepared.
      const serialized = JSON.stringify(omitPriorTurnImageBytes(messages))

      // Then: no image data URL can be transmitted.
      expect(serialized).not.toContain("data:image/")
    },
  )

  it("removes multiple old image turns without mutation or reordering", () => {
    // Given: multiple stale image turns followed by a current text-only user turn.
    const messages: readonly UIMessage[] = [
      {
        id: "old-one",
        role: "user",
        parts: [filePart("data:image/jpeg;base64,OLD_ONE", "old-one.jpg")],
      },
      {
        id: "old-two",
        role: "user",
        parts: [filePart("data:image/jpeg;base64,OLD_TWO", "old-two.jpg")],
      },
      { id: "current", role: "user", parts: [{ type: "text", text: "현재 질문" }] },
    ]
    const originalSerialization = JSON.stringify(messages)

    // When: transport history is prepared.
    const transportMessages = omitPriorTurnImageBytes(messages)

    // Then: order is stable, output has no stale bytes, and input remains untouched.
    expect(transportMessages.map((message) => message.id)).toEqual([
      "old-one",
      "old-two",
      "current",
    ])
    expect(JSON.stringify(transportMessages)).not.toContain("data:image/")
    expect(JSON.stringify(messages)).toBe(originalSerialization)
    expect(originalSerialization).toContain("OLD_ONE")
    expect(originalSerialization).toContain("OLD_TWO")
  })
})

describe("sendImageRequestWithinBudget", () => {
  it("fails with a Korean typed pre-fetch error and zero transport", async () => {
    // Given: irreducible request overhead and a transport spy.
    const transport = vi.fn(async (_serializedBody: string) => new Response(null, { status: 204 }))

    // When: the complete request cannot fit locally.
    const captureError = () =>
      sendImageRequestWithinBudget({
        originals: [],
        buildRequest: () => ({ message: "가".repeat(1_400_000) }),
        transport,
      })

    // Then: no request begins and the UI can render a stable Korean failure.
    await expect(captureError()).rejects.toBeInstanceOf(ImageRequestBudgetError)
    await expect(captureError()).rejects.toHaveProperty(
      "message",
      expect.stringMatching(/[가-힣]/u),
    )
    expect(transport).not.toHaveBeenCalled()
  })
})
