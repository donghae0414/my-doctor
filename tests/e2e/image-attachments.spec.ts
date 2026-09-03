import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { z } from "zod"

const evidenceRoot = resolve(".omo/evidence/task-11-postpartum-medical-chat")
const acceptedRoot = resolve(evidenceRoot, "accepted")
const jpegPath = resolve("tests/fixtures/images/oriented-6.jpg")
const heicPath = resolve("tests/fixtures/images/still.heic")
const corruptHeicPath = resolve("tests/fixtures/images/corrupt.heic")
const unsupportedPath = resolve("tests/fixtures/images/unsupported.txt")

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  await rm(acceptedRoot, { force: true, recursive: true })
  await mkdir(acceptedRoot, { recursive: true })
})

async function openComposer(page: import("@playwright/test").Page, theme = "light") {
  await page.addInitScript(() => {
    const originalCreate = URL.createObjectURL.bind(URL)
    const originalRevoke = URL.revokeObjectURL.bind(URL)
    const created: string[] = []
    const revoked: string[] = []
    const publish = () => {
      document.documentElement.dataset["createdImageUrls"] = JSON.stringify(created)
      document.documentElement.dataset["revokedImageUrls"] = JSON.stringify(revoked)
    }
    URL.createObjectURL = (blob) => {
      const url = originalCreate(blob)
      created.push(url)
      publish()
      return url
    }
    URL.revokeObjectURL = (url) => {
      revoked.push(url)
      publish()
      originalRevoke(url)
    }
  })
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto(`/image-attachments-task-11?theme=${theme}`)
  await expect(page.getByLabel("사진 보관함에서 선택")).toBeAttached()
}

async function expectReadyCount(page: import("@playwright/test").Page, count: number) {
  await expect(
    page.getByTestId("image-preview-grid").getByText("첨부 완료", { exact: true }),
  ).toHaveCount(count, { timeout: 30_000 })
}

test("selects JPEG and HEIC, removes one, sends the current turn, cleans URLs, and strips old bytes on turn two", async ({
  page,
}) => {
  await openComposer(page)
  const gallery = page.getByLabel("사진 보관함에서 선택")

  await gallery.setInputFiles([jpegPath, heicPath])
  await expectReadyCount(page, 2)
  await expect(page.getByRole("button", { name: "oriented-6.jpg 제거" })).toBeVisible()
  await expect(page.getByRole("button", { name: "still.heic 제거" })).toBeVisible()
  await page.getByRole("button", { name: "oriented-6.jpg 제거" }).click()
  await page.getByRole("textbox", { name: "의료 질문" }).fill("회복 상태를 확인해 주세요")
  await page.getByRole("button", { name: "질문 보내기" }).click()

  await expect(page.locator("html")).toHaveAttribute("data-transport-calls", "1", {
    timeout: 30_000,
  })
  const firstRequest = await page.locator("html").getAttribute("data-last-request")
  expect(firstRequest).not.toBeNull()
  expect(firstRequest).toContain("image/jpeg")
  expect(firstRequest).not.toContain("image/heic")
  await expect(page.locator("article[data-from='user'] img")).toHaveCount(1)
  const firstImageUrl = await page.locator("article[data-from='user'] img").getAttribute("src")
  expect(firstImageUrl).not.toBeNull()

  await gallery.setInputFiles(jpegPath)
  await expectReadyCount(page, 1)
  await page.getByRole("textbox", { name: "의료 질문" }).fill("두 번째 사진입니다")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-transport-calls", "2", {
    timeout: 30_000,
  })
  const secondRequest = await page.locator("html").getAttribute("data-last-request")
  expect(secondRequest).not.toBeNull()
  expect(secondRequest).not.toContain(firstImageUrl ?? "unreachable-image-url")
  expect(secondRequest).toContain("이전 사용자 첨부 이미지")
  expect(secondRequest).toContain("still.heic")
  await expect(page.locator("article[data-from='user'] img")).toHaveCount(2)

  const created = z
    .array(z.string())
    .parse(JSON.parse((await page.locator("html").getAttribute("data-created-image-urls")) ?? "[]"))
  const revoked = z
    .array(z.string())
    .parse(JSON.parse((await page.locator("html").getAttribute("data-revoked-image-urls")) ?? "[]"))
  expect(created.length).toBeGreaterThanOrEqual(3)
  expect(revoked).toEqual(expect.arrayContaining(created))
})

