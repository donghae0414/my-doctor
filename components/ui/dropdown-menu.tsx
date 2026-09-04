"use client"

import { CheckIcon, ChevronRightIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup
export const DropdownMenuRadioItemIndicator = DropdownMenuPrimitive.ItemIndicator
export const DropdownMenuSub = DropdownMenuPrimitive.Sub

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn(
          "z-50 min-w-40 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2 py-1.5 text-sm font-medium", className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "relative flex min-h-11 cursor-default select-none items-center rounded-sm py-2 pe-2 ps-8 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownMenuRadioItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuRadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(
        "flex min-h-11 cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      className={cn(
        "z-50 min-w-36 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}
