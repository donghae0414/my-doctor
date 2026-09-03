import { PrimitiveShowcase } from "@/components/dev/primitive-showcase"

type PrimitiveShowcasePageProperties = {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>
}

export default async function PrimitiveShowcasePage({
  searchParams,
}: PrimitiveShowcasePageProperties) {
  const parameters = await searchParams
  return (
    <div className={parameters["theme"] === "dark" ? "dark" : undefined}>
      <PrimitiveShowcase />
    </div>
  )
}
