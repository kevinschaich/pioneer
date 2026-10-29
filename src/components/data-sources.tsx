import type { ReactElement } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kevinschaich/components"

// Where everything in the app comes from. Keep in step with the credits in README.md.
const SOURCES: { what: string; from: string; href: string; license: string }[] = [
  { what: "Recipes, items, buildings, power and fuel", from: "greeny/SatisfactoryTools", href: "https://github.com/greeny/SatisfactoryTools", license: "MIT" },
  { what: "Item, building and machine icons", from: "greeny/SatisfactoryTools", href: "https://github.com/greeny/SatisfactoryTools", license: "MIT (repo), game art" },
  { what: "Resource nodes, wells and geysers", from: "rockfactory/satisfactory-logistics", href: "https://github.com/rockfactory/satisfactory-logistics", license: "MIT" },
  { what: "Node data origin and map calibration", from: "Hirashi3630/satisfactory_node_heatmap", href: "https://github.com/Hirashi3630/satisfactory_node_heatmap", license: "MIT" },
  { what: "World map tiles", from: "satisfactory-logistics tile CDN", href: "https://github.com/rockfactory/satisfactory-logistics", license: "Game art" },
  { what: "Game mechanics reference", from: "Satisfactory Wiki", href: "https://satisfactory.wiki.gg/", license: "CC BY-NC-SA 4.0" },
]

/** The data sources dialog, opened from a quiet trigger placed where it fits (an "i" in the graph and map controls). */
export function DataSources({ trigger }: { trigger: ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Data sources</DialogTitle>
          <DialogDescription>
            Satisfactory, its names, icons and map art belong to Coffee Stain Studios. This is an unofficial,
            non-commercial fan tool, not affiliated with them.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] border-t text-sm">
          {SOURCES.map((s) => (
            <div key={s.what} className="contents">
              <dt className="border-b py-2 pr-3">
                {s.what}
                <a href={s.href} target="_blank" rel="noopener" className="block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{s.from}</a>
              </dt>
              <dd className="border-b py-2 text-right text-xs text-muted-foreground">{s.license}</dd>
            </div>
          ))}
        </dl>
        <a href="https://github.com/kevinschaich/pioneer#credits-and-third-party-material" target="_blank" rel="noopener" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Full credits
        </a>
      </DialogContent>
    </Dialog>
  )
}
