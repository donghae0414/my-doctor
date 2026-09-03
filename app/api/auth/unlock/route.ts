import { cookies } from "next/headers"
import { z } from "zod"
import { getSessionCookieOptions, issueSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session"
import { parseServerEnvironment } from "@/lib/env"

const UnlockRequestSchema = z
  .strictObject({
    code: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
  })
  .readonly()

const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const
const TEXT_ENCODER = new TextEncoder()
const UNAUTHORIZED_RESPONSE = { error: "Unauthorized" } as const
const INVALID_REQUEST_RESPONSE = { error: "Invalid request" } as const
const COMPARISON_MESSAGE = TEXT_ENCODER.encode("my-doctor-door-lock-v1")

export async function POST(request: Request): Promise<Response> {
  let input: unknown
  try {
    input = await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 })
    }
    throw error
  }

  const parsed = UnlockRequestSchema.safeParse(input)
  switch (parsed.success) {
    case false:
      return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 })
    case true:
      break
    default: {
      const exhaustive: never = parsed
      return exhaustive
    }
  }

  const environment = parseServerEnvironment(process.env)
  if (parsed.data.code === undefined) {
    return Response.json(UNAUTHORIZED_RESPONSE, { status: 401 })
  }

  const [configuredKey, candidateKey] = await Promise.all([
    crypto.subtle.importKey(
      "raw",
      TEXT_ENCODER.encode(environment.DOORLOCK_PASSWORD),
      HMAC_ALGORITHM,
      false,
      ["sign"],
    ),
    crypto.subtle.importKey("raw", TEXT_ENCODER.encode(parsed.data.code), HMAC_ALGORITHM, false, [
      "verify",
    ]),
  ])
  const configuredSignature = await crypto.subtle.sign(
    HMAC_ALGORITHM,
    configuredKey,
    COMPARISON_MESSAGE,
  )
  const matches = await crypto.subtle.verify(
    HMAC_ALGORITHM,
    candidateKey,
    configuredSignature,
    COMPARISON_MESSAGE,
  )

  if (!matches) {
    return Response.json(UNAUTHORIZED_RESPONSE, { status: 401 })
  }

  const token = await issueSessionToken(environment.AUTH_SECRET)
  const cookieStore = await cookies()
  const cookieEnvironment = process.env["PLAYWRIGHT_TEST"] === "1" ? "test" : process.env.NODE_ENV
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(cookieEnvironment))

  return new Response(null, { status: 204 })
}
