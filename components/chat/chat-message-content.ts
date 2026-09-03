import type { FileUIPart, SourceUrlUIPart, UIMessage } from "ai"

import { parseSourceHref } from "@/components/ai-elements/source-url"

export function textFrom(message: UIMessage): string {
  return message.parts.reduce(
    (text, part) => (part.type === "text" ? `${text}${part.text}` : text),
    "",
  )
}

export function imagesFrom(message: UIMessage): readonly FileUIPart[] {
  return message.parts.filter(
    (part): part is FileUIPart => part.type === "file" && part.mediaType.startsWith("image"),
  )
}

export function sourcesFrom(message: UIMessage): readonly SourceUrlUIPart[] {
  return message.parts.filter(
    (part): part is SourceUrlUIPart =>
      part.type === "source-url" && parseSourceHref(part.url) !== null,
  )
}

export function hasRenderableMessageContent(message: UIMessage): boolean {
  return (
    textFrom(message).trim().length > 0 ||
    imagesFrom(message).length > 0 ||
    sourcesFrom(message).length > 0
  )
}
