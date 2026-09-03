import { expect, type Page } from "@playwright/test"

type DomState = {
  readonly attribute: string
  readonly selector: string
  readonly value: string
}

type DomCount = {
  readonly count: number
  readonly selector: string
}

export async function subscribeToDomState(page: Page, state: DomState): Promise<string> {
  const marker = `${state.attribute}:${state.value}`
  await page.evaluate(
    ({ attribute, marker, selector, value }) => {
      document.documentElement.removeAttribute("data-task13-observed")
      const matches = (node: Node) => {
        if (!(node instanceof Element)) return false
        const candidate = node.matches(selector) ? node : node.querySelector(selector)
        return candidate?.getAttribute(attribute) === value
      }
      const observer = new MutationObserver((mutations) => {
        const observed = mutations.some(
          (mutation) =>
            (mutation.type === "attributes" && matches(mutation.target)) ||
            [...mutation.addedNodes].some(matches),
        )
        if (!observed) return
        document.documentElement.dataset["task13Observed"] = marker
        observer.disconnect()
      })
      observer.observe(document.body, {
        attributeFilter: [attribute],
        attributes: true,
        childList: true,
        subtree: true,
      })
    },
    { ...state, marker },
  )
  return marker
}

export async function subscribeToDomCount(page: Page, state: DomCount): Promise<string> {
  const marker = `count:${state.selector}:${state.count}`
  await page.evaluate(
    ({ count, marker, selector }) => {
      document.documentElement.removeAttribute("data-task13-observed")
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll(selector).length !== count) return
        document.documentElement.dataset["task13Observed"] = marker
        observer.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    },
    { ...state, marker },
  )
  return marker
}

export async function expectObserved(page: Page, marker: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-task13-observed", marker)
}
