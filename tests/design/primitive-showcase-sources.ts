export const primitiveShowcaseViewports = [375, 768, 1280] as const
export const primitiveShowcaseThemes = ["light", "dark"] as const
export const primitiveShowcaseZoomLevels = [100, 200] as const

export type PrimitiveShowcaseCaptureCase = {
  readonly theme: (typeof primitiveShowcaseThemes)[number]
  readonly width: (typeof primitiveShowcaseViewports)[number]
  readonly zoomPercent: (typeof primitiveShowcaseZoomLevels)[number]
}

export const primitiveShowcaseSourcePaths = [
  "app/globals.css",
  "app/layout.tsx",
  "app/page.tsx",
  "biome.json",
  "next.config.ts",
  "playwright.config.ts",
  "lib/utils.ts",
  "components/ai-elements/attachments.tsx",
  "components/ai-elements/conversation.tsx",
  "components/ai-elements/message.tsx",
  "components/ai-elements/prompt-input.tsx",
  "components/ai-elements/sources.tsx",
  "components/dev/primitive-showcase.tsx",
  "components/ui/button.tsx",
  "components/ui/collapsible.tsx",
  "tests/design/primitive-showcase-layout.ts",
  "tests/design/primitive-showcase-page.tsx",
  "tests/design/primitive-showcase-sources.ts",
  "tests/design/primitive-showcase.spec.ts",
  "tests/design/primitive-showcase.test.tsx",
  "tests/design/run-primitive-showcase-server.sh",
] as const
