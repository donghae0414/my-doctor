import type { ChatStatus, FileUIPart } from "ai"
import type { ChangeEvent } from "react"
import { useCallback, useState } from "react"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { ImageRequestBudgetError } from "@/lib/images/request-budget"
import { EFFORT_OPTIONS, type Effort } from "./chat-types"
import {
  ImageAttachmentPicker,
  type ImageSelectionNormalizer,
  type ReadyImageAttachment,
} from "./image-attachment-picker"

export type ChatComposerDraft = {
  readonly images: readonly FileUIPart[]
  readonly originals: readonly File[]
  readonly text: string
}

type ChatComposerProps = {
  readonly effort: Effort
  readonly normalize?: ImageSelectionNormalizer
  readonly onEffortChange: (effort: Effort) => void
  readonly onStop: () => void
  readonly onSubmit: (draft: ChatComposerDraft) => void | Promise<void>
  readonly status: ChatStatus
}

export function ChatComposer({
  effort,
  normalize,
  onEffortChange,
  onStop,
  onSubmit,
  status,
}: ChatComposerProps) {
  const [attachments, setAttachments] = useState<readonly ReadyImageAttachment[]>([])
  const [isNormalizing, setIsNormalizing] = useState(false)
  const [sendError, setSendError] = useState<
    { readonly code: "request-budget" | "transport"; readonly message: string } | undefined
  >()
  const [clearVersion, setClearVersion] = useState(0)
  const isSending = status === "submitted" || status === "streaming"
  const inputDisabled = isSending || isNormalizing
  const submitStatus = inputDisabled ? "disabled" : status === "error" ? "error" : "ready"

  const handleAttachmentsChange = useCallback(
    (next: readonly ReadyImageAttachment[]) => setAttachments(next),
    [],
  )
  const handleBusyChange = useCallback((busy: boolean) => setIsNormalizing(busy), [])

  const handleEffortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = EFFORT_OPTIONS.find((option) => option.value === event.currentTarget.value)
    if (selected !== undefined) onEffortChange(selected.value)
  }

  const handleSubmit = async (text: string) => {
    if (inputDisabled || (text.length === 0 && attachments.length === 0)) return
    setSendError(undefined)
    try {
      await onSubmit({
        images: attachments.map((attachment) => attachment.image),
        originals: attachments.map((attachment) => attachment.original),
        text,
      })
      setAttachments([])
      setClearVersion((current) => current + 1)
    } catch (caught) {
      if (!(caught instanceof Error)) throw caught
      setSendError({
        code: caught instanceof ImageRequestBudgetError ? "request-budget" : "transport",
        message: caught.message,
      })
    }
  }

  return (
    <div className="grid min-w-0 gap-2 max-[319px]:gap-0">
      <PromptInput
        allowEmpty={attachments.length > 0}
        aria-label="의료 질문 작성"
        key={clearVersion}
        onSubmit={(text) => void handleSubmit(text)}
      >
        <ImageAttachmentPicker
          disabled={isSending}
          {...(normalize === undefined ? {} : { normalize })}
          onBusyChange={handleBusyChange}
          onChange={handleAttachmentsChange}
        />
        <PromptInputTextarea
          aria-label="의료 질문"
          className="max-[319px]:min-h-20"
          cols={1}
          disabled={status === "submitted"}
          placeholder="증상과 시점을 적어 주세요"
        />
        <PromptInputFooter className="max-[319px]:flex-nowrap">
          <PromptInputTools className="max-[319px]:flex-1">
            <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground max-[319px]:flex-1 max-[319px]:px-1">
              <span className="whitespace-nowrap max-[319px]:sr-only">추론 강도</span>
              <select
                aria-label="추론 강도"
                className="min-h-11 min-w-0 max-w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-[color,background-color,border-color,box-shadow] duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-[319px]:w-full"
                onChange={handleEffortChange}
                value={effort}
              >
                {EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </PromptInputTools>
          <PromptInputSubmit
            onClick={status === "streaming" ? onStop : undefined}
            status={status === "streaming" ? "streaming" : submitStatus}
          />
        </PromptInputFooter>
        {sendError !== undefined ? (
          <p
            className="m-0 break-keep px-2 text-sm leading-5 text-destructive"
            data-send-error-code={sendError.code}
            role="alert"
          >
            {sendError.message}
          </p>
        ) : null}
      </PromptInput>
      <p className="m-0 break-keep px-2 text-center text-sm leading-5 text-foreground">
        <span className="block max-[319px]:hidden" data-semantic-phrase>
          의료진의 진단을 대신하지 않으며,{" "}
        </span>
        <span className="block max-[319px]:hidden" data-semantic-phrase>
          응급 상황은 즉시 119 또는{" "}
        </span>
        <span className="block max-[319px]:hidden" data-semantic-phrase>
          의료기관에 연락하세요.
        </span>
        <span className="hidden max-[319px]:block" data-semantic-phrase>
          의료진의 진단을 대신하지
        </span>
        <span className="hidden max-[319px]:block" data-semantic-phrase>
          않으며, 응급 상황은 즉시
        </span>
        <span className="hidden max-[319px]:block" data-semantic-phrase>
          119 또는 의료기관에
        </span>
        <span className="hidden max-[319px]:block" data-semantic-phrase>
          연락하세요.
        </span>
      </p>
    </div>
  )
}
