"use client"

import { FileImageIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { m, useReducedMotion } from "motion/react"
import Image from "next/image"
import type { ComponentProps } from "react"

import {
  MOTION_STAGGER_SECONDS,
  REDUCED_OPACITY_TRANSITION,
  STATE_TRANSITION,
} from "@/components/motion/motion-tokens"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AttachmentsProps = ComponentProps<"div">

/** Registry source: https://elements.ai-sdk.dev/api/registry/attachments.json */
export function Attachments({ className, ...props }: AttachmentsProps) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-2 min-[20rem]:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      {...props}
    />
  )
}

export type AttachmentProps = ComponentProps<typeof m.figure> & {
  readonly alt: string
  readonly motionIndex?: number
  readonly name: string
  readonly onRemove?: () => void
  readonly preview?: string
  readonly status?: "error" | "loading" | "ready"
}

export function Attachment({
  alt,
  className,
  motionIndex = 0,
  name,
  onRemove,
  preview,
  status = "ready",
  ...props
}: AttachmentProps) {
  const reduceMotion = useReducedMotion()
  const delay = reduceMotion ? 0 : Math.min(motionIndex, 3) * MOTION_STAGGER_SECONDS

  return (
    <m.figure
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative m-0 grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 rounded-lg border border-border bg-card p-2 shadow-xs",
        status === "error" && "border-destructive",
        className,
      )}
      data-testid="thumbnail-motion"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      transition={{
        opacity: { ...(reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION), delay },
        y: { ...STATE_TRANSITION, delay },
      }}
      {...props}
    >
      <div className="grid size-11 place-items-center overflow-hidden rounded-md bg-muted">
        {preview ? (
          <Image
            alt={alt}
            className="size-11 object-cover"
            height={48}
            src={preview}
            unoptimized
            width={48}
          />
        ) : (
          <FileImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        )}
      </div>
      <figcaption
        className={cn(
          "min-w-0",
          status === "loading" && "col-span-2 row-start-2 max-[319px]:col-span-3",
          "max-[319px]:col-span-3 max-[319px]:row-start-2",
        )}
      >
        <span className="block truncate text-sm font-medium text-card-foreground">{name}</span>
        <span
          className={cn(
            "block min-w-0 text-sm break-keep [word-break:keep-all] [overflow-wrap:normal] text-muted-foreground",
            status === "error" && "font-medium text-foreground",
          )}
          role="status"
        >
          <span data-keep-phrase>
            {status === "loading"
              ? "이미지 처리 중"
              : status === "error"
                ? "처리 실패"
                : "첨부 완료"}
          </span>
        </span>
      </figcaption>
      {status === "loading" ? (
        <span className="grid size-11 place-items-center" title="이미지 처리 중">
          <LoaderCircleIcon aria-hidden="true" className="size-4" />
        </span>
      ) : onRemove ? (
        <Button aria-label={`${name} 제거`} onClick={onRemove} size="icon" variant="ghost">
          <XIcon aria-hidden="true" />
        </Button>
      ) : (
        <span aria-hidden="true" className="size-11" />
      )}
    </m.figure>
  )
}

export type AttachmentEmptyProps = ComponentProps<"p">
export function AttachmentEmpty({ className, ...props }: AttachmentEmptyProps) {
  return (
    <p
      className={cn("m-0 rounded-lg bg-muted px-4 py-3 text-sm text-foreground", className)}
      {...props}
    />
  )
}
