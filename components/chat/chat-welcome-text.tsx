const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const welcomeCopy = {
  heading: Array.from(segmenter.segment("산후 회복·아기 돌봄, 무엇이 궁금하세요?")),
  disclaimer: Array.from(segmenter.segment("AI는 틀릴 수 있어요. 의료 판단은 의료진과 확인하세요.")),
}

export function ChatWelcomeText({
  kind,
  progress,
}: {
  readonly kind: keyof typeof welcomeCopy
  readonly progress: number
}) {
  const graphemes = welcomeCopy[kind]
  const visibleCount = Math.floor(graphemes.length * progress)

  return (
    <span data-welcome-text={kind}>
      {/* Keep the full text in layout and the accessibility tree throughout the reveal. */}
      {graphemes.map(({ segment, index }, position) => (
        <span
          className="motion-reduce:opacity-100!"
          key={index}
          style={{ opacity: position < visibleCount ? 1 : 0 }}
        >
          {segment}
        </span>
      ))}
    </span>
  )
}
