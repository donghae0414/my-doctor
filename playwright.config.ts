import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { z } from "zod"

const TaskScopeSchema = z.enum([
  "task-1",
  "task-2",
  "task-7",
  "task-9",
  "task-10",
  "task-11",
  "task-12",
  "task-13",
  "task-14",
  "task-15",
])
const inferredTaskScope = process.argv.some((argument) => argument.includes("tests/smoke/"))
  ? "task-15"
  : process.argv.some((argument) => argument.includes("tests/e2e/task13"))
    ? "task-13"
  : process.argv.some(
        (argument) =>
          argument.includes("tests/e2e/motion") || argument.includes("tests/e2e/react-scan"),
      )
    ? "task-12"
    : process.argv.some((argument) => argument.includes("tests/e2e/image-attachments"))
      ? "task-11"
      : process.argv.some((argument) => argument.includes("tests/e2e/door-lock"))
        ? "task-9"
        : process.argv.some((argument) => argument.includes("tests/e2e/chat-shell"))
          ? "task-10"
          : process.argv.some((argument) => argument.includes("tests/design/primitive-showcase"))
            ? "task-7"
            : process.argv.some((argument) => argument.includes("tests/design/"))
              ? "task-2"
              : "task-1"
const taskScope = TaskScopeSchema.parse(process.env["PLAYWRIGHT_TASK_SCOPE"] ?? inferredTaskScope)
process.env["PLAYWRIGHT_TASK_SCOPE"] = taskScope

const RunIdSchema = z.string().regex(/^task-(?:1|2|7|9|10|11|12|13|14|15)-\d+-\d+$/u)
const runId = RunIdSchema.parse(
  process.env["PLAYWRIGHT_RUN_ID"] ?? `${taskScope}-${Date.now()}-${process.pid}`,
)
process.env["PLAYWRIGHT_RUN_ID"] = runId

const serverPort = z.coerce
  .number()
  .int()
  .min(1_024)
  .max(65_535)
  .parse(process.env["PLAYWRIGHT_SERVER_PORT"] ?? 20_000 + (process.pid % 20_000))
process.env["PLAYWRIGHT_SERVER_PORT"] = String(serverPort)

const serverUrl =
  taskScope === "task-15"
    ? z.url().parse(process.env["BASE_URL"])
    : `http://127.0.0.1:${serverPort}`
const nextDistDirectory = `.next-playwright/${runId}`
const runEvidenceDirectory = join(
  ".omo/evidence",
  `${taskScope}-postpartum-medical-chat`,
  "playwright-runs",
  runId,
)
const usesWebServer = [
  "task-1",
  "task-7",
  "task-9",
  "task-10",
  "task-11",
  "task-12",
  "task-13",
  "task-14",
].includes(taskScope)

export default defineConfig({
  testDir: "./tests",
  outputDir: join(runEvidenceDirectory, "test-results"),
  fullyParallel: taskScope !== "task-13",
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: join(runEvidenceDirectory, "report.json") }]],
  use: {
    baseURL: serverUrl,
    trace: "retain-on-failure",
  },
  ...(taskScope === "task-13" ? { testMatch: "**/task13*.spec.ts", workers: 1 } : {}),
  ...(taskScope === "task-14" ? { testMatch: "**/visual/task14*.spec.ts", workers: 1 } : {}),
  ...(taskScope === "task-15" ? { testMatch: "**/smoke/production.spec.ts", workers: 1 } : {}),
  ...(usesWebServer
    ? {
        webServer: {
          command:
            taskScope === "task-14" && process.env["TASK14_SERVER_MODE"] === "development"
              ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/visual/run-task14-dev-server.sh`
              : taskScope === "task-13" || taskScope === "task-14"
                ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/e2e/run-task13-server.sh`
                : taskScope === "task-7"
                  ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/design/run-primitive-showcase-server.sh`
                  : taskScope === "task-12"
                    ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/e2e/run-motion-server.sh`
                    : taskScope === "task-11"
                      ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/e2e/run-image-attachments-server.sh`
                      : taskScope === "task-10"
                        ? `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} PLAYWRIGHT_SERVER_PORT=${serverPort} tests/e2e/run-chat-shell-server.sh`
                        : taskScope === "task-9"
                          ? `OPENAI_API_KEY=e2e-openai DOORLOCK_PASSWORD=1234 AUTH_SECRET=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8 NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS=1 PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} pnpm dev --hostname 127.0.0.1 --port ${serverPort}`
                          : `PLAYWRIGHT_NEXT_DIST_DIR=${nextDistDirectory} pnpm dev --hostname 127.0.0.1 --port ${serverPort}`,
          url: serverUrl,
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(taskScope === "task-13"
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
})
