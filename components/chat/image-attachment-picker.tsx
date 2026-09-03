"use client"

import type { FileUIPart } from "ai"
import { CameraIcon, ImagesIcon } from "lucide-react"
import type { ChangeEvent } from "react"
import { useEffect, useRef, useState } from "react"

import { Attachment, Attachments } from "@/components/ai-elements/attachments"
import {
  ImageNormalizationError,
  type ImageNormalizationErrorCode,
  normalizeImages,
} from "@/lib/images/normalize-image"
import { cn } from "@/lib/utils"

const MAX_IMAGE_COUNT = 4
const GENERIC_IMAGE_ERROR = "이미지를 처리하지 못했습니다. 다른 이미지를 선택해 주세요."

export type ReadyImageAttachment = {
  readonly image: FileUIPart
  readonly original: File
}

export type ImageSelectionNormalizer = (files: readonly File[]) => Promise<readonly FileUIPart[]>

type ImagePickerError = {
  readonly code: ImageNormalizationErrorCode | "generic"
  readonly message: string
}

type AttachmentEntry = {
  readonly id: number
  readonly image?: FileUIPart
  readonly objectUrl?: string
  readonly original: File
  readonly preview: string
  readonly status: "loading" | "ready"
}

type ImageAttachmentPickerProps = {
  readonly disabled: boolean
  readonly normalize?: ImageSelectionNormalizer
  readonly onBusyChange: (busy: boolean) => void
  readonly onChange: (attachments: readonly ReadyImageAttachment[]) => void
}

function revoke(entry: AttachmentEntry): void {
  if (entry.objectUrl !== undefined) URL.revokeObjectURL(entry.objectUrl)
}

export function ImageAttachmentPicker({
  disabled,
  normalize = normalizeImages,
  onBusyChange,
  onChange,
}: ImageAttachmentPickerProps) {
  const [entries, setEntries] = useState<readonly AttachmentEntry[]>([])
  const [error, setError] = useState<ImagePickerError | undefined>()
  const entriesRef = useRef<readonly AttachmentEntry[]>([])
  const generationRef = useRef(0)
  const nextIdRef = useRef(0)

  useEffect(
    () => () => {
      generationRef.current += 1
      for (const entry of entriesRef.current) revoke(entry)
    },
    [],
  )

  const commit = (next: readonly AttachmentEntry[]) => {
    entriesRef.current = next
    setEntries(next)
    onChange(
      next.flatMap((entry) =>
        entry.status === "ready" && entry.image !== undefined
          ? [{ image: entry.image, original: entry.original }]
          : [],
      ),
    )
    onBusyChange(next.some((entry) => entry.status === "loading"))
  }

  const addFiles = async (files: readonly File[]) => {
    if (files.length === 0) return
    if (entriesRef.current.length + files.length > MAX_IMAGE_COUNT) {
      const failure = new ImageNormalizationError("too_many")
      setError({ code: failure.code, message: failure.message })
      return
    }

    setError(undefined)
    const generation = generationRef.current + 1
    generationRef.current = generation
    const pending = files.map((original) => {
      const objectUrl = URL.createObjectURL(original)
      return {
        id: nextIdRef.current++,
        objectUrl,
        original,
        preview: objectUrl,
        status: "loading" as const,
      }
    })
    const pendingIds = new Set(pending.map((entry) => entry.id))
    commit([...entriesRef.current, ...pending])

    try {
      const images = await normalize(files)
      if (generation !== generationRef.current) return
      if (images.length !== files.length) throw new ImageNormalizationError("corrupt")
      commit(
        entriesRef.current.map((entry) => {
          if (!pendingIds.has(entry.id)) return entry
          const index = pending.findIndex((candidate) => candidate.id === entry.id)
          const image = images[index]
          if (image === undefined) return entry
          return {
            id: entry.id,
            image,
            original: entry.original,
            preview: image.url,
            status: "ready",
          }
        }),
      )
    } catch (caught) {
      if (generation !== generationRef.current) return
      commit(entriesRef.current.filter((entry) => !pendingIds.has(entry.id)))
      setError(
        caught instanceof ImageNormalizationError
          ? { code: caught.code, message: caught.message }
          : { code: "generic", message: GENERIC_IMAGE_ERROR },
      )
    } finally {
      for (const entry of pending) revoke(entry)
    }
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    void addFiles(files)
  }

  const remove = (id: number) => {
    const target = entriesRef.current.find((entry) => entry.id === id)
    if (target !== undefined) revoke(target)
    commit(entriesRef.current.filter((entry) => entry.id !== id))
    setError(undefined)
  }

  const isNormalizing = entries.some((entry) => entry.status === "loading")
  const inputDisabled = disabled || isNormalizing
  const controlClassName = cn(
    "inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-foreground outline-none transition-[color,background-color,border-color,box-shadow,opacity] duration-150 hover:bg-accent hover:text-accent-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
    inputDisabled && "pointer-events-none opacity-50",
  )

  return (
    <div className="grid gap-2 px-1 pt-1">
      {entries.length > 0 ? (
        <Attachments
          className="grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))]"
          data-testid="image-preview-grid"
        >
          {entries.map((entry, index) => (
            <Attachment
              alt={`${entry.original.name} 미리보기`}
              key={entry.id}
              motionIndex={index}
              name={entry.original.name}
              onRemove={() => remove(entry.id)}
              preview={entry.preview}
              status={entry.status}
            />
          ))}
        </Attachments>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <label className={controlClassName}>
          <CameraIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">후면 카메라로 촬영</span>
          <input
            accept="image/*"
            aria-label="후면 카메라로 촬영"
            capture="environment"
            className="sr-only"
            disabled={inputDisabled}
            multiple
            onChange={handleFiles}
            type="file"
          />
        </label>
        <label className={controlClassName}>
          <ImagesIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">사진 보관함에서 선택</span>
          <input
            accept="image/*"
            aria-label="사진 보관함에서 선택"
            className="sr-only"
            disabled={inputDisabled}
            multiple
            onChange={handleFiles}
            type="file"
          />
        </label>
        <span className="text-sm text-foreground" role="status">
          {isNormalizing ? "이미지를 처리하고 있습니다." : `${entries.length}/4장 첨부`}
        </span>
      </div>
      {error !== undefined ? (
        <p
          className="m-0 break-keep text-sm leading-5 text-destructive"
          data-image-error-code={error.code}
          role="alert"
        >
          {error.message}
        </p>
      ) : null}
    </div>
  )
}
