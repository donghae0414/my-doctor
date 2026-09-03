import { execFile } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { chromium, expect, test } from "@playwright/test"
import { z } from "zod"

import { send, unlock } from "./task14-helpers"

const execFileAsync = promisify(execFile)
const SOURCE_HASH = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .parse(process.env["TASK14_SOURCE_HASH"])
const evidenceRoot = resolve(".omo/evidence/task-14-postpartum-medical-chat")
const bundlePath = resolve(evidenceRoot, "react-scan-browser.js")
const ChangeSchema = z.looseObject({
  context: z.boolean(),
  hooks: z.array(z.number()),
  isFirstMount: z.boolean(),
  parent: z.boolean(),
  props: z.array(z.string()).nullable(),
  state: z.boolean(),
})
const FiberSchema = z.looseObject({
  actualDuration: z.number(),
  changeDescription: ChangeSchema.nullish(),
  name: z.string(),
  ownerName: z.string().nullish(),
  source: z.looseObject({ fileName: z.string() }).nullish(),
})
const CommitSchema = z.looseObject({
  kind: z.literal("commit"),
  timestamp: z.number(),
  tree: z.array(FiberSchema).optional(),
})

test("ReactScan reports no unnecessary commits on the Todo14 real app route", async () => {
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
    const context = await browser.newContext({ viewport: { height: 900, width: 375 } })
    await context.addInitScript({ path: bundlePath })
    const page = await context.newPage()
    await page.goto("/")
    await unlock(page)
    await send(page, "TASK13_STREAM_medium")
    await expect(page.getByText("[effort:medium]", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "출처 1개 보기" }).click()
    await expect(page.getByRole("link", { name: "TASK13_SOURCE" })).toBeVisible()
    await page.getByRole("button", { name: "새 대화" }).click()
    await expect(page.getByTestId("chat-composer-region")).toHaveAttribute(
      "data-placement",
      "center",
    )

    const commits = z
      .array(CommitSchema)
      .parse(await page.evaluate(() => window.__reactScanCommits))
    const fibers = commits.flatMap((commit) => commit.tree ?? [])
    const projectFibers = fibers.filter((fiber) =>
      (fiber.source?.fileName ?? "").includes("components"),
    )
    const unnecessary = projectFibers.filter((fiber) => {
      const change = fiber.changeDescription
      return (
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
    })
    const report = {
      analyzedFiberCount: fibers.length,
      browser: { channel: "chrome", version: browser.version() },
      commitCount: commits.length,
      projectFiberCount: projectFibers.length,
      route: page.url(),
      sourceHash: SOURCE_HASH,
      unnecessary,
      unnecessaryCount: unnecessary.length,
    }
    await writeFile(
      resolve(evidenceRoot, "react-scan-runtime.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    expect(report.commitCount).toBeGreaterThan(0)
    expect(report.projectFiberCount).toBeGreaterThan(0)
    expect(report.unnecessaryCount).toBe(0)
    await context.close()
  } finally {
    await browser.close()
    await rm(bundlePath, { force: true })
  }
})
