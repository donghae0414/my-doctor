import { z } from "zod"

const SourceHrefSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === "http:" || protocol === "https:"
})

export type SourceHref = z.infer<typeof SourceHrefSchema>

export function parseSourceHref(value: string): SourceHref | null {
  const result = SourceHrefSchema.safeParse(value)
  return result.success ? result.data : null
}
