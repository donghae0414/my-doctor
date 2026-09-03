import { Suspense } from "react"
import ImageAttachmentsPage from "@/tests/e2e/image-attachments-page"

// biome-ignore lint/style/noDefaultExport: Next.js route fixtures require a default export.
export default function MotionAttachmentsPage() {
  return (
    <Suspense fallback={null}>
      <ImageAttachmentsPage />
    </Suspense>
  )
}
