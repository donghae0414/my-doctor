import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { z } from "zod"

import { LAYOUT_TRACE_BUDGET, startDevToolsLayoutTrace } from "@/tests/e2e/devtools-layout-trace"
import { send, unlock } from "./task14-helpers"

const SOURCE_HASH = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .parse(process.env["TASK14_SOURCE_HASH"])
const evidenceRoot = resolve(".omo/evidence/task-14-postpartum-medical-chat")

test("records Todo14 real-route motion and layout performance", async ({ page }) => {
  await page.goto("/")
  await unlock(page)
  const finishTrace = await startDevToolsLayoutTrace(page)

  await send(page, "TASK13_STREAM_medium")
  await expect(page.getByText("[effort:medium]", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "출처 1개 보기" }).click()
  await expect(page.getByRole("link", { name: "TASK13_SOURCE" })).toBeVisible()
  await page.getByRole("button", { name: "새 대화" }).click()
  await expect(page.getByTestId("chat-composer-region")).toHaveAttribute("data-placement", "center")

  const trace = await finishTrace()
  expect(trace.summary.forcedLayout.durationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.forcedLayoutDurationMs,
  )
  expect(trace.summary.layout.maximumDurationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.maximumLayoutDurationMs,
  )
  expect(trace.summary.layout.totalDurationMs).toBeLessThanOrEqual(
    LAYOUT_TRACE_BUDGET.totalLayoutDurationMs,
  )
  await writeFile(resolve(evidenceRoot, "motion-trace.json.gz"), trace.compressedTrace)
  await writeFile(
    resolve(evidenceRoot, "motion-summary.json"),
    `${JSON.stringify({ route: page.url(), sourceHash: SOURCE_HASH, summary: trace.summary }, null, 2)}\n`,
  )
})
