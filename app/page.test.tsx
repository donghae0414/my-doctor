import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { requireSessionCall } = vi.hoisted(() => ({ requireSessionCall: vi.fn() }))

vi.mock("@/lib/auth/require-session", () => ({ requireSession: requireSessionCall }))
vi.mock("@/components/door-lock", () => ({
  DoorLock: () => <main data-auth-state="locked">잠금 화면</main>,
}))
vi.mock("@/components/chat/chat-shell", () => ({
  ChatShell: () => <main data-auth-state="authenticated">상담 화면</main>,
}))

import { SessionAuthorizationError } from "@/lib/auth/session"
import HomePage from "./page"

beforeEach(() => {
  requireSessionCall.mockReset()
})

describe("HomePage authorization state", () => {
  it("renders the locked root when the session cookie is missing", async () => {
    // Given: the shared verifier rejects a missing cookie.
    requireSessionCall.mockResolvedValue({
      authorized: false,
      error: new SessionAuthorizationError(),
    })

    // When: the server-rendered root resolves its authorization state.
    render(await HomePage())

    // Then: only the locked state is exposed.
    const main = await screen.findByRole("main")
    expect(main).toHaveAttribute("data-auth-state", "locked")
    expect(main).toHaveTextContent("잠금 화면")
    expect(screen.queryByText("상담 화면")).not.toBeInTheDocument()
    expect(requireSessionCall).toHaveBeenCalledOnce()
  })

  it("renders the same locked root when the session cookie is tampered", async () => {
    // Given: Todo 4's shared verifier rejects a tampered cookie generically.
    requireSessionCall.mockResolvedValue({
      authorized: false,
      error: new SessionAuthorizationError(),
    })

    // When: the root resolves that authorization result.
    render(await HomePage())

    // Then: the page remains locked without exposing failure details.
    const main = await screen.findByRole("main")
    expect(main).toHaveAttribute("data-auth-state", "locked")
    expect(main).toHaveTextContent("잠금 화면")
    expect(main).not.toHaveTextContent("Unauthorized")
  })

  it("renders the authenticated root when the shared verifier accepts the cookie", async () => {
    // Given: Todo 4's shared verifier accepts a signed session cookie.
    requireSessionCall.mockResolvedValue({ authorized: true })

    // When: the root resolves that authorization result.
    render(await HomePage())

    // Then: the authenticated state is available without client-side secret material.
    const main = await screen.findByRole("main")
    expect(main).toHaveAttribute("data-auth-state", "authenticated")
    expect(main).toHaveTextContent("상담 화면")
    expect(screen.queryByText("잠금 화면")).not.toBeInTheDocument()
    expect(main).not.toHaveTextContent(/1234|DOORLOCK_PASSWORD/u)
    expect(requireSessionCall).toHaveBeenCalledOnce()
  })
})
