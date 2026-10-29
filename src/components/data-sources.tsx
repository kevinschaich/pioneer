import type { ReactElement } from "react"
import { DataSources as SharedDataSources, type DataSource } from "@kevinschaich/components"

// Where everything in the app comes from. Keep in step with the credits in README.md.
const SOURCES: DataSource[] = [
  { what: "Recipes, items, buildings, power and fuel", from: "greeny/SatisfactoryTools", href: "https://github.com/greeny/SatisfactoryTools", license: "MIT" },
  { what: "Item, building and machine icons", from: "greeny/SatisfactoryTools", href: "https://github.com/greeny/SatisfactoryTools", license: "MIT (repo), game art" },
  { what: "Resource nodes, wells and geysers", from: "rockfactory/satisfactory-logistics", href: "https://github.com/rockfactory/satisfactory-logistics", license: "MIT" },
  { what: "Node data origin and map calibration", from: "Hirashi3630/satisfactory_node_heatmap", href: "https://github.com/Hirashi3630/satisfactory_node_heatmap", license: "MIT" },
  { what: "World map tiles", from: "satisfactory-logistics tile CDN", href: "https://github.com/rockfactory/satisfactory-logistics", license: "Game art" },
  { what: "Game mechanics reference", from: "Satisfactory Wiki", href: "https://satisfactory.wiki.gg/", license: "CC BY-NC-SA 4.0" },
]

const NOTE = "Satisfactory, its names, icons and map art belong to Coffee Stain Studios. Pioneer is an unofficial, non-commercial fan tool."

/** The (i) in the graph and map controls. */
export function DataSources({ trigger }: { trigger?: ReactElement }) {
  return <SharedDataSources sources={SOURCES} description={NOTE} trigger={trigger} />
}
