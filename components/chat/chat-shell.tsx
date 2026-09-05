"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { PlusIcon } from "lucide-react"
import { m, useReducedMotion } from "motion/react"
import { type UIEvent, useEffect, useRef, useState } from "react"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
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
import { hasRenderableMessageContent, textFrom } from "./chat-message-content"
import type { ChatShellProps, Effort, Model } from "./chat-types"
import { prepareSendMessagesRequest } from "./image-transport"

const defaultTransport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest,
})

const OFFLINE_FAILURE_MESSAGE = "네트워크 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요."
const PROVIDER_FAILURE_MESSAGE =
  "현재 의료 답변과 검색 근거를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요."

const PENDING_PHRASES = [
  "말씀해 주신 내용을 바탕으로 답변을 준비하고 있어요.",
  "기다리시는 동안 잠시 편하게 계셔 주세요.",
  "이해하기 쉽게 안내해 드릴게요.",
] as const

function PendingResponse() {
  const [active, setActive] = useState(0)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const interval = setInterval(
      () => setActive((current) => (current + 1) % PENDING_PHRASES.length),
      4000,
    )
    return () => clearInterval(interval)
  }, [])

  return (
    <Message from="assistant" streaming>
      <div data-pending-response="">
        <MessageStatus className="sr-only">{PENDING_PHRASES[0]}</MessageStatus>
        <div aria-hidden="true" className="grid text-sm leading-5 text-muted-foreground">
          {PENDING_PHRASES.map((phrase, index) => (
            <span
              className="col-start-1 row-start-1 break-keep [overflow-wrap:anywhere]"
              data-active={index === active ? "true" : "false"}
              data-pending-phrase={index}
              key={phrase}
              style={{
                opacity: index === active ? 1 : 0,
                transition: reduceMotion ? "none" : "opacity 200ms ease-out",
              }}
            >
              {phrase}
            </span>
          ))}
        </div>
      </div>
    </Message>
  )
}

