import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { requireSessionCall } = vi.hoisted(() => ({ requireSessionCall: vi.fn() }))

vi.mock("@/lib/auth/require-session", () => ({ requireSession: requireSessionCall }))
vi.mock("@/components/chat/chat-shell", () => ({
  ChatShell: () => (
    <main>
      <h1>산후·신생아 의료 상담</h1>
      <p role="status">상담을 시작할 수 있습니다.</p>
    </main>
  ),
}))

import HomePage from "@/app/page"

beforeEach(() => {
  requireSessionCall.mockReset()
  requireSessionCall.mockResolvedValue({ authorized: true })
})

describe("HomePage", () => {
  it("renders one semantic application landmark with a visible heading", async () => {
    // Given: the bootstrap root page has an authenticated session.

    // When: the server page resolves and renders.
    render(await HomePage())

    // Then: assistive technology can identify the app and its title.
    const main = await screen.findByRole("main")
    expect(main).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible()
    expect(screen.getByRole("status")).toBeVisible()
  })

  it("renders Korean-only visible copy in the root shell", async () => {
    // Given: the Korean-only bootstrap contract.

    // When: the server page resolves and renders.
    render(await HomePage())

    // Then: its visible application copy contains Korean and no Latin letters.
    const main = await screen.findByRole("main")
    expect(main).toHaveTextContent(/[가-힣]/u)
    expect(main).not.toHaveTextContent(/[A-Za-z]/u)
  })
})
