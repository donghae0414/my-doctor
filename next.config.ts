import type { NextConfig } from "next"
import { z } from "zod"

const PlaywrightDistDirectorySchema = z
  .string()
  .regex(/^\.next-playwright\/task-(?:1|2|7|9|10|11|12|13|14)-\d+-\d+$/u)
const playwrightDistDirectory = process.env["PLAYWRIGHT_NEXT_DIST_DIR"]
const distDir =
  playwrightDistDirectory === undefined
    ? ".next"
    : PlaywrightDistDirectorySchema.parse(playwrightDistDirectory)

const nextConfig = {
  devIndicators: false,
  distDir,
  turbopack: {
    root: process.cwd(),
  },
} satisfies NextConfig

export default nextConfig
