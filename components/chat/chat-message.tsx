import type { UIMessage } from "ai"
import { Attachment, Attachments } from "@/components/ai-elements/attachments"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources"
import {
  hasRenderableMessageContent,
  imagesFrom,
  sourcesFrom,
  textFrom,
} from "@/components/chat/chat-message-content"

type ChatMessageProps = {
  readonly message: UIMessage
  readonly streaming?: boolean
}

export function ChatMessage({ message, streaming = false }: ChatMessageProps) {
  if (message.role === "system" || !hasRenderableMessageContent(message)) return null
  const from = message.role === "user" ? "user" : "assistant"
  const text = textFrom(message)
  const images = imagesFrom(message)
  const sources = sourcesFrom(message)

  return (
    <Message from={from} streaming={streaming}>
      {images.length > 0 ? (
        <Attachments className="w-full max-w-[65ch]">
          {images.map((image, index) => (
            <Attachment
              alt={image.filename ?? "상담 첨부 이미지"}
              key={image.url}
              motionIndex={index}
              name={image.filename ?? "첨부 이미지"}
              preview={image.url}
            />
          ))}
        </Attachments>
      ) : null}
      {text.length > 0 ? (
        <MessageContent
          className={from === "user" ? "!bg-muted !text-foreground" : "!text-foreground"}
        >
          {from === "assistant" ? (
            <MessageResponse className="[&_*]:!text-foreground">{text}</MessageResponse>
          ) : (
            text
          )}
        </MessageContent>
      ) : null}
      {sources.length > 0 ? (
        <Sources>
          <SourcesTrigger className="!text-foreground" count={sources.length} />
          <SourcesContent>
            {sources.map((source, index) => (
              <Source
                href={source.url}
                key={source.sourceId}
                motionIndex={index}
                title={source.title ?? "의료 근거 자료"}
              />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}
    </Message>
  )
}
