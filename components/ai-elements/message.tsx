"use client"

import { m, useReducedMotion } from "motion/react"
import Image from "next/image"
import type { ComponentProps, ReactNode } from "react"
import { Streamdown } from "streamdown"

import { REDUCED_OPACITY_TRANSITION, STATE_TRANSITION } from "@/components/motion/motion-tokens"
import { cn } from "@/lib/utils"

/** Registry source: https://registry.ai-sdk.dev/message.json */
export type MessageProps = Omit<ComponentProps<typeof m.article>, "children"> & {
  readonly children?: ReactNode
  readonly from: "assistant" | "user"
  readonly streaming?: boolean
}

export function Message({ children, className, from, streaming = false, ...props }: MessageProps) {
  const reduceMotion = useReducedMotion()
  const isInstant = streaming

  return (
    <m.article
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group w-full",
        from === "user" ? "flex flex-col items-end gap-2" : "relative flex flex-col gap-2",
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
    >
      {from === "assistant" ? (
        <>
          {streaming ? (
            <m.span
              animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.6, 1] }}
              aria-hidden="true"
              className="absolute top-0.5 -start-5 size-5 group-has-[[data-pending-response]]:top-0 group-has-[.assistant-response>h1:first-child]:top-2 group-has-[.assistant-response>h2:first-child]:top-1.5 group-has-[.assistant-response>:is(h3,h4):first-child]:top-1 group-has-[.assistant-response>h6:first-child]:top-0"
              data-assistant-marker=""
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 1.4, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
              }
            >
              <Image
                alt=""
                className="size-5 object-contain"
                height={20}
                src="/images/babyface.png"
                unoptimized
                width={20}
              />
            </m.span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-2">{children}</div>
        </>
      ) : (
        children
      )}
    </m.article>
  )
}

export type MessageContentProps = ComponentProps<"div">

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "break-keep min-w-0 [overflow-wrap:anywhere] text-base leading-6 text-foreground group-data-[from=user]:max-w-[min(85%,65ch)] group-data-[from=user]:rounded-lg group-data-[from=user]:px-4 group-data-[from=user]:py-3 group-data-[from=user]:bg-secondary group-data-[from=user]:text-secondary-foreground max-[319px]:max-w-full group-data-[from=user]:max-[319px]:px-3",
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
        "assistant-response size-full [&_a]:overflow-wrap-anywhere [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-2 [&_a]:underline-offset-4 [&_p]:my-0 [&_p+p]:mt-3",
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
        "m-0 text-sm",
        tone === "error"
          ? "rounded-md border border-destructive bg-card px-3 py-2 text-foreground"
          : "text-muted-foreground",
        className,
      )}
      data-tone={tone}
      role="status"
      {...props}
    />
  )
}
