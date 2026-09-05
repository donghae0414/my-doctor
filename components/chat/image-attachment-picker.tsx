"use client"

import type { FileUIPart } from "ai"
import { CameraIcon, ImagesIcon, PlusIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import type { ChangeEvent } from "react"
import { useEffect, useRef, useState } from "react"

import { Attachment, Attachments } from "@/components/ai-elements/attachments"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ImageNormalizationError,
  type ImageNormalizationErrorCode,
  normalizeImages,
} from "@/lib/images/normalize-image"

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
  readonly menuSide?: "top" | "bottom"
  readonly normalize?: ImageSelectionNormalizer
  readonly onBusyChange: (busy: boolean) => void
  readonly onChange: (attachments: readonly ReadyImageAttachment[]) => void
}

function revoke(entry: AttachmentEntry): void {
  if (entry.objectUrl !== undefined) URL.revokeObjectURL(entry.objectUrl)
}

export function ImageAttachmentPicker({
  disabled,
  menuSide = "top",
  normalize = normalizeImages,
  onBusyChange,
  onChange,
}: ImageAttachmentPickerProps) {
  const [entries, setEntries] = useState<readonly AttachmentEntry[]>([])
  const [error, setError] = useState<ImagePickerError | undefined>()
  const entriesRef = useRef<readonly AttachmentEntry[]>([])
  const generationRef = useRef(0)
  const nextIdRef = useRef(0)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

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
  const menuItemClassName =
    "flex min-h-11 items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground [&_svg]:size-4"

  return (
    <div className="contents">
      {entries.length > 0 ? (
        <Attachments
          className="col-span-2 row-start-1 mb-2 grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] px-1 pt-1"
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
      <div className="col-start-1 row-start-3 self-end pb-1 ps-1 max-[319px]:ps-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="사진 첨부" disabled={inputDisabled} size="icon" variant="ghost">
              <PlusIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side={menuSide}>
            <DropdownMenuPrimitive.Item
              className={menuItemClassName}
              onSelect={() => cameraRef.current?.click()}
            >
              <CameraIcon aria-hidden="true" />
              사진 촬영
            </DropdownMenuPrimitive.Item>
            <DropdownMenuPrimitive.Item
              className={menuItemClassName}
              onSelect={() => galleryRef.current?.click()}
            >
              <ImagesIcon aria-hidden="true" />
              사진 선택
            </DropdownMenuPrimitive.Item>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          accept="image/*"
          aria-label="후면 카메라로 촬영"
          capture="environment"
          className="hidden"
          disabled={inputDisabled}
          multiple
          onChange={handleFiles}
          ref={cameraRef}
          type="file"
        />
        <input
          accept="image/*"
          aria-label="사진 보관함에서 선택"
          className="hidden"
          disabled={inputDisabled}
          multiple
          onChange={handleFiles}
          ref={galleryRef}
          type="file"
        />
        <span className="sr-only" role="status">
          {isNormalizing ? "이미지를 처리하고 있습니다." : `${entries.length}/4장 첨부`}
        </span>
      </div>
      {error !== undefined ? (
        <p
          className="col-span-2 row-start-4 m-0 break-keep px-1 text-sm leading-5 text-destructive"
          data-image-error-code={error.code}
          role="alert"
        >
          {error.message}
        </p>
      ) : null}
    </div>
  )
}
