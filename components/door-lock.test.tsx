import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithMotion as render } from "@/tests/render-with-motion"

const { kyPost, refresh } = vi.hoisted(() => ({ kyPost: vi.fn(), refresh: vi.fn() }))

vi.mock("ky", () => ({ default: { post: kyPost } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import { DoorLock } from "./door-lock"

function response(status: number): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    headers: { "content-type": "application/json" },
    status,
  })
}

beforeEach(() => {
  kyPost.mockReset()
  refresh.mockReset()
  vi.restoreAllMocks()
})

describe("DoorLock", () => {
  it("submits masked touch input and refreshes into the authenticated chat", async () => {
    // Given: the unlock endpoint accepts the four-digit code.
    const user = userEvent.setup()
    kyPost.mockResolvedValue(response(204))
    render(<DoorLock />)

    // When: the code is entered through the keypad and submitted with *.
    for (const digit of ["1", "2", "3", "4"])
      await user.click(screen.getByRole("button", { name: digit }))
    const submitButton = screen.getByRole("button", { name: "접근 코드 제출" })
    expect(submitButton).toHaveTextContent("*")
    expect(screen.getByRole("button", { name: "한 자리 지우기" })).toHaveTextContent("#")
    await user.click(submitButton)

    // Then: the value stays masked, the endpoint receives only the code, and the root refreshes.
    expect(screen.getByLabelText("접근 코드")).toHaveAttribute("type", "password")
    expect(screen.getByTestId("masked-slots")).toHaveTextContent("••••")
    expect(screen.getAllByTestId("masked-digit")).toHaveLength(4)
    expect(screen.getAllByTestId("keypad-motion")).toHaveLength(12)
    expect(kyPost).toHaveBeenCalledWith(
      "/api/auth/unlock",
      expect.objectContaining({
        json: { code: "1234" },
        retry: 0,
        throwHttpErrors: false,
      }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it("supports digit keys, Backspace, pound deletion, and star submission", async () => {
    // Given: keyboard focus is on the accessible password input.
    const user = userEvent.setup()
    kyPost.mockResolvedValue(response(204))
    render(<DoorLock />)
    const input = screen.getByLabelText("접근 코드")
    input.focus()

    // When: digits are appended, Backspace and # remove one each, then * submits.
    await user.keyboard("12345{Backspace}6#*")

    // Then: the keyboard path submits the resulting four digits.
    expect(kyPost).toHaveBeenCalledWith(
      "/api/auth/unlock",
      expect.objectContaining({
        json: { code: "1234" },
      }),
    )
  })

  it.each([
    ["empty", []],
    ["wrong", ["9", "9", "9", "9"]],
    ["too long", Array.from({ length: 13 }, () => "9")],
  ])("announces one generic Korean error for %s submission", async (_name, digits) => {
    // Given: the endpoint rejects every non-empty invalid credential generically.
    const user = userEvent.setup()
    kyPost.mockResolvedValue(response(401))
    render(<DoorLock />)
    screen.getByLabelText("접근 코드").focus()

    // When: the invalid value is entered and submitted.
    for (const digit of digits) await user.keyboard(digit)
    await user.keyboard("{Enter}")

    // Then: no account, password, or rate-limit detail is exposed.
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("접근 코드를 확인해 주세요.")
    expect(alert).not.toHaveTextContent(/비밀번호|계정|잠금|429|시도/u)
    expect(screen.getByLabelText("접근 코드")).toHaveAttribute("aria-invalid", "true")
  })

  it("disables every mutation control while the request is pending", async () => {
    // Given: an unlock request remains pending until explicitly resolved.
    const user = userEvent.setup()
    let resolveRequest: ((value: Response) => void) | undefined
    kyPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    render(<DoorLock />)
    screen.getByLabelText("접근 코드").focus()
    await user.keyboard("1234")

    // When: submission starts.
    await user.keyboard("{Enter}")

    // Then: input and all twelve keypad controls are disabled and pending is announced.
    expect(screen.getByLabelText("접근 코드")).toBeDisabled()
    expect(screen.getAllByRole("button")).toHaveLength(12)
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("확인하고 있습니다.")

    resolveRequest?.(response(204))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it("replays one bounded shake for each failed submission and removes it for reduced motion", async () => {
    // Given: two consecutive submissions fail.
    const user = userEvent.setup()
    kyPost.mockResolvedValue(response(401))
    render(<DoorLock />)
    screen.getByLabelText("접근 코드").focus()
    await user.keyboard("9999{Enter}")
    const slots = await screen.findByTestId("masked-slots")

    // When: the same failure is submitted again.
    const firstKey = slots.getAttribute("data-shake-key")
    await user.keyboard("{Enter}")

    // Then: a single finite error animation is replayed from a new key.
    await waitFor(() => expect(slots.getAttribute("data-shake-key")).not.toBe(firstKey))
    expect(slots).toHaveAttribute("data-motion-surface", "error-shake")
    expect(slots).not.toHaveClass("animate-door-lock-error")
    expect(slots).not.toHaveClass("animate-infinite")
  })

  it("sanitizes direct input to twelve digits and keeps browser autocomplete off", () => {
    // Given: the accessible input receives mixed and overlong browser input.
    render(<DoorLock />)
    const input = screen.getByLabelText("접근 코드")

    // When: a direct input event crosses the component boundary.
    fireEvent.change(input, { target: { value: "12a345678901234" } })

    // Then: only twelve masked digits remain and autocomplete is disabled.
    expect(input).toHaveValue("123456789012")
    expect(input).toHaveAttribute("autocomplete", "off")
    expect(screen.getByTestId("masked-slots")).toHaveTextContent("••••••••••••")
  })
})
