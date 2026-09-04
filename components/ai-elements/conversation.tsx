"use client"

import { ArrowDownIcon, MessageCircleIcon } from "lucide-react"
import type { ComponentProps, ReactNode, RefObject } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Registry-derived from AI Elements Conversation.
 * Registry source: https://registry.ai-sdk.dev/conversation.json
 */
export type ConversationProps = ComponentProps<"section">

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <section
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      role="log"
      {...props}
    />
  )
}

export type ConversationContentProps = ComponentProps<"div">

export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-6 overflow-x-clip overflow-y-auto overscroll-contain px-4 py-6",
        className,
      )}
      data-scroll-owner="conversation"
      {...props}
    />
  )
}

type ConversationEmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  readonly description?: ReactNode
  readonly icon?: ReactNode
  readonly title?: ReactNode
}

export function ConversationEmptyState({
  className,
  description = "질문을 보내면 상담 내용이 여기에 표시됩니다.",
  icon = <MessageCircleIcon aria-hidden="true" />,
  title = "아직 대화가 없어요",
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto my-0 flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center text-muted-foreground",
        className,
      )}
      data-empty-state="conversation"
      {...props}
    >
      <span className="grid size-11 place-items-center rounded-lg bg-muted text-foreground">
        {icon}
      </span>
      <p className="m-0 text-lg font-semibold text-foreground">{title}</p>
      {description === null ? null : <p className="m-0 text-sm leading-5">{description}</p>}
    </div>
  )
}

type ConversationScrollButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  readonly targetRef: RefObject<HTMLElement | null>
}

export function ConversationScrollButton({
  className,
  targetRef,
  ...props
}: ConversationScrollButtonProps) {
  return (
    <Button
      aria-label="최신 메시지로 이동"
      className={cn("absolute inset-inline-end-4 bottom-4 rounded-full bg-popover", className)}
      onClick={() =>
        targetRef.current?.scrollTo({ behavior: "smooth", top: targetRef.current.scrollHeight })
      }
      size="icon"
      {...props}
    >
      <ArrowDownIcon aria-hidden="true" />
    </Button>
  )
}
