"use client"

import { AnimatePresence, animate, m, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react"
import { useEffect, useRef, useState } from "react"

import {
  DIGIT_TRANSITION,
  ERROR_SHAKE_TRANSITION,
  REDUCED_OPACITY_TRANSITION,
  SPRING_LAYOUT,
  SPRING_PRESS,
  STATE_TRANSITION,
} from "@/components/motion/motion-tokens"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_CODE_LENGTH = 12
const GENERIC_ERROR = "접근 코드를 확인해 주세요."
const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const

type SubmissionState = "idle" | "pending" | "error"

export function DoorLock() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [state, setState] = useState<SubmissionState>("idle")
  const [shakeKey, setShakeKey] = useState(0)
  const slotsRef = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()
  const isPending = state === "pending"

  useEffect(() => {
    if (state !== "error" || shakeKey === 0 || reduceMotion || slotsRef.current === null) return
    const controls = animate(
      slotsRef.current,
      { x: [0, -5, 5, -3, 3, -1, 0] },
      ERROR_SHAKE_TRANSITION,
    )
    return () => controls.stop()
  }, [reduceMotion, shakeKey, state])

  const appendDigit = (digit: string) => {
    if (isPending) return
    setState("idle")
    setCode((current) => `${current}${digit}`.slice(0, MAX_CODE_LENGTH))
  }

  const removeDigit = () => {
    if (isPending) return
    setState("idle")
    setCode((current) => current.slice(0, -1))
  }

  const showError = () => {
    setState("error")
    setShakeKey((current) => current + 1)
  }

  const submit = async () => {
    if (isPending) return
    if (code.length === 0) {
      showError()
      return
    }

    setState("pending")
    try {
      const { default: ky } = await import("ky")
      const response = await ky.post("/api/auth/unlock", {
        json: { code },
        retry: 0,
        throwHttpErrors: false,
      })
      if (response.status !== 204) {
        showError()
        return
      }
      router.refresh()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      showError()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit()
  }

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    setState("idle")
    setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, MAX_CODE_LENGTH))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isPending || event.metaKey || event.ctrlKey || event.altKey) return
    if (/^\d$/u.test(event.key)) {
      event.preventDefault()
      appendDigit(event.key)
      return
    }
    if (event.key === "Backspace" || event.key === "#") {
      event.preventDefault()
      removeDigit()
      return
    }
    if (event.key === "Enter" || event.key === "*") {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <m.main
      animate={{ opacity: 1, y: 0 }}
      className="grid min-h-[100dvh] place-items-center bg-background p-4 text-foreground"
      data-auth-state="locked"
      data-motion-surface="screen"
      initial={false}
      transition={{
        opacity: reduceMotion ? REDUCED_OPACITY_TRANSITION : STATE_TRANSITION,
        y: SPRING_LAYOUT,
      }}
    >
      <section
        aria-labelledby="door-lock-heading"
        className="grid w-full max-w-sm gap-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <header className="grid gap-2 text-center">
          <p className="m-0 text-sm font-semibold text-muted-foreground">비공개 의료 상담</p>
          <h1 className="m-0 text-3xl font-bold leading-9" id="door-lock-heading">
            <span className="block whitespace-nowrap">접근 코드를</span>
            <span className="block whitespace-nowrap">입력해 주세요</span>
          </h1>
          <p className="m-0 break-keep text-base leading-6 text-muted-foreground">
            가족에게 전달받은 숫자 코드를 사용하세요.
          </p>
        </header>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="relative grid cursor-text gap-2" htmlFor="door-lock-code">
            <span className="text-sm font-medium">접근 코드</span>
            <input
              aria-describedby="door-lock-message"
              aria-invalid={state === "error"}
              aria-label="접근 코드"
              autoComplete="off"
              className="peer absolute inset-x-0 bottom-0 h-14 w-full cursor-text opacity-0"
              disabled={isPending}
              id="door-lock-code"
              inputMode="numeric"
              maxLength={MAX_CODE_LENGTH}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              pattern="[0-9]*"
              type="password"
              value={code}
            />
            <m.span
              aria-hidden="true"
              className={cn(
                "grid min-h-14 place-items-center overflow-hidden rounded-lg border bg-background px-4 text-3xl font-semibold tracking-[0.2em] shadow-xs transition-[border-color,box-shadow] duration-150",
                state === "error"
                  ? "border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40"
                  : "border-input peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
              )}
              data-motion-surface="error-shake"
              data-shake-key={shakeKey}
              data-testid="masked-slots"
              ref={slotsRef}
            >
              {code.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span
                  className="relative inline-flex min-h-9 items-center"
                  data-motion-surface="digits"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {Array.from({ length: code.length }, (_, index) => (
                      <m.span
                        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                        className="inline-block"
                        data-testid="masked-digit"
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : { filter: "blur(4px)", opacity: 0, y: -14 }
                        }
                        initial={
                          reduceMotion ? { opacity: 0 } : { filter: "blur(4px)", opacity: 0, y: 14 }
                        }
                        // biome-ignore lint/suspicious/noArrayIndexKey: each index is a fixed masked slot position.
                        key={index}
                        transition={reduceMotion ? { duration: 0 } : DIGIT_TRANSITION}
                      >
                        •
                      </m.span>
                    ))}
                  </AnimatePresence>
                </span>
              )}
            </m.span>
          </label>

          <p
            className={cn(
              "m-0 min-h-5 break-keep text-center text-sm leading-5",
              state === "error" ? "text-destructive" : "text-muted-foreground",
            )}
            id="door-lock-message"
            role={state === "error" ? "alert" : "status"}
          >
            {state === "error"
              ? GENERIC_ERROR
              : state === "pending"
                ? "확인하고 있습니다."
                : "숫자 키 또는 아래 키패드를 사용할 수 있습니다."}
          </p>

          <fieldset
            aria-label="접근 코드 키패드"
            className="m-0 grid grid-cols-3 gap-3 border-0 p-0"
          >
            {KEYPAD_KEYS.map((key) => {
              const isDelete = key === "#"
              const isSubmit = key === "*"
              const label = isDelete ? "한 자리 지우기" : isSubmit ? "접근 코드 제출" : key
              return (
                <m.div
                  data-testid="keypad-motion"
                  key={key}
                  transition={SPRING_PRESS}
                  {...(reduceMotion || isPending ? {} : { whileTap: { scale: 0.97 } })}
                >
                  <Button
                    aria-label={label}
                    className="min-h-14 w-full text-lg"
                    disabled={isPending}
                    onClick={isDelete ? removeDigit : isSubmit ? undefined : () => appendDigit(key)}
                    type={isSubmit ? "submit" : "button"}
                    variant={isSubmit ? "secondary" : "outline"}
                  >
                    <span aria-hidden={isDelete || isSubmit}>{key}</span>
                  </Button>
                </m.div>
              )
            })}
          </fieldset>
        </form>
      </section>
    </m.main>
  )
}
