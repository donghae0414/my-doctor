import { gzipSync } from "node:zlib"
import type { CDPSession, Page } from "@playwright/test"
import { z } from "zod"

const TraceEventSchema = z.looseObject({
  args: z.unknown().optional(),
  cat: z.string().optional(),
  dur: z.number().nonnegative().optional(),
  name: z.string(),
  ph: z.string().optional(),
})
const TraceSchema = z.looseObject({ traceEvents: z.array(TraceEventSchema) })

const TRACE_CATEGORIES = [
  "-*",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
  "loading",
] as const

export const LAYOUT_TRACE_BUDGET = {
  forcedLayoutDurationMs: 4,
  layoutEventCount: 80,
  maximumLayoutDurationMs: 8,
  totalLayoutDurationMs: 48,
  totalStyleDurationMs: 40,
} as const

function includesStackTrace(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(includesStackTrace)
  return Object.entries(value).some(
    ([key, nested]) => key === "stackTrace" || includesStackTrace(nested),
  )
}

function durationMs(event: z.infer<typeof TraceEventSchema>): number {
  return (event.dur ?? 0) / 1_000
}

async function readTraceStream(session: CDPSession, handle: string): Promise<string> {
  const chunks: string[] = []
  let finished = false
  while (!finished) {
    const result = await session.send("IO.read", { handle })
    chunks.push(result.data)
    finished = result.eof
  }
  await session.send("IO.close", { handle })
  return chunks.join("")
}

export async function startDevToolsLayoutTrace(page: Page) {
  const session = await page.context().newCDPSession(page)
  const browser = await session.send("Browser.getVersion")
  await session.send("Tracing.start", {
    categories: TRACE_CATEGORIES.join(","),
    options: "sampling-frequency=10000",
    transferMode: "ReturnAsStream",
  })

  return async () => {
    const completed = new Promise<string>((resolve, reject) => {
      session.once("Tracing.tracingComplete", (event) => {
        if (event.stream === undefined) {
          reject(new TypeError("CDP trace completed without a stream handle"))
          return
        }
        resolve(event.stream)
      })
    })
    await session.send("Tracing.end")
    const raw = await readTraceStream(session, await completed)
    await session.detach()
    const trace = TraceSchema.parse(JSON.parse(raw))
    const layouts = trace.traceEvents.filter((event) => event.name === "Layout")
    const styles = trace.traceEvents.filter(
      (event) => event.name === "RecalculateStyles" || event.name === "UpdateLayoutTree",
    )
    const forced = [...layouts, ...styles].filter(
      (event) => /Forced(?:Layout|Style)/u.test(event.name) || includesStackTrace(event.args),
    )
    const summary = {
      browser: {
        product: browser.product,
        protocolVersion: browser.protocolVersion,
        revision: browser.revision,
        userAgent: browser.userAgent,
      },
      budget: LAYOUT_TRACE_BUDGET,
      categories: TRACE_CATEGORIES,
      forcedLayout: {
        detection:
          "Layout/RecalculateStyles/UpdateLayoutTree carrying a stackTrace or ForcedLayout/ForcedStyle name",
        durationMs: forced.reduce((total, event) => total + durationMs(event), 0),
        eventCount: forced.length,
      },
      layout: {
        eventCount: layouts.length,
        maximumDurationMs: Math.max(0, ...layouts.map(durationMs)),
        totalDurationMs: layouts.reduce((total, event) => total + durationMs(event), 0),
      },
      style: {
        eventCount: styles.length,
        maximumDurationMs: Math.max(0, ...styles.map(durationMs)),
        totalDurationMs: styles.reduce((total, event) => total + durationMs(event), 0),
      },
      totalTraceEvents: trace.traceEvents.length,
    }
    return { compressedTrace: gzipSync(raw), summary }
  }
}
