import { expect } from "@playwright/test"
import { z } from "zod"

const MotionRecordSchema = z.object({
  delay: z.number(),
  duration: z.number(),
  properties: z.array(z.string()),
  target: z.string(),
})
const RuntimeReportSchema = z.object({
  longTasks: z.array(z.number()),
  records: z.array(MotionRecordSchema),
})

export type MotionMode = "normal" | "reduced"
export type RuntimeReport = z.infer<typeof RuntimeReportSchema>

export async function installRuntimeAudit(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const records: Array<{
      delay: number
      duration: number
      properties: string[]
      target: string
    }> = []
    const longTasks: number[] = []
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function animateWithAudit(keyframes, options) {
      const frames = (Array.isArray(keyframes) ? keyframes : [keyframes]).filter(
        (frame) => frame !== null,
      )
      const properties = [...new Set(frames.flatMap((frame) => Object.keys(frame)))].sort()
      const timing = typeof options === "number" ? { delay: 0, duration: options } : options
      const delay = typeof timing?.delay === "number" ? timing.delay : 0
      const duration = typeof timing?.duration === "number" ? timing.duration : 0
      const target =
        this.getAttribute("data-motion-surface") ??
        this.getAttribute("data-testid") ??
        this.getAttribute("data-from") ??
        this.tagName.toLowerCase()
      records.push({ delay, duration, properties, target })
      document.documentElement.dataset["motionAudit"] = JSON.stringify({ longTasks, records })
      return originalAnimate.call(this, keyframes, options)
    }
    if (typeof PerformanceObserver !== "undefined") {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration)
        document.documentElement.dataset["motionAudit"] = JSON.stringify({ longTasks, records })
      })
      try {
        observer.observe({ entryTypes: ["longtask"] })
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
      }
    }
    document.documentElement.dataset["motionAudit"] = JSON.stringify({ longTasks, records })
  })
}

export async function runtimeReport(page: import("@playwright/test").Page) {
  const raw =
    (await page.locator("html").getAttribute("data-motion-audit")) ??
    JSON.stringify({ longTasks: [], records: [] })
  return RuntimeReportSchema.parse(JSON.parse(raw))
}

export function expectCompositedOnly(records: RuntimeReport["records"]) {
  const metadata = new Set(["composite", "easing", "offset"])
  const animated = new Set(["filter", "opacity", "transform"])
  for (const record of records) {
    for (const property of record.properties) {
      expect(metadata.has(property) || animated.has(property), JSON.stringify(record)).toBe(true)
    }
  }
}
