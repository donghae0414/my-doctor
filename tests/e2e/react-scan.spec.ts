import { execFile } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { chromium, expect, test } from "@playwright/test"
import { z } from "zod"

const execFileAsync = promisify(execFile)
const evidenceRoot = resolve(".omo/evidence/task-12-postpartum-medical-chat")
const bundlePath = resolve(evidenceRoot, "react-scan-browser.js")
const ChangeSchema = z.object({
  context: z.boolean(),
  hooks: z.array(z.number()),
  isFirstMount: z.boolean(),
  parent: z.boolean(),
  props: z.array(z.string()).nullable(),
  state: z.boolean(),
})
const SourceSchema = z.looseObject({ fileName: z.string() })
const FiberSchema = z.object({
  actualDuration: z.number(),
  changeDescription: ChangeSchema.nullish(),
  name: z.string(),
  ownerName: z.string().nullish(),
  source: SourceSchema.nullish(),
})
const CommitSchema = z.object({
  kind: z.literal("commit"),
  timestamp: z.number(),
  tree: z.array(FiberSchema).optional(),
})

function isProjectFiber(fiber: z.infer<typeof FiberSchema>): boolean {
  const fileName = fiber.source?.fileName ?? ""
  return fileName.includes("/components/") || fileName.includes("components_")
}

function isUnnecessary(fiber: z.infer<typeof FiberSchema>): boolean {
  const change = fiber.changeDescription
  return (
    isProjectFiber(fiber) &&
    fiber.actualDuration > 0 &&
    change !== null &&
    change !== undefined &&
    !change.isFirstMount &&
    change.props !== null &&
    change.props.length === 0 &&
    !change.state &&
    !change.context &&
    change.hooks.length === 0 &&
    !change.parent
  )
}

test.use({ trace: "off", video: "off" })

test("react-scan lite reports zero unnecessary renders for the Todo12 chat journey", async () => {
  await mkdir(evidenceRoot, { recursive: true })
  await execFileAsync("bun", [
    "build",
    "tests/e2e/react-scan-browser.ts",
    "--outfile",
    bundlePath,
    "--target",
    "browser",
    "--format",
    "iife",
    "--minify",
  ])
  const browser = await chromium.launch({ channel: "chrome" })
  try {
    const context = await browser.newContext({ viewport: { height: 812, width: 375 } })
    await context.addInitScript({ path: bundlePath })
    const page = await context.newPage()
    await page.goto("/motion-task-12")
    await page.getByRole("textbox", { name: "의료 질문" }).fill("렌더 품질을 확인합니다")
    await page.getByRole("button", { name: "질문 보내기" }).click()
    await expect(page.locator("article[data-streaming='true']")).toContainText(
      "응답을 준비하고 있습니다.",
    )
    await page.evaluate(() => window.dispatchEvent(new Event("chat-shell-continue")))
    await expect(page.getByRole("heading", { name: "아기 상태 확인" })).toBeVisible()
    await page.getByRole("button", { name: "출처 1개 보기" }).click()
    await expect(page.getByRole("link", { name: /신생아 수유와 게워냄/u })).toBeVisible()
    await page.getByRole("button", { name: "새 대화" }).click()
    await expect(page.getByTestId("chat-composer-region")).toHaveAttribute(
      "data-placement",
      "center",
    )

    const commits = z
      .array(CommitSchema)
      .parse(await page.evaluate(() => window.__reactScanCommits))
    const fibers = commits.flatMap((commit) => commit.tree ?? [])
    const renderedFibers = fibers.filter(
      (fiber) => fiber.actualDuration > 0 && isProjectFiber(fiber),
    )
    const unnecessary = renderedFibers.flatMap((fiber) =>
      isUnnecessary(fiber)
        ? [
            {
              actualDuration: fiber.actualDuration,
              name: fiber.name,
              ownerName: fiber.ownerName,
              source: fiber.source,
            },
          ]
        : [],
    )
    const report = {
      analyzedFiberCount: fibers.length,
      browser: {
        channel: "chrome",
        version: browser.version(),
      },
      commitCount: commits.length,
      instrumentation: {
        bundleEntry: "tests/e2e/react-scan-browser.ts",
        injectedBeforeNavigation: true,
        package: "react-scan/lite",
        serverMode: "development test harness",
        recordChangeDescriptions: true,
      },
      renderedFiberCount: renderedFibers.length,
      sampledNames: [...new Set(fibers.map((fiber) => fiber.name))].slice(0, 100),
      sampledSources: [
        ...new Set(
          fibers.flatMap((fiber) =>
            fiber.source === null || fiber.source === undefined ? [] : [fiber.source.fileName],
          ),
        ),
      ].slice(0, 50),
      route: page.url(),
      unnecessary,
      unnecessaryCount: unnecessary.length,
    }
    await writeFile(
      resolve(evidenceRoot, "react-scan-runtime.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    expect(report.commitCount).toBeGreaterThan(0)
    expect(report.analyzedFiberCount).toBeGreaterThan(0)
    expect(report.renderedFiberCount).toBeGreaterThan(0)
    expect(report.unnecessaryCount).toBe(0)
    await context.close()
  } finally {
    await browser.close()
    await rm(bundlePath, { force: true })
  }
})
