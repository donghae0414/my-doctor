"use client"

import { m, useReducedMotion } from "motion/react"
import type { ComponentProps } from "react"
import { Streamdown } from "streamdown"

import { REDUCED_OPACITY_TRANSITION, STATE_TRANSITION } from "@/components/motion/motion-tokens"
import { cn } from "@/lib/utils"

/** Registry source: https://registry.ai-sdk.dev/message.json */
export type MessageProps = ComponentProps<typeof m.article> & {
  readonly from: "assistant" | "user"
  readonly streaming?: boolean
}

export function Message({ className, from, streaming = false, ...props }: MessageProps) {
  const reduceMotion = useReducedMotion()
  const isInstant = streaming

  return (
    <m.article
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group flex w-full flex-col gap-2",
        from === "user" ? "items-end" : "items-start",
        className,
      )}
      data-from={from}
      data-motion-state={isInstant ? "instant" : reduceMotion ? "reduced" : "entry"}
      data-streaming={streaming ? "true" : "false"}
      initial={isInstant ? false : reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      transition={
        isInstant
          ? { duration: 0 }
          : {
              opacity: reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION,
              y: STATE_TRANSITION,
            }
      }
      {...props}
    />
  )
}

export type MessageContentProps = ComponentProps<"div">

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "break-keep max-w-[min(85%,65ch)] [overflow-wrap:anywhere] rounded-lg px-4 py-3 max-[319px]:max-w-full max-[319px]:px-3 text-base leading-6 text-foreground group-data-[from=user]:bg-secondary group-data-[from=user]:text-secondary-foreground group-data-[from=assistant]:bg-card group-data-[from=assistant]:shadow-xs",
        className,
      )}
      {...props}
    />
  )
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>

export function MessageResponse({ className, ...props }: MessageResponseProps) {
  return (
    <Streamdown
      className={cn(
        "size-full [&_a]:overflow-wrap-anywhere [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_p]:my-0 [&_p+p]:mt-3",
        className,
      )}
      {...props}
    />
  )
}

export type MessageStatusProps = ComponentProps<"p"> & {
  readonly tone?: "error" | "loading"
}

export function MessageStatus({ className, tone = "loading", ...props }: MessageStatusProps) {
  return (
    <p
      className={cn(
        "m-0 rounded-md px-3 py-2 text-sm",
        tone === "error"
          ? "border border-destructive bg-card text-foreground"
          : "bg-muted text-foreground",
        className,
      )}
      data-tone={tone}
      role="status"
      {...props}
    />
  )
}
