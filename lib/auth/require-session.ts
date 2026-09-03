import { cookies } from "next/headers"

import { parseServerEnvironment } from "../env"
import {
  SESSION_COOKIE_NAME,
  type SessionAuthorizationResult,
  verifySessionToken,
} from "./session"

export async function requireSession(): Promise<SessionAuthorizationResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const environment = parseServerEnvironment(process.env)

  return verifySessionToken(token, environment.AUTH_SECRET)
}
