"use client"

import dynamic from "next/dynamic"

const ChatShell = dynamic(() =>
  import("@/components/chat/chat-shell").then((module) => module.ChatShell),
)

export function AuthenticatedSurface() {
  return <ChatShell />
}
