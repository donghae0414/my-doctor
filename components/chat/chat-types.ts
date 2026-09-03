import type { ChatTransport, UIMessage } from "ai"

import type { ImageSelectionNormalizer } from "./image-attachment-picker"

export const EFFORT_OPTIONS = [
  { label: "없음", value: "none" },
  { label: "낮음", value: "low" },
  { label: "보통", value: "medium" },
  { label: "높음", value: "high" },
  { label: "매우 높음", value: "xhigh" },
  { label: "최대", value: "max" },
] as const

export type Effort = (typeof EFFORT_OPTIONS)[number]["value"]

export type ChatShellProps = {
  readonly imageNormalizer?: ImageSelectionNormalizer
  readonly transport?: ChatTransport<UIMessage>
}
