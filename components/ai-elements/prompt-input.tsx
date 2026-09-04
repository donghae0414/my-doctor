"use client"

import { LoaderCircleIcon, SendIcon, SquareIcon } from "lucide-react"
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import type { ComponentProps, FormEvent, KeyboardEvent } from "react"

import { REDUCED_OPACITY_TRANSITION, STATE_TRANSITION } from "@/components/motion/motion-tokens"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type PromptInputStatus =
  | "disabled"
  | "error"
  | "loading"
  | "ready"
  | "submitted"
  | "streaming"

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  readonly allowEmpty?: boolean
  readonly onSubmit: (text: string) => void
}

/**
 * Registry-derived from AI Elements Prompt Input.
 * Registry source: https://registry.ai-sdk.dev/prompt-input.json
 * Voice, model-command, and unrelated picker APIs are deliberately omitted.
 */
export function PromptInput({
  allowEmpty = false,
  className,
  onSubmit,
  ...props
}: PromptInputProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = form.get("message")
    if (typeof text !== "string") return
    const trimmed = text.trim()
    if (allowEmpty || trimmed.length > 0) onSubmit(trimmed)
  }

  return (
    <form
      className={cn(
        "grid min-w-0 w-full gap-2 rounded-xl border border-input bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
      {...props}
      onSubmit={submit}
    />
  )
}

export type PromptInputTextareaProps = ComponentProps<"textarea">

export function PromptInputTextarea({ className, onKeyDown, ...props }: PromptInputTextareaProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <textarea
      className={cn(
        "max-h-48 min-h-12 min-w-0 w-full resize-none bg-transparent px-3 py-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      name="message"
      onKeyDown={handleKeyDown}
      rows={1}
      {...props}
    />
  )
}

export type PromptInputHeaderProps = ComponentProps<"div">
export function PromptInputHeader({ className, ...props }: PromptInputHeaderProps) {
  return <div className={cn("flex flex-wrap gap-2 px-1 pt-1", className)} {...props} />
}

export type PromptInputFooterProps = ComponentProps<"div">
export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-2 px-1 pb-1",
        className,
      )}
      {...props}
    />
  )
}

export type PromptInputToolsProps = ComponentProps<"div">
export function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)} {...props} />
}

export type PromptInputButtonProps = ComponentProps<typeof Button>
export function PromptInputButton({ className, ...props }: PromptInputButtonProps) {
  return <Button className={cn("shrink-0", className)} size="icon" variant="ghost" {...props} />
}

export type PromptInputSubmitProps = Omit<ComponentProps<typeof Button>, "disabled"> & {
  readonly status: PromptInputStatus
}

export function PromptInputSubmit({
  children,
  className,
  status,
  ...props
}: PromptInputSubmitProps) {
  const reduceMotion = useReducedMotion()
  const disabled = status === "disabled" || status === "loading"
  const isStopping = status === "submitted" || status === "streaming"
  const label = isStopping ? "응답 중지" : "질문 보내기"
  const stateIcon = isStopping ? (
    <SquareIcon aria-hidden="true" />
  ) : (
    (children ??
    (status === "loading" ? (
      <LoaderCircleIcon aria-hidden="true" />
    ) : (
      <SendIcon aria-hidden="true" />
    )))
  )

  return (
    <Button
      {...props}
      aria-label={label}
      aria-live="polite"
      className={cn(
        disabled && "disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        className,
      )}
      disabled={disabled}
      size="icon"
      type={isStopping ? "button" : "submit"}
      variant="default"
    >
      <AnimatePresence initial={false} mode="sync">
        <m.span
          animate={{ filter: "blur(0px)", opacity: 1 }}
          className="inline-flex"
          data-motion-surface="composer-action"
          exit={reduceMotion ? { opacity: 0 } : { filter: "blur(4px)", opacity: 0 }}
          initial={reduceMotion ? { opacity: 0 } : { filter: "blur(4px)", opacity: 0 }}
          key={status}
          transition={reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION}
        >
          {stateIcon}
        </m.span>
      </AnimatePresence>
    </Button>
  )
}
