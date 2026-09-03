import { Slot } from "radix-ui"
import type { ButtonHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive"
type ButtonSize = "default" | "icon"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly asChild?: boolean
  readonly size?: ButtonSize
  readonly variant?: ButtonVariant
}

const variants = {
  default: "bg-primary text-primary-foreground hover:brightness-95",
  outline:
    "border border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive: "border border-destructive bg-card text-foreground hover:bg-accent",
} as const

const sizes = {
  default: "min-h-11 px-4 py-2",
  icon: "size-11 shrink-0",
} as const

/** Registry source: https://ui.shadcn.com/r/styles/new-york/button.json */
export function Button({
  asChild = false,
  className,
  size = "default",
  type = "button",
  variant = "outline",
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button"
  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,filter,opacity] duration-150 ease-in-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=hover]:bg-accent data-[state=hover]:text-accent-foreground data-[state=pressed]:bg-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      type={asChild ? undefined : type}
      {...props}
    />
  )
}
