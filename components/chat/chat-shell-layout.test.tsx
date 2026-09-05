import { act, fireEvent, screen } from "@testing-library/react"
import type { ChatTransport, UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { renderWithMotion as render } from "@/tests/render-with-motion"
import { ChatShell } from "./chat-shell"

describe("empty chat layout", () => {
  it("keeps the intro before the stable composer slot until the first send", async () => {
    // Given an empty chat with the real composer and a held transport.
    const transport: ChatTransport<UIMessage> = {
      reconnectToStream: async () => null,
      sendMessages: () => new Promise(() => undefined),
    }
    render(<ChatShell transport={transport} />)
    const region = screen.getByTestId("chat-composer-region")
    const composer = screen.getByRole("form").parentElement
    const intro = document.querySelector<HTMLElement>("[data-empty-state='conversation']")
    expect(intro).not.toBeNull()
    expect(screen.getByRole("main")).toContainElement(intro)
    expect(intro?.compareDocumentPosition(screen.getByRole("form"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    // When the first message is submitted.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "question" } })
    await act(async () => fireEvent.submit(screen.getByRole("form")))

    // Then only the intro disappears; the composer slot moves without remounting.
    expect(screen.getByTestId("chat-composer-region")).toBe(region)
    expect(screen.getByRole("form").parentElement).toBe(composer)
    expect(region).toHaveAttribute("data-placement", "bottom")
    expect(document.querySelector("[data-empty-state='conversation']")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "응답 중지" })))
  })
})
