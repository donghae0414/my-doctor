import { describe, expect, it } from "vitest"

import {
  ServerEnvironmentError,
  parseServerEnvironment,
} from "./env"

const VALID_AUTH_SECRET = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
const VALID_ENVIRONMENT = {
  OPENAI_API_KEY: "openai-fixture",
  DOORLOCK_PASSWORD: "1234",
  AUTH_SECRET: VALID_AUTH_SECRET,
} as const

describe("parseServerEnvironment", () => {
  it("returns typed server values when the environment is valid", () => {
    // Given: all server values satisfy their boundary contracts.
    const source = VALID_ENVIRONMENT

    // When: the environment boundary parses the values.
    const result = parseServerEnvironment(source)

    // Then: the trusted values are preserved.
    expect(result).toEqual(source)
  })

  it.each(["1234", "123456789012"])(
    "accepts a %s numeric door-lock password at the documented boundaries",
    (password) => {
      // Given: a password on one inclusive length boundary.
      const source = { ...VALID_ENVIRONMENT, DOORLOCK_PASSWORD: password }

      // When: the environment boundary parses it.
      const result = parseServerEnvironment(source)

      // Then: the password remains available as a typed value.
      expect(result.DOORLOCK_PASSWORD).toBe(password)
    },
  )

  it.each(["123", "1234567890123", "12a4", "１２３４"])(
    "rejects an invalid door-lock password without exposing its value",
    (password) => {
      // Given: the door-lock password violates length or ASCII-digit rules.
      const source = { ...VALID_ENVIRONMENT, DOORLOCK_PASSWORD: password }

      // When: parsing is attempted at the server boundary.
      const captureError = () => parseServerEnvironment(source)

      // Then: one generic typed configuration failure is returned.
      expect(captureError).toThrow(ServerEnvironmentError)
      expect(captureError).toThrow("Server environment is invalid")
      expect(captureError).not.toThrow(password)
    },
  )

  it("rejects a noncanonical auth secret that decodes to the same bytes", () => {
    // Given: an alternate final character changes serialization but not decoded key bytes.
    const noncanonicalSecret = `${VALID_AUTH_SECRET.slice(0, -1)}9`
    const decode = (value: string) =>
      atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(44, "="))
    expect(decode(noncanonicalSecret)).toBe(decode(VALID_AUTH_SECRET))
    const source = { ...VALID_ENVIRONMENT, AUTH_SECRET: noncanonicalSecret }

    // When: the alternate encoding crosses the environment boundary.
    const captureError = () => parseServerEnvironment(source)

    // Then: decode-to-re-encode canonical equality is required.
    expect(captureError).toThrow(ServerEnvironmentError)
    expect(captureError).toThrow("Server environment is invalid")
  })

  it("rejects an auth secret shorter than 32 decoded bytes without exposing it", () => {
    // Given: a valid base64url value carrying fewer than 32 bytes.
    const shortSecret = "c2hvcnQ"
    const source = { ...VALID_ENVIRONMENT, AUTH_SECRET: shortSecret }

    // When: parsing is attempted at the server boundary.
    const captureError = () => parseServerEnvironment(source)

    // Then: the same generic typed configuration failure is returned.
    expect(captureError).toThrow(ServerEnvironmentError)
    expect(captureError).toThrow("Server environment is invalid")
    expect(captureError).not.toThrow(shortSecret)
  })

  it.each([
    {},
    { ...VALID_ENVIRONMENT, OPENAI_API_KEY: "" },
    { ...VALID_ENVIRONMENT, AUTH_SECRET: "not base64url!" },
  ])("rejects malformed environment input with an identical generic failure", (source) => {
    // Given: an incomplete, blank, or malformed environment source.
    const captureError = () => parseServerEnvironment(source)

    // When: each source is parsed and its error is captured.
    let captured: ServerEnvironmentError | undefined
    try {
      captureError()
    } catch (error) {
      if (error instanceof ServerEnvironmentError) {
        captured = error
      } else {
        throw error
      }
    }

    // Then: callers receive only the stable typed failure contract.
    expect(captured).toBeInstanceOf(ServerEnvironmentError)
    if (captured instanceof ServerEnvironmentError) {
      expect(captured).toMatchObject({
        name: "ServerEnvironmentError",
        message: "Server environment is invalid",
      })
      expect(Object.keys(captured)).toEqual(["name"])
    }
  })
})
