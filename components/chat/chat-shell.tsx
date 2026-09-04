"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { PlusIcon } from "lucide-react"
import { m, useReducedMotion } from "motion/react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import { Message, MessageStatus } from "@/components/ai-elements/message"
import {
  REDUCED_OPACITY_TRANSITION,
  SPRING_LAYOUT,
  STATE_TRANSITION,
} from "@/components/motion/motion-tokens"
import { Button } from "@/components/ui/button"
import { fitImageRequestToBudget, omitPriorTurnImageBytes } from "@/lib/images/request-budget"

import { ChatComposer, type ChatComposerDraft } from "./chat-composer"
import { ChatMessage } from "./chat-message"
import { hasRenderableMessageContent } from "./chat-message-content"
import { type ChatShellProps, type Effort, MODEL_OPTIONS, type Model } from "./chat-types"
import { prepareSendMessagesRequest } from "./image-transport"

const defaultTransport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest,
})

const OFFLINE_FAILURE_MESSAGE = "네트워크 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요."
const PROVIDER_FAILURE_MESSAGE =
  "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요."

export function ChatShell({ imageNormalizer, transport = defaultTransport }: ChatShellProps) {
  const [effort, setEffort] = useState<Effort>("medium")
  const [model, setModel] = useState<Model>("gpt-5.6-sol")
  const [isStopped, setIsStopped] = useState(false)
  const [composerResetKey, setComposerResetKey] = useState(0)
  const reduceMotion = useReducedMotion()
  const scrollBodyRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const { error, messages, sendMessage, setMessages, status, stop } = useChat({ transport })
  const hasMessages = messages.length > 0
  const lastMessage = messages.at(-1)
  const hasEmptyAssistantResponse =
    status === "ready" &&
    lastMessage?.role === "assistant" &&
    !hasRenderableMessageContent(lastMessage)
  const terminalError =
    error === undefined
      ? undefined
      : error instanceof TypeError
        ? { code: "offline", message: OFFLINE_FAILURE_MESSAGE }
        : { code: "provider", message: PROVIDER_FAILURE_MESSAGE }

  useEffect(() => {
    const root = scrollBodyRef.current
    const target = endRef.current
    if (root === null || target === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedRef.current = entry?.isIntersecting ?? false
      },
      { root, threshold: 0.9 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (messages.length === 0 || pinnedRef.current) {
      const root = scrollBodyRef.current
      if (root !== null) root.scrollTop = root.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if ((error === undefined && !hasEmptyAssistantResponse) || !pinnedRef.current) return
    const root = scrollBodyRef.current
    if (root !== null) root.scrollTop = root.scrollHeight
  }, [error, hasEmptyAssistantResponse])

  const handleSubmit = async (draft: ChatComposerDraft) => {
    pinnedRef.current = true
    setIsStopped(false)
    if (draft.originals.length === 0) {
      void sendMessage({ text: draft.text }, { body: { effort, model } })
      return
    }

    const fitted = await fitImageRequestToBudget({
      originals: draft.originals,
      ...(imageNormalizer === undefined
        ? {}
        : { normalize: (files: readonly File[]) => imageNormalizer(files) }),
      buildRequest: (images) => ({
        effort,
        id: "x".repeat(64),
        messageId: "x".repeat(64),
        messages: omitPriorTurnImageBytes([
          ...messages,
          {
            id: "current-image-turn",
            role: "user",
            parts: [
              ...images,
              ...(draft.text.length > 0 ? [{ type: "text" as const, text: draft.text }] : []),
            ],
          },
        ]),
        model,
        trigger: "submit-message",
      }),
    })
    void sendMessage(
      draft.text.length > 0
        ? { files: [...fitted.images], text: draft.text }
        : { files: [...fitted.images] },
      { body: { effort, model } },
    )
  }

  const handleStop = () => {
    setIsStopped(true)
    void stop()
  }

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = MODEL_OPTIONS.find((option) => option.value === event.currentTarget.value)
    if (selected !== undefined) setModel(selected.value)
  }

  const handleNewChat = () => {
    void stop()
    setIsStopped(false)
    setMessages([])
    setComposerResetKey((current) => current + 1)
  }

  return (
    <m.main
      animate={{ opacity: 1, y: 0 }}
      aria-label="산후·신생아 의료 상담"
      className="relative grid h-[100dvh] max-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground"
      data-chat-state={hasMessages ? "active" : "empty"}
      data-motion-surface="screen"
      data-stream-stopped={isStopped ? "true" : "false"}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 1, y: 12 }}
      transition={{
        opacity: reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION,
        y: SPRING_LAYOUT,
      }}
    >
      <header className="relative z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <h1 className="m-0 text-sm font-medium text-foreground">비공개 의료 상담</h1>
          <select
            aria-label="모델"
            className="mt-1 min-h-11 min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-[color,background-color,border-color,box-shadow] duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            data-model-id={model}
            onChange={handleModelChange}
            value={model}
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button aria-label="새 대화" onClick={handleNewChat} variant="ghost">
          <PlusIcon aria-hidden="true" />새 대화
        </Button>
      </header>

      <Conversation aria-label="상담 대화" className="h-full min-h-0">
        <ConversationContent
          className={hasMessages ? "mx-auto w-full max-w-[calc(65ch+2rem)]" : "flex flex-col"}
          ref={scrollBodyRef}
        >
          {hasMessages ? (
            messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                streaming={
                  status === "streaming" &&
                  !isStopped &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))
          ) : (
            <ConversationEmptyState
              className="mb-auto pt-4"
              description={
                <>
                  <span className="block" data-semantic-phrase>
                    산후 회복이나 아기 돌봄에 관해{" "}
                  </span>
                  <span className="block" data-semantic-phrase>
                    궁금한 점을 적어 주세요.
                  </span>
                </>
              }
              title={
                <>
                  <span className="block" data-semantic-phrase>
                    무엇을 함께{" "}
                  </span>
                  <span className="block" data-semantic-phrase>
                    살펴볼까요?
                  </span>
                </>
              }
            />
          )}
          {status === "submitted" ? (
            <Message from="assistant" streaming>
              <MessageStatus>근거를 확인하고 있어요.</MessageStatus>
            </Message>
          ) : null}
          {terminalError !== undefined ? (
            <MessageStatus data-chat-error-code={terminalError.code} tone="error">
              {terminalError.code === "offline" ? (
                <>
                  네트워크 연결이 끊겼습니다. 연결을 확인한 뒤{" "}
                  <span data-semantic-phrase>다시 시도해 주세요.</span>
                </>
              ) : (
                terminalError.message
              )}
            </MessageStatus>
          ) : null}
          {hasEmptyAssistantResponse ? (
            <MessageStatus tone="error">
              답변 내용이 비어 있습니다. 질문을 조금 더 구체적으로 보내 주세요.
            </MessageStatus>
          ) : null}
          <div aria-hidden="true" className="h-px w-full" ref={endRef} />
        </ConversationContent>
      </Conversation>

      <m.footer
        className={
          hasMessages
            ? "relative z-10 min-w-0 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 max-[319px]:py-0"
            : "absolute inset-x-4 top-1/2 z-10 min-w-0 -translate-y-1/2"
        }
        data-motion-surface="composer"
        data-placement={hasMessages ? "bottom" : "center"}
        data-testid="chat-composer-region"
        layout={reduceMotion ? false : "position"}
        transition={SPRING_LAYOUT}
      >
        <div className="mx-auto min-w-0 w-full max-w-[65ch]">
          <ChatComposer
            effort={effort}
            key={composerResetKey}
            {...(imageNormalizer === undefined ? {} : { normalize: imageNormalizer })}
            onEffortChange={setEffort}
            onStop={handleStop}
            onSubmit={handleSubmit}
            status={isStopped ? "ready" : status}
          />
        </div>
      </m.footer>
    </m.main>
  )
}
