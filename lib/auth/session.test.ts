import { afterEach, describe, expect, it, vi } from "vitest"

import { parseServerEnvironment } from "../env"
import {
  SESSION_COOKIE_NAME,
  SessionAuthorizationError,
  getSessionCookieOptions,
  issueSessionToken,
  verifySessionToken,
} from "./session"

const AUTH_SECRET = parseServerEnvironment({
  OPENAI_API_KEY: "openai-fixture",
  DOORLOCK_PASSWORD: "1234",
  AUTH_SECRET: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
}).AUTH_SECRET
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

class SessionTestFixtureError extends Error {
  readonly name = "SessionTestFixtureError"
}

function makeEquivalentNoncanonicalEncoding(value: string): string {
  const finalCharacter = value.at(-1)
  const finalIndex = finalCharacter === undefined ? -1 : BASE64URL_ALPHABET.indexOf(finalCharacter)
  const replacement = BASE64URL_ALPHABET.at(finalIndex + 1)
  if (finalIndex < 0 || finalIndex % 4 !== 0 || replacement === undefined) {
    throw new SessionTestFixtureError("Expected a canonical 32-byte base64url fixture")
  }
  return `${value.slice(0, -1)}${replacement}`
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("session tokens", () => {
  it("issues an opaque versioned token that verifies with Web Crypto HMAC", async () => {
    // Given: a parsed 32-byte authentication secret.
    const secret = AUTH_SECRET

    // When: a new opaque session token is issued and verified.
    const token = await issueSessionToken(secret)
    const result = await verifySessionToken(token, secret)

    // Then: the token has only its version and opaque cryptographic material.
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/)
    expect(result).toEqual({ authorized: true })
  })

  it("rejects a one-byte token mutation with a generic typed failure", async () => {
    // Given: a valid token with one encoded nonce byte changed.
    const token = await issueSessionToken(AUTH_SECRET)
    const mutationIndex = 3
    const originalCharacter = token.at(mutationIndex)
    const replacementCharacter = originalCharacter === "A" ? "B" : "A"
    const tampered = `${token.slice(0, mutationIndex)}${replacementCharacter}${token.slice(mutationIndex + 1)}`

    // When: the tampered token is verified.
    const result = await verifySessionToken(tampered, AUTH_SECRET)

    // Then: authorization fails without returning token details.
    expect(result).toEqual({
      authorized: false,
      error: new SessionAuthorizationError(),
    })
    expect(JSON.stringify(result)).not.toContain(tampered)
  })

  it.each(["nonce", "signature"] as const)(
    "rejects an equivalent-decoding noncanonical %s before cryptographic verification",
    async (component) => {
      // Given: one token component has alternate serialized bits but identical decoded bytes.
      const token = await issueSessionToken(AUTH_SECRET)
      const [version, nonce, signature] = token.split(".")
      if (version === undefined || nonce === undefined || signature === undefined) {
        throw new SessionTestFixtureError("Expected three token components")
      }
      let canonicalComponent: string
      let tampered: string
      switch (component) {
        case "nonce":
          canonicalComponent = nonce
          tampered = `${version}.${makeEquivalentNoncanonicalEncoding(nonce)}.${signature}`
          break
        case "signature":
          canonicalComponent = signature
          tampered = `${version}.${nonce}.${makeEquivalentNoncanonicalEncoding(signature)}`
          break
        default: {
          const exhaustive: never = component
          throw new SessionTestFixtureError(`Unexpected component: ${exhaustive}`)
        }
      }
      const noncanonicalComponent = makeEquivalentNoncanonicalEncoding(canonicalComponent)
      const decode = (value: string) =>
        atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(44, "="))
      expect(decode(noncanonicalComponent)).toBe(decode(canonicalComponent))
      const cryptoVerify = vi.spyOn(crypto.subtle, "verify")

      // When: the noncanonical serialized token is verified.
      const result = await verifySessionToken(tampered, AUTH_SECRET)

      // Then: parsing rejects it before HMAC verification can normalize the bytes.
      expect(result).toEqual({
        authorized: false,
        error: new SessionAuthorizationError(),
      })
      expect(cryptoVerify).not.toHaveBeenCalled()
    },
  )

  it("rejects an unsupported token version with the same generic failure", async () => {
    // Given: a structurally plausible token carrying an unsupported version.
    const token = await issueSessionToken(AUTH_SECRET)
    const wrongVersion = `v2${token.slice(2)}`

    // When: the token is verified.
    const result = await verifySessionToken(wrongVersion, AUTH_SECRET)

    // Then: callers receive the generic typed authorization failure.
    expect(result).toEqual({
      authorized: false,
      error: new SessionAuthorizationError(),
    })
  })

  it.each([undefined, "", "malformed", "v1.a.b"])(
    "rejects malformed token input without throwing or logging",
    async (token) => {
      // Given: absent or malformed cookie material.
      const secret = AUTH_SECRET

      // When: the untrusted token is verified.
      const result = await verifySessionToken(token, secret)

      // Then: malformed input follows the generic failure path.
      expect(result).toEqual({
        authorized: false,
        error: new SessionAuthorizationError(),
      })
    },
  )
})

describe("session cookie contract", () => {
  it("uses an HttpOnly strict nonpersistent cookie in development", () => {
    // Given: a non-production runtime.
    const runtime = "development"

    // When: the session cookie options are selected.
    const options = getSessionCookieOptions(runtime)

    // Then: the exact browser-session cookie contract is returned.
    expect(SESSION_COOKIE_NAME).toBe("my-doctor-session")
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: false,
    })
    expect(options).not.toHaveProperty("expires")
    expect(options).not.toHaveProperty("maxAge")
  })

  it("enables Secure only in production without making the cookie persistent", () => {
    // Given: the production runtime.
    const runtime = "production"

    // When: the session cookie options are selected.
    const options = getSessionCookieOptions(runtime)

    // Then: only the transport protection differs.
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: true,
    })
    expect(options).not.toHaveProperty("expires")
    expect(options).not.toHaveProperty("maxAge")
  })
})
