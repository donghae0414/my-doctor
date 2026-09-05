"use client"

import type { UIMessage } from "ai"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
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

type AssistantMessageResponseProps = {
  readonly messageId: string
  readonly receivedText: string
  readonly streaming: boolean
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function splitGraphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment)
}

function revealDelay(queueLength: number): number {
  return Math.max(5, 30 - 5 * Math.max(0, queueLength - 2))
}

function AssistantMessageResponse({
  messageId,
  receivedText,
  streaming,
}: AssistantMessageResponseProps) {
  const reduceMotion = useReducedMotion() ?? false
  const revealActive = streaming && !reduceMotion
  const [displayedText, setDisplayedText] = useState("")
  const displayedTextRef = useRef("")
  const previousMessageIdRef = useRef(messageId)
  const previousReceivedTextRef = useRef("")
  const queueRef = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const revealActiveRef = useRef(revealActive)
  const scheduleNextRef = useRef<() => void>(() => undefined)

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  scheduleNextRef.current = () => {
    const queueLength = queueRef.current.length
    if (!revealActiveRef.current || timerRef.current !== null || queueLength === 0) return

    const generation = generationRef.current
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (!revealActiveRef.current || generation !== generationRef.current) return

      const next = queueRef.current.shift()
      if (next === undefined) return
      displayedTextRef.current += next
      setDisplayedText(displayedTextRef.current)
      scheduleNextRef.current()
    }, revealDelay(queueLength))
  }

  useEffect(() => {
    revealActiveRef.current = revealActive
    const previousReceivedText = previousReceivedTextRef.current
    const shouldReset =
      previousMessageIdRef.current !== messageId || !receivedText.startsWith(previousReceivedText)

    if (!revealActive) {
      generationRef.current += 1
      clearTimer()
      queueRef.current = []
      displayedTextRef.current = receivedText
      previousMessageIdRef.current = messageId
      previousReceivedTextRef.current = receivedText
      setDisplayedText(receivedText)
      return
    }

    if (shouldReset) {
      generationRef.current += 1
      clearTimer()
      queueRef.current = []
      displayedTextRef.current = ""
      previousMessageIdRef.current = messageId
      previousReceivedTextRef.current = ""
      setDisplayedText("")
    }

    const currentPreviousText = previousReceivedTextRef.current
    const suffix = receivedText.slice(currentPreviousText.length)
    previousMessageIdRef.current = messageId
    previousReceivedTextRef.current = receivedText
    if (suffix.length === 0) {
      scheduleNextRef.current()
      return
    }

    const incoming = splitGraphemes(suffix)
    if (queueRef.current.length === 0) {
      const first = incoming.shift()
      if (first !== undefined) {
        displayedTextRef.current += first
        setDisplayedText(displayedTextRef.current)
      }
    }
    queueRef.current.push(...incoming)
    scheduleNextRef.current()
  }, [messageId, receivedText, revealActive, clearTimer])

  useEffect(
    () => () => {
      generationRef.current += 1
      clearTimer()
    },
    [clearTimer],
  )

  const responseText = revealActive ? displayedText : receivedText

  return (
    <MessageResponse
      className="[&_*]:!text-foreground"
      mode={revealActive ? "streaming" : "static"}
    >
      {responseText}
    </MessageResponse>
  )
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
          className={from === "user" ? "whitespace-pre-wrap !bg-muted !text-foreground" : undefined}
        >
          {from === "assistant" ? (
            <AssistantMessageResponse
              messageId={message.id}
              receivedText={text}
              streaming={streaming}
            />
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
