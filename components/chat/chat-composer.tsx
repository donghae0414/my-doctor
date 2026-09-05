import type { ChatStatus, FileUIPart } from "ai"
import { useCallback, useEffect, useState } from "react"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ImageRequestBudgetError } from "@/lib/images/request-budget"
import { EFFORT_OPTIONS, type Effort, MODEL_OPTIONS, type Model } from "./chat-types"
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
  readonly menuSide?: "top" | "bottom"
  readonly model: Model
  readonly normalize?: ImageSelectionNormalizer
  readonly onEffortChange: (effort: Effort) => void
  readonly onHasAttachmentPreviews: (hasPreviews: boolean) => void
  readonly onModelChange: (model: Model) => void
  readonly onStop: () => void
  readonly onSubmit: (draft: ChatComposerDraft) => void | Promise<void>
  readonly status: ChatStatus
}

export function ChatComposer({
  effort,
  menuSide = "top",
  model,
  normalize,
  onEffortChange,
  onHasAttachmentPreviews,
  onModelChange,
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
  const [hasTrimmedText, setHasTrimmedText] = useState(false)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const isSending = status === "submitted" || status === "streaming"
  const canStop = isSending
  const canSend = !isNormalizing && (hasTrimmedText || attachments.length > 0)
  const submitStatus = canStop
    ? status
    : canSend
      ? status === "error"
        ? "error"
        : "ready"
      : "disabled"
  const selectedModel = MODEL_OPTIONS.find((option) => option.value === model)
  const selectedEffort = EFFORT_OPTIONS.find((option) => option.value === effort)

  const handleAttachmentsChange = useCallback(
    (next: readonly ReadyImageAttachment[]) => setAttachments(next),
    [],
  )
  const handleBusyChange = useCallback((busy: boolean) => setIsNormalizing(busy), [])

  const handleModelChange = (value: string) => {
    const option = MODEL_OPTIONS.find((candidate) => candidate.value === value)
    if (option !== undefined) onModelChange(option.value)
  }

  const handleEffortChange = (value: string) => {
    const option = EFFORT_OPTIONS.find((candidate) => candidate.value === value)
    if (option === undefined) return
    onEffortChange(option.value)
    setSelectorOpen(false)
  }

  useEffect(() => {
    onHasAttachmentPreviews(isNormalizing || attachments.length > 0)
  }, [attachments.length, isNormalizing, onHasAttachmentPreviews])

  useEffect(() => () => onHasAttachmentPreviews(false), [onHasAttachmentPreviews])

  const handleSubmit = async (text: string) => {
    if (isSending || isNormalizing || (text.length === 0 && attachments.length === 0)) return
    setSendError(undefined)
    try {
      await onSubmit({
        images: attachments.map((attachment) => attachment.image),
        originals: attachments.map((attachment) => attachment.original),
        text,
      })
      setAttachments([])
      setHasTrimmedText(false)
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
        className="grid-cols-[auto_minmax(0,1fr)] gap-y-0 max-[319px]:gap-x-0"
        key={clearVersion}
        onSubmit={(text) => void handleSubmit(text)}
      >
        <ImageAttachmentPicker
          disabled={isSending}
          menuSide={menuSide}
          {...(normalize === undefined ? {} : { normalize })}
          onBusyChange={handleBusyChange}
          onChange={handleAttachmentsChange}
        />
        <PromptInputTextarea
          aria-label="의료 질문"
          className="col-span-2 row-start-2"
          cols={1}
          disabled={status === "submitted"}
          onChange={(event) => setHasTrimmedText(event.currentTarget.value.trim().length > 0)}
          placeholder="증상과 시점을 적어 주세요"
        />
        <PromptInputFooter className="col-start-2 row-start-3 flex-nowrap justify-end gap-1 ps-0 max-[319px]:gap-0 max-[319px]:pe-0">
          <PromptInputTools className="flex-nowrap">
            <DropdownMenu onOpenChange={setSelectorOpen} open={selectorOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`모델 ${selectedModel?.label}, 추론 강도 ${selectedEffort?.label}`}
                  className="min-w-11 rounded-full px-2 text-sm! leading-5! max-[319px]:whitespace-normal"
                  type="button"
                >
                  {selectedModel?.label} · {selectedEffort?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side={menuSide}>
                <DropdownMenuLabel>모델</DropdownMenuLabel>
                <DropdownMenuRadioGroup onValueChange={handleModelChange} value={model}>
                  {MODEL_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      onSelect={(event) => event.preventDefault()}
                      value={option.value}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>추론 강도</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={effort}>
                      {EFFORT_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          onSelect={() => handleEffortChange(option.value)}
                          value={option.value}
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </PromptInputTools>
          <PromptInputSubmit onClick={canStop ? onStop : undefined} status={submitStatus} />
        </PromptInputFooter>
        {sendError !== undefined ? (
          <p
            className="col-span-2 row-start-5 m-0 break-keep px-2 text-sm leading-5 text-destructive"
            data-send-error-code={sendError.code}
            role="alert"
          >
            {sendError.message}
          </p>
        ) : null}
      </PromptInput>
      <p className="m-0 break-keep px-2 text-center text-sm leading-5 text-foreground">
        AI는 틀릴 수 있어요. 의료 판단은 의료진과 확인하세요.
      </p>
    </div>
  )
}
