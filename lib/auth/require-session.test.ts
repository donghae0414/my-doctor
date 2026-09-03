import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { cookieGet, cookiesCall, verifySessionTokenCall } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookiesCall: vi.fn(),
  verifySessionTokenCall: vi.fn(),
}))

vi.mock("next/headers", () => ({ cookies: cookiesCall }))

vi.mock("./session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session")>()
  verifySessionTokenCall.mockImplementation(actual.verifySessionToken)
  return { ...actual, verifySessionToken: verifySessionTokenCall }
})

import { parseServerEnvironment } from "../env"
import { requireSession } from "./require-session"
import { SessionAuthorizationError, issueSessionToken } from "./session"

const ENVIRONMENT = {
  OPENAI_API_KEY: "openai-fixture",
  DOORLOCK_PASSWORD: "1234",
  AUTH_SECRET: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
} as const
const AUTH_SECRET = parseServerEnvironment(ENVIRONMENT).AUTH_SECRET

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", ENVIRONMENT.OPENAI_API_KEY)
  vi.stubEnv("DOORLOCK_PASSWORD", ENVIRONMENT.DOORLOCK_PASSWORD)
  vi.stubEnv("AUTH_SECRET", ENVIRONMENT.AUTH_SECRET)
  cookieGet.mockReset()
  cookiesCall.mockReset()
  cookiesCall.mockImplementation(async () => ({ get: cookieGet }))
  verifySessionTokenCall.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("requireSession", () => {
  it("reads and verifies a missing session exactly once", async () => {
    // Given: the request cookie store has no session cookie.
    cookieGet.mockReturnValue(undefined)

    // When: the shared session boundary authorizes the request.
    const result = await requireSession()

    // Then: one cookie read feeds exactly one real verifier call.
    expect(cookieGet).toHaveBeenCalledOnce()
    expect(cookieGet).toHaveBeenCalledWith("my-doctor-session")
    expect(verifySessionTokenCall).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledWith(undefined, AUTH_SECRET)
    expect(result).toEqual({
      authorized: false,
      error: new SessionAuthorizationError(),
    })
  })

  it("reads and verifies a valid session exactly once", async () => {
    // Given: the request carries a freshly issued session cookie.
    const token = await issueSessionToken(AUTH_SECRET)
    cookieGet.mockReturnValue({ name: "my-doctor-session", value: token })

    // When: the shared session boundary authorizes the request.
    const result = await requireSession()

    // Then: one cookie read feeds exactly one real verifier call.
    expect(cookieGet).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledWith(token, AUTH_SECRET)
    expect(result).toEqual({ authorized: true })
  })

  it("reads and verifies a tampered session exactly once", async () => {
    // Given: one byte of a valid cookie token is altered.
    const token = await issueSessionToken(AUTH_SECRET)
    const mutationIndex = 3
    const originalCharacter = token.at(mutationIndex)
    const replacementCharacter = originalCharacter === "A" ? "B" : "A"
    const tampered = `${token.slice(0, mutationIndex)}${replacementCharacter}${token.slice(mutationIndex + 1)}`
    cookieGet.mockReturnValue({ name: "my-doctor-session", value: tampered })

    // When: the shared session boundary authorizes the request.
    const result = await requireSession()

    // Then: one read and one verification return the generic failure.
    expect(cookieGet).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledWith(tampered, AUTH_SECRET)
    expect(result).toEqual({
      authorized: false,
      error: new SessionAuthorizationError(),
    })
    expect(JSON.stringify(result)).not.toContain(tampered)
  })

  it("returns the shared typed result for distinct page-shaped and API-shaped requests", async () => {
    // Given: future page and API adapters would supply distinct request cookie values.
    const validToken = await issueSessionToken(AUTH_SECRET)
    const pageCookieGet = vi.fn(() => undefined)
    const apiCookieGet = vi.fn(() => ({ name: "my-doctor-session", value: validToken }))
    cookiesCall
      .mockResolvedValueOnce({ get: pageCookieGet })
      .mockResolvedValueOnce({ get: apiCookieGet })

    // When: each caller-shaped request invokes the same checked-in boundary.
    const pageRequestResult = await requireSession()
    const apiRequestResult = await requireSession()

    // Then: each distinct source receives the shared result without adapter-specific logic here.
    expect(pageRequestResult).toEqual({
      authorized: false,
      error: new SessionAuthorizationError(),
    })
    expect(apiRequestResult).toEqual({ authorized: true })
    expect(pageCookieGet).toHaveBeenCalledOnce()
    expect(apiCookieGet).toHaveBeenCalledOnce()
    expect(verifySessionTokenCall).toHaveBeenCalledTimes(2)
  })
})
