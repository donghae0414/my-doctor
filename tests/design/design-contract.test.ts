import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import contract from "./theme-contract.json"

const DESIGN_PATH = resolve("DESIGN.md")
const SECTION_NAMES = [
  "## 0. Research Log",
  "## 1. Atmosphere & Identity",
  "## 2. Color",
  "## 3. Typography",
  "## 4. Spacing & Layout",
  "## 5. Components",
  "## 6. Motion & Interaction",
  "## 7. Depth & Surface",
  "## 8. Accessibility Constraints & Accepted Debt",
] as const

const COLOR_PATTERN = /(?:oklch|hsl|rgb)a?\([^\n;)]+\)|#[0-9a-f]{3,8}\b/giu
const DURATION_PATTERN = /\b\d+(?:\.\d+)?m?s\b/gu
const ALLOWED_DURATIONS = new Set(["0ms", "25ms", "150ms", "200ms", "220ms", "450ms", "1.4s", "4s"])

function valuesOf(record: Record<string, string>): string[] {
  return Object.values(record)
}

function declaredColors(): Set<string> {
  const values = [...valuesOf(contract.exported.light), ...valuesOf(contract.exported.dark)]
  return new Set(values.flatMap((value) => value.match(COLOR_PATTERN) ?? []))
}

function auditUndeclaredColorAndMotion(source: string): string[] {
  const colors = source.match(COLOR_PATTERN) ?? []
  const durations = source.match(DURATION_PATTERN) ?? []
  return [
    ...colors
      .filter((color) => !declaredColors().has(color))
      .map((color) => `undeclared-color:${color}`),
    ...durations
      .filter((duration) => !ALLOWED_DURATIONS.has(duration))
      .map((duration) => `undeclared-motion:${duration}`),
  ]
}

function cssBlock(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading)
  if (start < 0) throw new Error(`Missing heading: ${heading}`)
  const fenced = markdown.slice(start).match(/```css\n([\s\S]*?)```/u)
  if (!fenced?.[1]) throw new Error(`Missing CSS block after: ${heading}`)
  return fenced[1]
}

function parseVariables(css: string): Record<string, string> {
  return Object.fromEntries(
    [...css.matchAll(/^\s*(--[\w-]+):\s*(.+);$/gmu)].map((match) => [match[1], match[2]]),
  )
}

describe("DESIGN.md machine contract", () => {
  it("records every exact exported light and dark variable", () => {
    const design = readFileSync(DESIGN_PATH, "utf8")

    expect(parseVariables(cssBlock(design, "### Exact light export"))).toEqual(
      contract.exported.light,
    )
    expect(parseVariables(cssBlock(design, "### Exact dark export"))).toEqual(
      contract.exported.dark,
    )
  })

  it("starts with the research log and contains ordered Sections 1-8", () => {
    const design = readFileSync(DESIGN_PATH, "utf8")
    expect(design.startsWith("## 0. Research Log\n")).toBe(true)

    let prior = -1
    for (const section of SECTION_NAMES) {
      const index = design.indexOf(section)
      expect(index, section).toBeGreaterThan(prior)
      prior = index
    }
    expect(design).not.toMatch(/\b(?:TODO|TBD|FIXME|PLACEHOLDER)\b/iu)
  })

  it("rejects an isolated undeclared color/motion fixture, cleans it up, and accepts the restored contract", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "task-2-design-red-"))
    const fixturePath = join(fixtureDirectory, "undeclared.css")

    try {
      writeFileSync(fixturePath, ".rogue { color: #ff00ff; transition-duration: 777ms; }\n")
      expect(auditUndeclaredColorAndMotion(readFileSync(fixturePath, "utf8"))).toEqual([
        "undeclared-color:#ff00ff",
        "undeclared-motion:777ms",
      ])
    } finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }

    expect(() => readFileSync(fixturePath, "utf8")).toThrow()
    expect(auditUndeclaredColorAndMotion(readFileSync(DESIGN_PATH, "utf8"))).toEqual([])
  })
})
