import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const FORBIDDEN_MARKERS = ["react-grab", "react-scan", "react-doctor"]

class BundleInspectionError extends Error {
  name = "BundleInspectionError"
}

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        return collectJavaScriptFiles(path)
      }
      return entry.isFile() && path.endsWith(".js") ? [path] : []
    }),
  )
  return nestedFiles.flat()
}

async function main() {
  const buildRoot = resolve(process.argv[2] ?? ".next")
  const chunkRoot = join(buildRoot, "static", "chunks")
  const files = await collectJavaScriptFiles(chunkRoot)

  for (const file of files) {
    const contents = await readFile(file, "utf8")
    const marker = FORBIDDEN_MARKERS.find((candidate) => contents.includes(candidate))
    if (marker !== undefined) {
      throw new BundleInspectionError(`Development inspection marker found: ${marker}`)
    }
  }

  process.stdout.write(`PASS: inspected ${files.length} production chunks; devtools absent\n`)
}

await main()
