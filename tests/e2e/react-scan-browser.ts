import { instrument, type LiteEvent } from "react-scan/lite"

type CapturedCommit = Pick<LiteEvent, "kind" | "timestamp" | "tree">

declare global {
  interface Window {
    __reactScanCommits: CapturedCommit[]
  }
}

const commits: CapturedCommit[] = []
window.__reactScanCommits = commits

instrument({
  includeFiberIdentity: true,
  includeFiberSource: true,
  onEvent: (event) => {
    if (event.kind !== "commit") return
    commits.push({
      kind: event.kind,
      timestamp: event.timestamp,
      ...(event.tree === undefined ? {} : { tree: event.tree }),
    })
  },
  recordChangeDescriptions: true,
})
