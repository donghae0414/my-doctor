import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, type Page, type Response } from "@playwright/test"
import { z } from "zod"

export const EVIDENCE_ROOT = resolve(".omo/evidence/task-15-postpartum-medical-chat/current")
export const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const

const ChatRequestSchema = z.object({
  effort: z.enum(EFFORTS),
  messages: z.array(
    z.object({
      parts: z.array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({
            type: z.literal("file"),
            mediaType: z.string(),
            url: z.string(),
          }),
        ]),
      ),
    }),
  ),
})

export type LiveTurn = {
  readonly answer: string
  readonly rawStream: string
  readonly sourceHrefs: readonly string[]
  readonly status: number
}

export type TurnRecord = {
  readonly answer: string
  readonly effort: (typeof EFFORTS)[number]
  readonly id: string
  readonly prompt: string
  readonly sourceHrefs: readonly string[]
  readonly streamHasReasoningParts: boolean
}

export async function unlock(page: Page, password: string): Promise<number> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/auth/unlock") && candidate.request().method() === "POST",
  )
  await page.getByRole("textbox", { name: "접근 코드" }).fill(password)
  await page.getByRole("button", { name: "접근 코드 제출" }).click()
  return (await response).status()
}

export async function resetConversation(page: Page): Promise<void> {
  const articles = page.locator("article")
  if ((await articles.count()) === 0) return
  await page.getByRole("button", { name: "새 대화" }).click()
  await expect(articles).toHaveCount(0)
}

export async function sendLiveTurn(page: Page, prompt: string): Promise<LiveTurn> {
  const responsePromise = page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/chat") && candidate.request().method() === "POST",
    { timeout: 180_000 },
  )
  await page.getByRole("textbox", { name: "의료 질문" }).fill(prompt)
  await page.getByRole("button", { name: "질문 보내기" }).click()
  const response = await responsePromise
  const rawStream = await response.text()
  await expect(page.getByRole("button", { name: "질문 보내기" })).toBeVisible({ timeout: 180_000 })
  const assistant = page.locator("article[data-from='assistant']").last()
  await expect(assistant).toBeVisible({ timeout: 180_000 })
  const answer = (await assistant.innerText()).trim()
  const sourceTrigger = assistant.getByRole("button", { name: /출처 \d+개 보기/u })
  const sourceHrefs =
    (await sourceTrigger.count()) === 0
      ? []
      : await (async () => {
          await sourceTrigger.click()
          return assistant.locator("a[href]").evaluateAll((links) =>
            links.flatMap((link) => {
              const href = link.getAttribute("href")
              return href === null ? [] : [href]
            }),
          )
        })()
  return { answer, rawStream, sourceHrefs, status: response.status() }
}

export async function inspectNormalizedImageRequest(
  responsePromise: Promise<Response>,
): Promise<{ readonly bounded: boolean; readonly jpeg: boolean; readonly normalized: boolean }> {
  const response = await responsePromise
  const requestText = response.request().postData() ?? ""
  const parsed = ChatRequestSchema.parse(response.request().postDataJSON())
  const fileParts = parsed.messages.at(-1)?.parts.filter((part) => part.type === "file") ?? []
  return {
    bounded: Buffer.byteLength(requestText) <= 4_000_000,
    jpeg: fileParts.length === 1 && fileParts[0]?.mediaType === "image/jpeg",
    normalized:
      fileParts.length === 1 && fileParts[0]?.url.startsWith("data:image/jpeg;base64,") === true,
  }
}

export async function writeSourceBoundReport(records: readonly TurnRecord[]): Promise<void> {
  const sourcePaths = [
    "app/api/auth/unlock/route.ts",
    "app/api/chat/request-boundary.ts",
    "app/api/chat/route.ts",
    "components/chat/chat-shell.tsx",
    "components/chat/image-attachment-picker.tsx",
    "lib/ai/medical-system-prompt.ts",
    "lib/auth/require-session.ts",
    "lib/auth/session.ts",
    "lib/env.ts",
    "lib/images/normalize-image.ts",
    "tests/smoke/production-helpers.ts",
    "tests/smoke/production.spec.ts",
  ] as const
  const sourceHash = createHash("sha256")
  for (const path of sourcePaths) sourceHash.update(path).update(await readFile(path))
  const report = {
    generatedAt: new Date().toISOString(),
    records,
    source: { files: sourcePaths, sha256: sourceHash.digest("hex") },
  }
  await writeFile(resolve(EVIDENCE_ROOT, "live-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`)
}
