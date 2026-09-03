import type { Transition } from "motion/react"

export const MOTION_EASE_OUT = [0.16, 1, 0.3, 1] as const
export const MOTION_EASE_COLOR = [0.4, 0, 0.2, 1] as const

export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} satisfies Transition

export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} satisfies Transition

export const STATE_TRANSITION = {
  duration: 0.2,
  ease: MOTION_EASE_OUT,
} satisfies Transition

export const REDUCED_OPACITY_TRANSITION = {
  duration: 0.15,
  ease: MOTION_EASE_COLOR,
} satisfies Transition

export const DIGIT_TRANSITION = {
  duration: 0.22,
  ease: MOTION_EASE_OUT,
} satisfies Transition

export const ERROR_SHAKE_TRANSITION = {
  duration: 0.45,
  ease: MOTION_EASE_OUT,
} satisfies Transition

export const MOTION_STAGGER_SECONDS = 0.025
