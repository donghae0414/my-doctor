import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChatTransport, FileUIPart, UIMessage, UIMessageChunk } from "ai"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { ImageNormalizationError } from "@/lib/images/normalize-image"
import { renderWithMotion as render } from "@/tests/render-with-motion"
import { ChatComposer } from "./chat-composer"
import { ChatShell } from "./chat-shell"

type PendingNormalization = {
  readonly resolve: (parts: readonly FileUIPart[]) => void
  readonly reject: (error: ImageNormalizationError) => void
}

const filePart = (file: File): FileUIPart => ({
  type: "file",
  mediaType: "image/jpeg",
  filename: file.name,
  url: `data:image/jpeg;base64,${"A".repeat(Math.max(4, file.name.length))}`,
})

function image(name: string, type = "image/jpeg", bytes = "image"): File {
  return new File([bytes], name, { type })
}

function composerProperties(normalize: (files: readonly File[]) => Promise<readonly FileUIPart[]>) {
  return {
    effort: "medium" as const,
    normalize,
    onEffortChange: vi.fn(),
    onStop: vi.fn(),
    onSubmit: vi.fn(async () => undefined),
    status: "ready" as const,
  }
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
  let sequence = 0
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${sequence++}`)
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
})

describe("ChatComposer image attachments", () => {
  it("exposes separate rear-camera and gallery image inputs", () => {
    // Given: the authenticated composer is ready.
    render(<ChatComposer {...composerProperties(async (files) => files.map(filePart))} />)

    // When: attachment controls are inspected.
    const camera = screen.getByLabelText("후면 카메라로 촬영")
    const gallery = screen.getByLabelText("사진 보관함에서 선택")

    // Then: only the camera input requests the environment capture surface.
    expect(camera).toHaveAttribute("accept", "image/*")
    expect(camera).toHaveAttribute("capture", "environment")
    expect(gallery).toHaveAttribute("accept", "image/*")
    expect(gallery).not.toHaveAttribute("capture")
    expect(camera).toHaveAttribute("multiple")
    expect(gallery).toHaveAttribute("multiple")
  })

  it("shows asynchronous previews, allows removal, and sends four normalized current-turn images", async () => {
    // Given: four gallery images whose shared normalization is explicitly controlled.
    const user = userEvent.setup()
    let pending: PendingNormalization | undefined
    const normalize = vi.fn(
      (_files: readonly File[]) =>
        new Promise<readonly FileUIPart[]>((resolve, reject) => {
          pending = { resolve, reject }
        }),
    )
    const properties = composerProperties(normalize)
    render(<ChatComposer {...properties} />)
    const first = image("산후-1.jpg")
    const second = image("산후-2.jpg")
    const third = image("산후-3.jpg")
    const fourth = image("산후-4.jpg")
    const files = [first, second, third, fourth]

    // When: selection starts, finishes, one image is removed, and the turn is sent.
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), files)
    expect(screen.getAllByText("이미지 처리 중")).toHaveLength(4)
    expect(screen.getByRole("button", { name: "질문 보내기" })).toBeDisabled()
    pending?.resolve(files.map(filePart))
    await waitFor(() => expect(screen.getAllByText("첨부 완료")).toHaveLength(4))
    expect(screen.getAllByTestId("thumbnail-motion")).toHaveLength(4)
    await user.click(screen.getByRole("button", { name: "산후-2.jpg 제거" }))
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "상처 상태를 봐 주세요")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    // Then: only the remaining current-turn files are submitted and transient URLs are gone.
    expect(properties.onSubmit).toHaveBeenCalledWith({
      images: [filePart(first), filePart(third), filePart(fourth)],
      originals: [first, third, fourth],
      text: "상처 상태를 봐 주세요",
    })
    expect(screen.queryByText("첨부 완료")).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4)
  })

  it.each([
    ["지원하지 않는 이미지 형식입니다.", new ImageNormalizationError("unsupported")],
    [
      "이미지를 읽을 수 없습니다. 다른 이미지를 선택해 주세요.",
      new ImageNormalizationError("corrupt"),
    ],
    ["이미지 한 장의 크기는 10MB 이하여야 합니다.", new ImageNormalizationError("too_large")],
  ])("announces the Korean local failure %s without submitting", async (message, failure) => {
    // Given: shared normalization rejects one image boundary.
    const user = userEvent.setup()
    const properties = composerProperties(async () => {
      throw failure
    })
    render(<ChatComposer {...properties} />)

    // When: an invalid image is selected.
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), image("invalid.jpg"))

    // Then: a stable Korean alert is shown and no turn is sent.
    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(properties.onSubmit).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it("rejects a fifth image locally and retains the first four", async () => {
    // Given: four ready attachments already occupy the complete allowance.
    const user = userEvent.setup()
    const normalize = vi.fn(async (files: readonly File[]) => files.map(filePart))
    render(<ChatComposer {...composerProperties(normalize)} />)
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), [
      image("1.jpg"),
      image("2.jpg"),
      image("3.jpg"),
      image("4.jpg"),
    ])
    await screen.findAllByText("첨부 완료")

    // When: a fifth file is selected from the camera input.
    await user.upload(screen.getByLabelText("후면 카메라로 촬영"), image("5.jpg"))

    // Then: no fifth normalization starts and the four previews remain actionable.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미지는 한 번에 최대 4장까지 첨부할 수 있습니다.",
    )
    expect(screen.getAllByText("첨부 완료")).toHaveLength(4)
    expect(normalize).toHaveBeenCalledOnce()
  })

  it("invalidates normalization that resolves after new chat without restoring stale send state", async () => {
    // Given: normalization remains pending while the authenticated shell is cleared.
    const user = userEvent.setup()
    let resolvePending: ((parts: readonly FileUIPart[]) => void) | undefined
    let normalizationCount = 0
    const normalize = vi.fn((files: readonly File[]) => {
      normalizationCount += 1
      if (normalizationCount > 1) return Promise.resolve(files.map(filePart))
      return new Promise<readonly FileUIPart[]>((resolve) => {
        resolvePending = resolve
      })
    })
    const sendMessages = vi.fn(
      async () =>
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant-after-clear" })
            controller.enqueue({ type: "finish", finishReason: "stop" })
            controller.close()
          },
        }),
    )
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages,
    }
    render(<ChatShell imageNormalizer={normalize} transport={transport} />)
    const late = image("late.jpg")
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), late)

    // When: new chat clears ownership before the old promise resolves.
    await user.click(screen.getByRole("button", { name: "새 대화" }))
    resolvePending?.([filePart(late)])
    await Promise.resolve()
    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "새 질문")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    // Then: no stale preview, parent image state, or transport bytes can return.
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce())
    expect(screen.queryByText("late.jpg")).not.toBeInTheDocument()
    expect(JSON.stringify(sendMessages.mock.calls)).not.toContain("late.jpg")
    expect(JSON.stringify(sendMessages.mock.calls)).not.toContain("data:image/")
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-0")
  })

  it("revokes transient URLs on replacement, new-chat reset, and unmount", async () => {
    // Given: one normalization completes and another composer is reset while pending.
    const user = userEvent.setup()
    let resolvePending: ((parts: readonly FileUIPart[]) => void) | undefined
    const normalize = vi.fn(
      (_files: readonly File[]) =>
        new Promise<readonly FileUIPart[]>((resolve) => {
          resolvePending = resolve
        }),
    )
    const properties = composerProperties(normalize)
    const rendered = render(<ChatComposer {...properties} key={0} />)
    const first = image("first.jpg")
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), first)

    // When: normalized data replaces the object preview, then a reset and unmount occur.
    resolvePending?.([filePart(first)])
    await screen.findByText("첨부 완료")
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-0")
    const second = image("second.jpg")
    await user.upload(screen.getByLabelText("사진 보관함에서 선택"), second)
    rendered.rerender(<ChatComposer {...properties} key={1} />)
    rendered.unmount()

    // Then: every object URL still owned by the composer is revoked exactly through cleanup.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1")
  })
})
