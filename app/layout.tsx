import type { Metadata } from "next"
import { Outfit } from "next/font/google"
import Script from "next/script"
import type { ReactNode } from "react"

import { MotionProvider } from "@/components/motion/motion-provider"
import "./globals.css"

const outfit = Outfit({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-outfit",
})

export const metadata: Metadata = {
  title: "산후·신생아 의료 상담",
  description: "산후 회복과 신생아 돌봄을 위한 비공개 한국어 의료 정보 상담",
}

type RootLayoutProperties = {
  readonly children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProperties) {
  const enableReactDevTools =
    process.env.NODE_ENV === "development" &&
    process.env["NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS"] !== "1"

  return (
    <html className={outfit.variable} lang="ko">
      <head>
        {enableReactDevTools ? (
          <>
            <Script
              crossOrigin="anonymous"
              src="https://unpkg.com/react-grab/dist/index.global.js"
              strategy="beforeInteractive"
            />
            <Script
              crossOrigin="anonymous"
              src="https://unpkg.com/react-scan/dist/auto.global.js"
              strategy="beforeInteractive"
            />
          </>
        ) : null}
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
