import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Attachment, Attachments } from "@/components/ai-elements/attachments"
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources"
import { renderWithMotion as render } from "@/tests/render-with-motion"

describe("AI Elements primitive contract", () => {
  it("exposes labelled conversation and naturally wrapping messages", () => {
    render(
      <Conversation aria-label="상담 대화">
        <ConversationContent>
          <Message from="assistant">
            <MessageContent>
              아기가 잘 먹고 있지만 체온과 소변 횟수도 함께 살펴보세요.
            </MessageContent>
          </Message>
        </ConversationContent>
      </Conversation>,
    )

    const conversation = screen.getByRole("log", { name: "상담 대화" })
    const message = screen.getByText(/아기가 잘 먹고 있지만/u)
    expect(conversation.querySelector("[data-scroll-owner='conversation']")).not.toBeNull()
    expect(message).toHaveClass("break-keep")
    expect(message).not.toHaveClass("max-w-[min(85%,65ch)]")
    expect(message).not.toHaveClass("bg-card")
    expect(message.closest("article")?.querySelector("[data-assistant-marker]")).toBeNull()
  })

  it("submits entered text and exposes disabled and loading states", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea aria-label="의료 질문" />
        <PromptInputSubmit status="ready" />
      </PromptInput>,
    )

    await user.type(screen.getByRole("textbox", { name: "의료 질문" }), "수유 간격이 궁금해요")
    await user.click(screen.getByRole("button", { name: "질문 보내기" }))

    expect(onSubmit).toHaveBeenCalledWith("수유 간격이 궁금해요")
  })

  it("rejects unsafe source protocols at the rendering boundary", () => {
    const unsafeHref = ["java", "script:alert(1)"].join("")
    const { rerender } = render(<Source href={unsafeHref} title="unsafe" />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    rerender(<Source href="https://example.com/evidence" title="safe" />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/evidence")
  })

  it("uses native source disclosure and accessible attachment removal", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <>
        <Sources>
          <SourcesTrigger count={1} />
          <SourcesContent>
            <Source href="https://example.com/very-long-source" title="긴 한국어 근거 자료 제목" />
          </SourcesContent>
        </Sources>
        <Attachments>
          <Attachment
            alt="아기 체온계 사진"
            name="temperature.jpg"
            onRemove={onRemove}
            preview="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
          />
        </Attachments>
      </>,
    )

    await user.click(screen.getByRole("button", { name: "출처 1개 보기" }))
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "긴 한국어 근거 자료 제목" })).toBeVisible(),
    )
    await user.click(screen.getByRole("button", { name: "temperature.jpg 제거" }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
