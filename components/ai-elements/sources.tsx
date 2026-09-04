"use client"

import { BookOpenIcon, ChevronDownIcon, ExternalLinkIcon } from "lucide-react"
import { m, useReducedMotion } from "motion/react"
import type { ComponentProps } from "react"
import { createContext, useContext, useState } from "react"
import { parseSourceHref } from "@/components/ai-elements/source-url"
import {
  MOTION_STAGGER_SECONDS,
  REDUCED_OPACITY_TRANSITION,
  SPRING_LAYOUT,
  STATE_TRANSITION,
} from "@/components/motion/motion-tokens"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/** Registry source: https://registry.ai-sdk.dev/sources.json */
const SourcesOpenContext = createContext(false)

export type SourcesProps = ComponentProps<typeof Collapsible>
export function Sources({
  className,
  defaultOpen = false,
  onOpenChange,
  open,
  ...props
}: SourcesProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const currentOpen = open ?? internalOpen

  return (
    <SourcesOpenContext value={currentOpen}>
      <Collapsible
        className={cn(
          "group/sources w-full max-w-[65ch] rounded-lg border-s-2 border-s-primary bg-muted",
          className,
        )}
        onOpenChange={(nextOpen) => {
          if (open === undefined) setInternalOpen(nextOpen)
          onOpenChange?.(nextOpen)
        }}
        open={currentOpen}
        {...props}
      />
    </SourcesOpenContext>
  )
}

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  readonly count: number
}
export function SourcesTrigger({ children, className, count, ...props }: SourcesTriggerProps) {
  const isOpen = useContext(SourcesOpenContext)
  const reduceMotion = useReducedMotion()

  return (
    <CollapsibleTrigger
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground outline-none transition-[color,background-color,box-shadow] duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <BookOpenIcon aria-hidden="true" className="size-4" />
      {children ?? `출처 ${count}개 보기`}
      <m.span
        animate={{ rotate: isOpen ? 180 : 0 }}
        className="ms-auto inline-flex size-4"
        transition={reduceMotion ? { duration: 0 } : SPRING_LAYOUT}
      >
        <ChevronDownIcon aria-hidden="true" className="size-4" />
      </m.span>
    </CollapsibleTrigger>
  )
}

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>
export function SourcesContent({ children, className, ...props }: SourcesContentProps) {
  return (
    <CollapsibleContent className={cn("px-2 pb-2 max-[319px]:px-1", className)} {...props}>
      <div className="space-y-1">{children}</div>
    </CollapsibleContent>
  )
}

export type SourceProps = Omit<ComponentProps<typeof m.a>, "children" | "href"> & {
  readonly href: string
  readonly motionIndex?: number
  readonly title: string
}
export function Source({ className, href, motionIndex = 0, title, ...props }: SourceProps) {
  const safeHref = parseSourceHref(href)
  const reduceMotion = useReducedMotion()
  if (safeHref === null) return null
  const delay = reduceMotion ? 0 : Math.min(motionIndex, 3) * MOTION_STAGGER_SECONDS

  return (
    <m.a
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-1 rounded-md px-2 py-2 text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-[319px]:gap-1 max-[319px]:px-2",
        className,
      )}
      data-motion-surface="source"
      href={safeHref}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      rel="noreferrer"
      target="_blank"
      transition={{
        opacity: { ...(reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION), delay },
        y: { ...STATE_TRANSITION, delay },
      }}
      {...props}
    >
      <span
        className="min-w-0 flex-1 whitespace-normal break-keep [overflow-wrap:anywhere] leading-6"
        data-source-title
      >
        {title.split(/(함께 살펴보는|보호자 안내|체중 증가를|근거 자료)/u).map((part) =>
          part === "함께 살펴보는" ||
          part === "보호자 안내" ||
          part === "체중 증가를" ||
          part === "근거 자료" ? (
            <span data-semantic-phrase={part} key={part}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </span>
      <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0 max-[25rem]:hidden" />
    </m.a>
  )
}
