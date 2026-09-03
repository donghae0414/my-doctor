import { AuthenticatedSurface } from "@/components/auth/authenticated-surface"
import { DoorLock } from "@/components/door-lock"
import { requireSession } from "@/lib/auth/require-session"

export default async function HomePage() {
  const authorization = await requireSession()

  switch (authorization.authorized) {
    case false:
      return <DoorLock />
    case true:
      return <AuthenticatedSurface />
    default: {
      const exhaustive: never = authorization
      return exhaustive
    }
  }
}
