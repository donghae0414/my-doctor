// allow: SIZE_OK — Playwright page.evaluate requires this browser audit to remain self-contained.
export function auditTask14Surface() {
  const activeChat = document.querySelector("[data-chat-state='active']") !== null
  const composer = document.querySelector<HTMLElement>("[data-testid='chat-composer-region']")
  const composerRect = composer?.getBoundingClientRect()
  const composerDescendants =
    composer === null
      ? []
      : [...composer.querySelectorAll<HTMLElement>("form,textarea,select,button,p")]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => element.getBoundingClientRect())
  const header = document.querySelector<HTMLElement>("header")
  const footer = document.querySelector<HTMLElement>("footer")
  const conversation = document.querySelector<HTMLElement>("[data-scroll-owner='conversation']")
  const headerRect = header?.getBoundingClientRect()
  const footerRect = footer?.getBoundingClientRect()
  const conversationRect = conversation?.getBoundingClientRect()
  const isRendered = (element: HTMLElement) => {
    const style = getComputedStyle(element)
    return (
      element.getClientRects().length > 0 &&
      style.clip !== "rect(0px, 0px, 0px, 0px)" &&
      style.clipPath !== "inset(50%)" &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    )
  }
  const semanticDescendants = (region: HTMLElement | null) =>
    region === null
      ? []
      : [
          ...region.querySelectorAll<HTMLElement>(
            "h1,h2,p,button,a,input,textarea,select,label,img,form,span[role='status']",
          ),
        ].filter(isRendered)
  const headerDescendants = semanticDescendants(header)
  const footerDescendants = semanticDescendants(footer)
  const form = footer?.querySelector<HTMLElement>("form") ?? null
  const formDescendants = semanticDescendants(form)
  const statuses = [
    ...(header?.querySelectorAll<HTMLElement>("span[role='status']") ?? []),
    ...(footer?.querySelectorAll<HTMLElement>("span[role='status']") ?? []),
  ].filter(isRendered)
  const containsRect = (outer: DOMRect, inner: DOMRect) =>
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1 &&
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1
  const rectIsInViewport = (rect: DOMRect) =>
    rect.top >= -1 &&
    rect.bottom <= window.innerHeight + 1 &&
    rect.left >= -1 &&
    rect.right <= window.innerWidth + 1
  const paintFragments = (owner: HTMLElement, includeText = true) => {
    const fragments = [...owner.getClientRects()].map((rect) => ({ rect, requiresOwner: false }))
    if (!includeText) return fragments
    const textWalker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT)
    for (
      let textNode = textWalker.nextNode();
      textNode !== null;
      textNode = textWalker.nextNode()
    ) {
      const parent = textNode.parentElement
      if (parent === null || !isRendered(parent)) continue
      const range = document.createRange()
      range.selectNodeContents(textNode)
      fragments.push(...[...range.getClientRects()].map((rect) => ({ rect, requiresOwner: true })))
    }
    return fragments
  }
  const isInsideRoundedRect = (element: HTMLElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect()
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return false
    const style = getComputedStyle(element)
    const radiusPair = (value: string) => {
      const [horizontal = 0, vertical = horizontal] = value.split(" ").map(Number.parseFloat)
      return { horizontal, vertical }
    }
    const corners = [
      { ...radiusPair(style.borderTopLeftRadius), x: rect.left, y: rect.top },
      { ...radiusPair(style.borderTopRightRadius), x: rect.right, y: rect.top },
      { ...radiusPair(style.borderBottomRightRadius), x: rect.right, y: rect.bottom },
      { ...radiusPair(style.borderBottomLeftRadius), x: rect.left, y: rect.bottom },
    ]
    return corners.every((corner) => {
      const centerX =
        corner.x === rect.left ? corner.x + corner.horizontal : corner.x - corner.horizontal
      const centerY =
        corner.y === rect.top ? corner.y + corner.vertical : corner.y - corner.vertical
      const inCornerX = corner.x === rect.left ? x < centerX : x > centerX
      const inCornerY = corner.y === rect.top ? y < centerY : y > centerY
      if (!inCornerX || !inCornerY || corner.horizontal === 0 || corner.vertical === 0) return true
      return ((x - centerX) / corner.horizontal) ** 2 + ((y - centerY) / corner.vertical) ** 2 <= 1
    })
  }
  const ancestorClipKind = (owner: HTMLElement, x: number, y: number) => {
    for (let ancestor = owner.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      if (!/(clip|hidden)/u.test(`${style.overflowX} ${style.overflowY}`)) continue
      const rect = ancestor.getBoundingClientRect()
      const insideRect = x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
      if (!insideRect) return "rectangular"
      if (!isInsideRoundedRect(ancestor, x, y)) return "rounded"
    }
    return null
  }
  const paintCoverageFailure = (owner: HTMLElement, includeText = true) => {
    const intentionallyDisabled =
      owner.matches(":disabled") ||
      (owner.tagName === "LABEL" && owner.querySelector("input:disabled") !== null)
    if (getComputedStyle(owner).pointerEvents === "none" && !intentionallyDisabled) {
      return { hit: null, name: owner.tagName, occluder: "POINTER_EVENTS_NONE", x: 0, y: 0 }
    }
    for (const { rect, requiresOwner } of paintFragments(owner, includeText)) {
      for (let y = Math.floor(rect.top); y < Math.ceil(rect.bottom); y += 1) {
        for (let x = Math.floor(rect.left); x < Math.ceil(rect.right); x += 1) {
          if (
            x + 0.5 < rect.left ||
            x + 0.5 >= rect.right ||
            y + 0.5 < rect.top ||
            y + 0.5 >= rect.bottom
          ) {
            continue
          }
          const pointX = Math.min(x + 0.5, window.innerWidth - 1)
          const pointY = Math.min(y + 0.5, window.innerHeight - 1)
          const stack = document.elementsFromPoint(pointX, pointY)
          const directOwnerIndex = stack.findIndex(
            (element) => element === owner || owner.contains(element),
          )
          const clipKind = ancestorClipKind(owner, pointX, pointY)
          const ownerIndex =
            directOwnerIndex >= 0
              ? directOwnerIndex
              : clipKind !== null
                ? -1
                : stack.findIndex((element) => element.contains(owner))
          const ownerRect = owner.getBoundingClientRect()
          const verticalScrollbarWidth = owner.offsetWidth - owner.clientWidth - owner.clientLeft
          const horizontalScrollbarHeight =
            owner.offsetHeight - owner.clientHeight - owner.clientTop
          const inNativeScrollbar =
            (owner.scrollHeight > owner.clientHeight &&
              verticalScrollbarWidth > 0 &&
              pointX >= ownerRect.right - verticalScrollbarWidth) ||
            (owner.scrollWidth > owner.clientWidth &&
              horizontalScrollbarHeight > 0 &&
              pointY >= ownerRect.bottom - horizontalScrollbarHeight)
          if (
            ownerIndex < 0 &&
            !requiresOwner &&
            (inNativeScrollbar ||
              !isInsideRoundedRect(owner, pointX, pointY) ||
              clipKind === "rounded")
          ) {
            continue
          }
          if (ownerIndex < 0) {
            return {
              hit: stack[0]?.tagName ?? null,
              occluder: requiresOwner ? "TEXT_OWNER_MISSING" : "ELEMENT_OWNER_MISSING",
              x,
              y,
            }
          }
          const occluder = stack.slice(0, ownerIndex).find((element) => {
            if (element.contains(owner) || owner.contains(element)) return false
            const occluderRect = element.getBoundingClientRect()
            const overlapWidth =
              Math.min(rect.right, occluderRect.right) - Math.max(rect.left, occluderRect.left)
            const overlapHeight =
              Math.min(rect.bottom, occluderRect.bottom) - Math.max(rect.top, occluderRect.top)
            const adjacentFlowSibling =
              owner.parentElement === element.parentElement &&
              ["relative", "static"].includes(getComputedStyle(owner).position) &&
              ["relative", "static"].includes(getComputedStyle(element).position) &&
              Math.min(overlapWidth, overlapHeight) < 1
            return overlapWidth > 0 && overlapHeight > 0 && !adjacentFlowSibling
          })
          if (occluder !== undefined) {
            return {
              hit: stack[0]?.tagName ?? null,
              name: owner.getAttribute("alt") ?? owner.getAttribute("aria-label"),
              occluder: occluder.tagName,
              ownerRect: owner.getBoundingClientRect().toJSON(),
              x: pointX,
              y: pointY,
            }
          }
        }
      }
    }
    return null
  }
  const regionVisibilityFailures = (
    region: HTMLElement | null,
    regionDescendants: readonly HTMLElement[],
    auditRegionPaint = true,
  ) => {
    if (region === null) return []
    const regionRect = region.getBoundingClientRect()
    const paintFailure = auditRegionPaint ? paintCoverageFailure(region, false) : null
    return [
      ...(rectIsInViewport(regionRect)
        ? []
        : [
            `region-outside-viewport:${JSON.stringify({ bottom: regionRect.bottom, left: regionRect.left, right: regionRect.right, top: regionRect.top })}`,
          ]),
      ...(paintFailure === null ? [] : [`paint:${JSON.stringify(paintFailure)}`]),
      ...regionDescendants.flatMap((element, index) => {
        const fragments = paintFragments(element)
        const failedFragment = fragments.find(
          ({ rect }) => !containsRect(regionRect, rect) || !rectIsInViewport(rect),
        )?.rect
        const descendantPaintFailure = paintCoverageFailure(element)
        return [
          ...(failedFragment === undefined
            ? []
            : [
                `descendant-${index}:${element.tagName}:${JSON.stringify({ bottom: failedFragment.bottom, left: failedFragment.left, right: failedFragment.right, top: failedFragment.top })}`,
              ]),
          ...(descendantPaintFailure === null
            ? []
            : [
                `descendant-paint-${index}:${element.tagName}:${JSON.stringify(descendantPaintFailure)}`,
              ]),
        ]
      }),
    ]
  }
  const regionsPaintOverlap = (
    first: HTMLElement | null,
    firstRect: DOMRect | undefined,
    second: HTMLElement | null,
    secondRect: DOMRect | undefined,
  ) => {
    if (first === null || firstRect === undefined || second === null || secondRect === undefined) {
      return false
    }
    const left = Math.max(firstRect.left, secondRect.left)
    const right = Math.min(firstRect.right, secondRect.right)
    const top = Math.max(firstRect.top, secondRect.top)
    const bottom = Math.min(firstRect.bottom, secondRect.bottom)
    if (right <= left || bottom <= top) return false
    const shareFlowParent =
      first.parentElement === second.parentElement ||
      first.parentElement === second.parentElement?.parentElement ||
      first.parentElement?.parentElement === second.parentElement
    const adjacentFlowRegions =
      shareFlowParent &&
      ["relative", "static"].includes(getComputedStyle(first).position) &&
      ["relative", "static"].includes(getComputedStyle(second).position) &&
      Math.min(right - left, bottom - top) < 1
    if (adjacentFlowRegions) return false
    for (let y = Math.floor(top); y < Math.ceil(bottom); y += 1) {
      for (let x = Math.floor(left); x < Math.ceil(right); x += 1) {
        const stack = document.elementsFromPoint(x + 0.5, y + 0.5)
        if (stack.includes(first) && stack.includes(second)) return true
      }
    }
    return false
  }
  const phraseFragments = [...document.querySelectorAll<HTMLElement>("[data-semantic-phrase]")]
    .filter((element) => element.getClientRects().length > 0)
    .flatMap((element, index) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      return lines.size > 1 ? [index] : []
    })
  return {
    composerGeometry:
      composerRect === undefined
        ? undefined
        : {
            bottom: Math.max(
              composerRect.bottom,
              ...composerDescendants.map((rect) => rect.bottom),
            ),
            top: Math.min(composerRect.top, ...composerDescendants.map((rect) => rect.top)),
            viewportHeight: window.innerHeight,
          },
    documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    footerVisibilityFailures: [
      ...regionVisibilityFailures(footer, footerDescendants),
      ...regionVisibilityFailures(form, formDescendants),
    ],
    headerVisibilityFailures: [
      ...regionVisibilityFailures(header, headerDescendants),
      ...(regionsPaintOverlap(header, headerRect, conversation, conversationRect)
        ? [
            `header-conversation-overlap:${JSON.stringify({ headerBottom: headerRect?.bottom, conversationTop: conversationRect?.top })}`,
          ]
        : []),
      ...(regionsPaintOverlap(header, headerRect, footer, footerRect)
        ? ["header-footer-overlap"]
        : []),
      ...(activeChat && regionsPaintOverlap(conversation, conversationRect, footer, footerRect)
        ? ["conversation-footer-overlap"]
        : []),
    ],
    phraseFragments,
    scrollOwners: [...document.querySelectorAll("main,section,div")].filter((element) => {
      const style = getComputedStyle(element)
      return (
        element.getClientRects().length > 0 &&
        (style.overflowY === "auto" || style.overflowY === "scroll")
      )
    }).length,
    statusVisibilityFailures: statuses.flatMap((status) =>
      regionVisibilityFailures(status, semanticDescendants(status)),
    ),
    undersizedTargets: [
      ...document.querySelectorAll(
        "button,select,input:not([type=file]),textarea,a[href],label:has(input[type=file])",
      ),
    ]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width + 0.01 < 44 || rect.height + 0.01 < 44
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          height: rect.height,
          name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          width: rect.width,
        }
      }),
  }
}
