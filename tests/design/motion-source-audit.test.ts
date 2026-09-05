import { readdirSync, readFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SOURCE_ROOTS = ["app", "components"] as const
const SPATIAL_MOTION_ALLOWLIST = new Set([
  "components/ai-elements/attachments.tsx",
  "components/ai-elements/message.tsx",
  "components/ai-elements/sources.tsx",
  "components/chat/chat-shell.tsx",
  "components/door-lock.tsx",
])
const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"])
const FORBIDDEN_MECHANISMS =
  /(?:parallax|magnetic|ripple|requestAnimationFrame\s*\([^)]*scroll|transition-all|animate-spin)/u
const SCROLL_HANDLER = /(?:addEventListener\s*\(\s*["']scroll|\bonScroll\s*=)/u
const SPATIAL_MOTION =
  /(?:whileTap=|\blayout(?:=|\s)|@keyframes|animate-\[|active:scale|transition-transform)/u
const LOOP_REPEAT = /repeat\s*:/gu
const ASSISTANT_MARKER_LOOP =
  /<m\.span\b[\s\S]*?data-assistant-marker=""[\s\S]*?repeat:\s*Number\.POSITIVE_INFINITY[\s\S]*?\/>/u
const ASSISTANT_MARKER_SOURCE = "components/ai-elements/message.tsx"

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

describe("Todo12 motion source contract", () => {
  it("keeps spatial motion on the named product surfaces only", () => {
    // Given: every production frontend source file.
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((path) => {
      const source = readFileSync(resolve(path), "utf8")
      return SPATIAL_MOTION.test(source) && !SPATIAL_MOTION_ALLOWLIST.has(path) ? [path] : []
    })

    // When: spatial animation declarations are audited against the design allowlist.
    // Then: no unrelated control or surface owns spatial motion.
    expect(offenders).toEqual([])
  })

  it("permits the assistant-marker loop only on its named motion element", () => {
    // Given: every production frontend source file.
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((path) => {
      const source = readFileSync(resolve(path), "utf8")
      const repeats = source.match(LOOP_REPEAT) ?? []
      return path === ASSISTANT_MARKER_SOURCE &&
        repeats.length === 1 &&
        ASSISTANT_MARKER_LOOP.test(source)
        ? []
        : repeats.length > 0
          ? [path]
          : []
    })

    // When: repeat declarations are audited against the one named motion element.
    // Then: no source other than the streaming assistant marker owns a loop.
    expect(offenders).toEqual([])
  })

  it("contains no forbidden scroll-driven or decorative motion mechanism", () => {
    // Given: every production frontend source file.
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((path) => {
      const source = readFileSync(resolve(path), "utf8")
      return FORBIDDEN_MECHANISMS.test(source) ? [path] : []
    })

    // When: forbidden Todo12 mechanisms are audited.
    // Then: the product has no parallax, magnetic, ripple, or layout tween.
    expect(offenders).toEqual([])
  })

  it("allows only ChatShell's conversation scroll tracking, not scroll-driven motion", () => {
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((path) => {
      const source = readFileSync(resolve(path), "utf8")
      const remaining =
        path === "components/chat/chat-shell.tsx"
          ? source.replace("onScroll={handleScroll}", "")
          : source
      return SCROLL_HANDLER.test(remaining) ? [path] : []
    })
    expect(offenders).toEqual([])
  })

  it("removes legacy CSS keyframes in favor of interruptible component branches", () => {
    // Given: the global stylesheet shared by every route.
    const css = readFileSync(resolve("app/globals.css"), "utf8")

    // When: motion implementation ownership is inspected.
    // Then: global CSS owns tokens and paint states, not spatial keyframes.
    expect(css).not.toMatch(/@keyframes/u)
    expect(css).not.toMatch(/animation:/u)
  })
})
