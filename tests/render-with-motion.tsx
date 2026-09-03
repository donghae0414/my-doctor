import { render } from "@testing-library/react"
import type { ReactNode } from "react"

import { MotionProvider } from "@/components/motion/motion-provider"

export function renderWithMotion(ui: ReactNode) {
  return render(ui, { wrapper: MotionProvider })
}
