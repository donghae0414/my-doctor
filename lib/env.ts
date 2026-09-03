import { z } from "zod"

import { decodeCanonicalBase64Url } from "./auth/base64url"

export const AUTH_SECRET_MIN_BYTES = 32 as const

const AuthSecretSchema = z
  .string()
  .refine((value) => {
    const decoded = decodeCanonicalBase64Url(value)
    return decoded !== undefined && decoded.byteLength >= AUTH_SECRET_MIN_BYTES
  })
  .brand<"AuthSecret">()

const ServerEnvironmentSchema = z
  .object({
    OPENAI_API_KEY: z.string().trim().min(1),
    DOORLOCK_PASSWORD: z.string().regex(/^\d{4,12}$/),
    AUTH_SECRET: AuthSecretSchema,
  })
  .readonly()

export type AuthSecret = z.infer<typeof AuthSecretSchema>
export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>
type EnvironmentSource = Readonly<Record<string, string | undefined>>

/**
 * AUTH_SECRET must be at least 32 random bytes encoded as unpadded base64url.
 * Generate it from a cryptographically secure source, for example:
 * `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.
 */
export class ServerEnvironmentError extends Error {
  readonly name = "ServerEnvironmentError"

  constructor() {
    super("Server environment is invalid")
  }
}

export function parseServerEnvironment(source: EnvironmentSource): ServerEnvironment {
  const result = ServerEnvironmentSchema.safeParse(source)

  switch (result.success) {
    case false:
      throw new ServerEnvironmentError()
    case true:
      return result.data
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}
