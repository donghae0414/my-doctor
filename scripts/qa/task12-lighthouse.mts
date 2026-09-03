import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { chromium } from "@playwright/test"
import lighthouse from "lighthouse"
import type Config from "lighthouse/types/config.js"
import { z } from "zod"

const execFileAsync = promisify(execFile)
const ArgumentsSchema = z.tuple([z.url()])
const [auditedUrl] = ArgumentsSchema.parse(process.argv.slice(2))
const outputDirectory =
  process.env["TASK12_LIGHTHOUSE_OUTPUT"] ??
  ".omo/evidence/task-12-postpartum-medical-chat/lighthouse-current"
const remoteDebuggingPort = z.coerce
  .number()
  .int()
  .min(1_024)
  .max(65_535)
  .parse(process.env["TASK12_CHROME_CDP_PORT"] ?? 39_000 + (process.pid % 10_000))
const chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const categories = ["performance", "accessibility", "best-practices", "seo"] as const
const presets = ["mobile", "desktop"] as const
const measuredRuns = [1, 2, 3] as const

await mkdir(outputDirectory, { recursive: true })
const { stdout: binaryVersionOutput } = await execFileAsync(chromeBinary, ["--version"])
const browser = await chromium.launch({
  args: [`--remote-debugging-port=${remoteDebuggingPort}`],
  channel: "chrome",
  headless: true,
})
const failures: string[] = []

try {
  const context = await browser.newContext()
  const warmPage = await context.newPage()
  const session = await context.newCDPSession(warmPage)
  const protocol = await session.send("Browser.getVersion")
  const warmResponse = await warmPage.goto(auditedUrl, { waitUntil: "networkidle" })
  if (warmResponse === null) throw new TypeError("Warm navigation returned no response")
  const warmMetadata = {
    completedAt: new Date().toISOString(),
    finalUrl: warmPage.url(),
    procedure:
      "Playwright channel=chrome navigated once to networkidle; three Lighthouse runs per preset reused the same browser with disableStorageReset=true.",
    status: warmResponse.status(),
  }
  await warmPage.close()

  const methodology = {
    auditedUrl,
    browser: {
      binary: chromeBinary,
      binaryVersion: binaryVersionOutput.trim(),
      playwrightVersion: browser.version(),
      product: protocol.product,
      protocolVersion: protocol.protocolVersion,
      revision: protocol.revision,
      userAgent: protocol.userAgent,
    },
    cache: warmMetadata,
    launch: {
      cdpPort: remoteDebuggingPort,
      channel: "chrome",
      launcher: "Playwright chromium.launch",
    },
    measuredRuns: measuredRuns.length,
    presets,
  }
  await writeFile(
    `${outputDirectory}/methodology.json`,
    `${JSON.stringify(methodology, null, 2)}\n`,
  )
  console.log(JSON.stringify({ event: "methodology", methodology }))

  for (const preset of presets) {
    for (const run of measuredRuns) {
      const config = {
        extends: "lighthouse:default",
        settings: {
          disableStorageReset: true,
          formFactor: preset,
          onlyCategories: [...categories],
          ...(preset === "desktop"
            ? {
                screenEmulation: {
                  deviceScaleFactor: 1,
                  height: 940,
                  mobile: false,
                  width: 1_350,
                },
                throttling: {
                  cpuSlowdownMultiplier: 1,
                  requestLatencyMs: 0,
                  rttMs: 40,
                  throughputKbps: 10_240,
                },
              }
            : {}),
        },
      } satisfies Config
      const result = await lighthouse(
        auditedUrl,
        { logLevel: "error", port: remoteDebuggingPort },
        config,
      )
      if (result === undefined) throw new TypeError("Lighthouse returned no result")
      const scores = Object.fromEntries(
        categories.map((category) => [
          category,
          Math.round((result.lhr.categories[category]?.score ?? 0) * 100),
        ]),
      )
      const report = {
        metadata: {
          auditedUrl,
          browser: methodology.browser,
          cache: warmMetadata,
          configSettings: result.lhr.configSettings,
          fetchTime: result.lhr.fetchTime,
          finalDisplayedUrl: result.lhr.finalDisplayedUrl,
          finalUrl: result.lhr.finalUrl,
          requestedUrl: result.lhr.requestedUrl,
          run,
          userAgent: result.lhr.userAgent,
        },
        lhr: result.lhr,
        scores,
      }
      await writeFile(
        `${outputDirectory}/${preset}-${run}.json`,
        `${JSON.stringify(report, null, 2)}\n`,
      )
      console.log(JSON.stringify({ event: "measured", preset, run, scores }))
      if (Object.values(scores).some((score) => score !== 100)) {
        failures.push(`${preset} run ${run}`)
      }
    }
  }
  if (failures.length > 0) {
    throw new RangeError(`Lighthouse 100 gate failed: ${failures.join(", ")}`)
  }
} finally {
  await browser.close()
}