test("rejects unsupported, corrupt, oversized, fifth, and conversion-failure inputs locally", async ({
  page,
}) => {
  await openComposer(page)
  const gallery = page.getByLabel("사진 보관함에서 선택")

  await gallery.setInputFiles(unsupportedPath)
  await expect(page.getByText("지원하지 않는 이미지 형식입니다.", { exact: true })).toBeVisible()
  await gallery.setInputFiles(corruptHeicPath)
  await expect(page.getByText(/이미지를 읽을 수 없습니다/u)).toBeVisible()

  const jpegBytes = await readFile(jpegPath)
  await gallery.setInputFiles({
    buffer: Buffer.concat([jpegBytes, Buffer.alloc(10 * 1024 * 1024 + 1 - jpegBytes.byteLength)]),
    mimeType: "image/jpeg",
    name: "oversized.jpg",
  })
  await expect(
    page.getByText("이미지 한 장의 크기는 10MB 이하여야 합니다.", { exact: true }),
  ).toBeVisible()

  await gallery.setInputFiles([jpegPath, jpegPath, jpegPath, jpegPath])
  await expectReadyCount(page, 4)
  await page.getByLabel("후면 카메라로 촬영").setInputFiles(jpegPath)
  await expect(
    page.getByText("이미지는 한 번에 최대 4장까지 첨부할 수 있습니다.", { exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "새 대화" }).click()

  await gallery.setInputFiles({
    buffer: await readFile(heicPath),
    mimeType: "image/heic",
    name: "conversion-failure.heic",
  })
  await expect(page.getByText(/이미지를 읽을 수 없습니다/u)).toBeVisible()
  await expect(page.locator("html")).not.toHaveAttribute("data-transport-calls")

  await page.getByRole("button", { name: "새 대화" }).click()
  await gallery.setInputFiles({
    buffer: await readFile(jpegPath),
    mimeType: "image/jpeg",
    name: "late.jpg",
  })
  await expect(page.getByText("이미지 처리 중", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "새 대화" }).click()
  await page.evaluate(() => window.dispatchEvent(new Event("resolve-late-normalization")))
  await page.getByRole("textbox", { name: "의료 질문" }).fill("초기화 뒤 새 질문")
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-transport-calls", "1")
  expect(await page.locator("html").getAttribute("data-last-request")).not.toContain("late.jpg")
})

test("blocks over-budget transport and captures mobile CJK and accessibility evidence", async ({
  page,
}) => {
  const artifacts: Array<{ readonly path: string; readonly sha256: string }> = []
  for (const theme of ["light", "dark"] as const) {
    await openComposer(page, theme)
    await page
      .getByLabel("사진 보관함에서 선택")
      .setInputFiles([jpegPath, jpegPath, jpegPath, jpegPath])
    await expectReadyCount(page, 4)
    const grid = page.getByTestId("image-preview-grid")
    await grid.evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    )
    const geometry = await grid.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    const name = `image-attachments-375-${theme}.png`
    const path = resolve(acceptedRoot, name)
    await page.screenshot({ fullPage: true, path })
    artifacts.push({
      path: name,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    })
  }

  await page.getByRole("textbox", { name: "의료 질문" }).evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new TypeError("missing composer textarea")
    element.value = "가".repeat(1_400_000)
  })
  await page.getByRole("button", { name: "질문 보내기" }).click()
  await expect(page.getByText(/전송 가능한 크기로 줄일 수 없습니다/u)).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator("html")).not.toHaveAttribute("data-transport-calls")

  await writeFile(
    resolve(acceptedRoot, "manifest.json"),
    `${JSON.stringify({ artifacts, generatedAt: new Date().toISOString(), task: 11 }, null, 2)}\n`,
  )
})
