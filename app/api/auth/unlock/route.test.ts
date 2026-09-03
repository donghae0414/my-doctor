import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { cookieSet, cookiesCall } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookiesCall: vi.fn(),
}))

vi.mock("next/headers", () => ({ cookies: cookiesCall }))

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session"
import { parseServerEnvironment } from "@/lib/env"
import { POST } from "./route"

const ENVIRONMENT = {
  OPENAI_API_KEY: "openai-fixture",
  DOORLOCK_PASSWORD: "1234",
  AUTH_SECRET: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
} as const

function unlockRequest(body: string): Request {
  return new Request("http://localhost/api/auth/unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", ENVIRONMENT.OPENAI_API_KEY)
  vi.stubEnv("DOORLOCK_PASSWORD", ENVIRONMENT.DOORLOCK_PASSWORD)
  vi.stubEnv("AUTH_SECRET", ENVIRONMENT.AUTH_SECRET)
  vi.stubEnv("NODE_ENV", "test")
  cookieSet.mockReset()
  cookiesCall.mockReset()
  cookiesCall.mockResolvedValue({ set: cookieSet })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("POST /api/auth/unlock", () => {
  it("sets a signed browser-session cookie and returns 204 when the code is correct", async () => {
    // Given: a well-formed request containing the configured digit code.
    const request = unlockRequest(JSON.stringify({ code: ENVIRONMENT.DOORLOCK_PASSWORD }))

    // When: the unlock endpoint receives the request.
    const response = await POST(request)

    // Then: it returns no content and sets Todo 4's verifiable nonpersistent cookie.
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(cookieSet).toHaveBeenCalledOnce()
    const [name, token, options] = cookieSet.mock.calls[0] ?? []
    expect(name).toBe(SESSION_COOKIE_NAME)
    expect(typeof token).toBe("string")
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: false,
    })
    expect(options).not.toHaveProperty("expires")
    expect(options).not.toHaveProperty("maxAge")
    expect(
      await verifySessionToken(
        typeof token === "string" ? token : undefined,
        parseServerEnvironment(ENVIRONMENT).AUTH_SECRET,
      ),
    ).toEqual({ authorized: true })
  })

  it("uses a cryptographic verification operation instead of a direct credential comparison", async () => {
    // Given: a correct parsed credential and an observable Web Crypto verifier.
    const cryptoVerify = vi.spyOn(crypto.subtle, "verify")
    const request = unlockRequest(JSON.stringify({ code: ENVIRONMENT.DOORLOCK_PASSWORD }))

    // When: the credential is checked.
    await POST(request)

    // Then: Web Crypto performs the safe comparison.
    expect(cryptoVerify).toHaveBeenCalledOnce()
  })

  it.each([
    ["non-digit code", JSON.stringify({ code: "12#4" })],
    ["overlong digit code", JSON.stringify({ code: "1234567890123" })],
    ["wrong code type", JSON.stringify({ code: 1234 })],
    ["malformed JSON", "{"],
  ])("returns a redacted 400 for %s", async (_caseName, body) => {
    // Given: a malformed credential request.
    const request = unlockRequest(body)

    // When: the endpoint parses the boundary input.
    const response = await POST(request)

    // Then: it rejects the request without setting a session or leaking details.
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid request" })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it("returns the same generic 401 body for wrong and missing codes", async () => {
    // Given: one incorrect digit code and one absent code.
    const requests = [
      unlockRequest(JSON.stringify({ code: "9999" })),
      unlockRequest(JSON.stringify({})),
    ]

    // When: both requests are submitted.
    const responses = await Promise.all(requests.map(POST))
    const bodies = await Promise.all(responses.map((response) => response.text()))

    // Then: both failures are indistinguishable and never establish a session.
    expect(responses.map((response) => response.status)).toEqual([401, 401])
    expect(bodies[0]).toBe(bodies[1])
    expect(JSON.parse(bodies[0] ?? "")).toEqual({ error: "Unauthorized" })
    expect(bodies.join(" ")).not.toContain(ENVIRONMENT.DOORLOCK_PASSWORD)
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it("never rate-limits or locks out after 20 consecutive failures", async () => {
    // Given: twenty independent incorrect digit-code requests.
    const requests = Array.from({ length: 20 }, () =>
      unlockRequest(JSON.stringify({ code: "9999" })),
    )

    // When: every failure and then a correct request are submitted consecutively.
    const responses = []
    for (const request of requests) {
      responses.push(await POST(request))
    }
    const responseAfterFailures = await POST(
      unlockRequest(JSON.stringify({ code: ENVIRONMENT.DOORLOCK_PASSWORD })),
    )

    // Then: failures remain stateless 401s and cannot lock out the correct request.
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(401))
    expect(new Set(await Promise.all(responses.map((response) => response.text())))).toEqual(
      new Set([JSON.stringify({ error: "Unauthorized" })]),
    )
    expect(responseAfterFailures.status).toBe(204)
    expect(cookieSet).toHaveBeenCalledOnce()
  })
})