export function ChatShell({ imageNormalizer, transport = defaultTransport }: ChatShellProps) {
  const [effort, setEffort] = useState<Effort>("medium")
  const [model, setModel] = useState<Model>("gpt-5.6-sol")
  const [isStopped, setIsStopped] = useState(false)
  const [composerResetKey, setComposerResetKey] = useState(0)
  const [hasAttachmentPreviews, setHasAttachmentPreviews] = useState(false)
  const reduceMotion = useReducedMotion()
  const scrollBodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const [isDetached, setIsDetached] = useState(false)
  const { error, messages, sendMessage, setMessages, status, stop } = useChat({ transport })
  const hasMessages = messages.length > 0
  const showEmptyState = !hasMessages && !hasAttachmentPreviews
  const lastMessage = messages.at(-1)
  const showPending =
    (status === "submitted" || status === "streaming") &&
    !isStopped &&
    error === undefined &&
    (lastMessage?.role !== "assistant" || textFrom(lastMessage).trim().length === 0)
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
    const content = contentRef.current
    if (root === null || content === null || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return
      root.scrollTop = root.scrollHeight
      lastScrollTopRef.current = root.scrollTop
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const root = event.currentTarget
    const bottom = Math.max(0, root.scrollHeight - root.clientHeight)
    if (root.scrollTop >= bottom - 2) {
      pinnedRef.current = true
      setIsDetached(false)
    } else if (root.scrollTop < Math.min(lastScrollTopRef.current, bottom)) {
      pinnedRef.current = false
      setIsDetached(true)
    }
    lastScrollTopRef.current = root.scrollTop
  }

  const handleSubmit = async (draft: ChatComposerDraft) => {
    pinnedRef.current = true
    setIsDetached(false)
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

  const handleNewChat = () => {
    void stop()
    setIsStopped(false)
    pinnedRef.current = true
    setIsDetached(false)
    setMessages([])
    setHasAttachmentPreviews(false)
    setComposerResetKey((current) => current + 1)
  }

  return (
    <m.main
      animate={{ opacity: 1, y: 0 }}
      aria-label="산후·신생아 의료 상담"
      className={
        hasMessages
          ? "relative grid h-[100dvh] max-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground"
          : "relative grid h-[100dvh] max-h-[100dvh] grid-rows-[minmax(min-content,1fr)_auto_minmax(min-content,1fr)] overflow-x-clip overflow-y-auto overscroll-contain bg-background text-foreground"
      }
      data-chat-state={hasMessages ? "active" : "empty"}
      data-motion-surface="screen"
      data-scroll-owner={hasMessages ? undefined : "empty-chat"}
      data-stream-stopped={isStopped ? "true" : "false"}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 1, y: 12 }}
      transition={{
        opacity: reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION,
        y: SPRING_LAYOUT,
      }}
    >
      <div
        className={
          hasMessages ? "contents" : "col-start-1 row-start-1 flex min-w-0 flex-col gap-4 pb-6"
        }
      >
        <header className="relative z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <h1 className="m-0 text-sm font-medium text-foreground">비공개 의료 상담</h1>
          </div>
          <Button aria-label="새 대화" onClick={handleNewChat} variant="ghost">
            <PlusIcon aria-hidden="true" />새 대화
          </Button>
        </header>
        {showEmptyState ? (
          <ConversationEmptyState
            className="mt-auto w-[calc(100%-2rem)] max-w-[65ch] p-0"
            description={null}
            title="산후 회복·아기 돌봄, 무엇이 궁금하세요?"
          />
        ) : null}
      </div>

      <Conversation
        aria-label="상담 대화"
        className={hasMessages ? "col-start-1 row-start-2 h-full min-h-0" : "hidden"}
      >
        <ConversationContent
          className={hasMessages ? "mx-auto w-full max-w-[calc(65ch+2rem)]" : "flex flex-col"}
          onScroll={handleScroll}
          ref={scrollBodyRef}
        >
          <div
            className="flow-root space-y-6 [overflow-anchor:none]"
            data-conversation-content=""
            ref={contentRef}
          >
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                streaming={
                  status === "streaming" &&
                  !isStopped &&
                  !showPending &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))}
            {showPending ? <PendingResponse /> : null}
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
            <div aria-hidden="true" className="h-px w-full" />
          </div>
        </ConversationContent>
        {isDetached ? (
          <ConversationScrollButton
            onClick={() => {
              pinnedRef.current = true
              setIsDetached(false)
            }}
            targetRef={scrollBodyRef}
          />
        ) : null}
      </Conversation>

      <m.footer
        className={
          hasMessages
            ? "relative z-10 min-w-0 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 max-[319px]:py-0"
            : "col-start-1 row-start-2 row-span-2 grid min-w-0 grid-rows-subgrid px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
        aria-label="의료 질문 작성 영역"
        data-motion-surface="composer"
        data-placement={hasMessages ? "bottom" : "center"}
        data-testid="chat-composer-region"
      >
        <div
          className={
            hasMessages
              ? "mx-auto my-auto grid min-w-0 w-full max-w-[65ch] shrink-0 gap-6"
              : "mx-auto row-span-2 grid min-w-0 w-full max-w-[65ch] grid-rows-subgrid"
          }
        >
          <m.div
            className={hasMessages ? undefined : "row-span-2 grid grid-rows-subgrid"}
            layout={reduceMotion ? false : "position"}
            transition={SPRING_LAYOUT}
          >
            <ChatComposer
              className={
                hasMessages
                  ? undefined
                  : "row-span-2 grid-rows-subgrid gap-0 [&>p]:mt-2 [&>p]:self-start"
              }
              effort={effort}
              key={composerResetKey}
              menuSide={hasMessages ? "top" : "bottom"}
              model={model}
              {...(imageNormalizer === undefined ? {} : { normalize: imageNormalizer })}
              onEffortChange={setEffort}
              onHasAttachmentPreviews={setHasAttachmentPreviews}
              onModelChange={setModel}
              onStop={handleStop}
              onSubmit={handleSubmit}
              status={status}
            />
          </m.div>
        </div>
      </m.footer>
    </m.main>
  )
}
