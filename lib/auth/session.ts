import { z } from "zod"

import type { AuthSecret } from "../env"
import {
  decodeBase64Url,
  decodeCanonicalBase64Url,
  encodeBase64Url,
} from "./base64url"

const TOKEN_VERSION = "v1" as const
const OPAQUE_BYTES = 32 as const
const TokenComponentSchema = z.string().refine((value) => {
  const decoded = decodeCanonicalBase64Url(value)
  return decoded !== undefined && decoded.byteLength === OPAQUE_BYTES
})
const SessionTokenPartsSchema = z.tuple([
  z.literal(TOKEN_VERSION),
  TokenComponentSchema,
  TokenComponentSchema,
])
const SessionTokenSchema = z
  .string()
  .refine((value) => SessionTokenPartsSchema.safeParse(value.split(".")).success)
  .brand<"SessionToken">()

export const SESSION_COOKIE_NAME = "my-doctor-session" as const

export type SessionToken = z.infer<typeof SessionTokenSchema>
export type SessionAuthorizationResult =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly error: SessionAuthorizationError }
export type SessionCookieOptions = {
  readonly httpOnly: true
  readonly sameSite: "strict"
  readonly path: "/"
  readonly secure: boolean
}

export class SessionAuthorizationError extends Error {
  readonly name = "SessionAuthorizationError"

  constructor() {
    super("Unauthorized")
  }
}

async function importHmacKey(secret: AuthSecret): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    decodeBase64Url(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

export async function issueSessionToken(secret: AuthSecret): Promise<SessionToken> {
  const nonce = encodeBase64Url(crypto.getRandomValues(new Uint8Array(OPAQUE_BYTES)))
  const signedValue = `${TOKEN_VERSION}.${nonce}`
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    new TextEncoder().encode(signedValue),
  )

  return SessionTokenSchema.parse(`${signedValue}.${encodeBase64Url(new Uint8Array(signature))}`)
}

export async function verifySessionToken(
  token: string | undefined,
  secret: AuthSecret,
): Promise<SessionAuthorizationResult> {
  const parsed = SessionTokenPartsSchema.safeParse(token?.split(".") ?? [])
  switch (parsed.success) {
    case false:
      return { authorized: false, error: new SessionAuthorizationError() }
    case true: {
      const [, nonce, signature] = parsed.data
      const verified = await crypto.subtle.verify(
        "HMAC",
        await importHmacKey(secret),
        decodeBase64Url(signature),
        new TextEncoder().encode(`${TOKEN_VERSION}.${nonce}`),
      )

      if (!verified) {
        return { authorized: false, error: new SessionAuthorizationError() }
      }

      return { authorized: true }
    }
    default: {
      const exhaustive: never = parsed
      return exhaustive
    }
  }
}

export function getSessionCookieOptions(runtime: string | undefined): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: runtime === "production",
  }
}
