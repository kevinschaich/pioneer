import raw from "@/data/game.json"

export interface Recipe {
  id: string
  name: string
  alt: boolean
  time: number
  in: [string, number][]
  out: [string, number][]
  m: string
  power: number
}
interface GameData {
  items: Record<string, { name: string; liquid: boolean; icon: string }>
  resources: string[]
  machines: Record<string, { name: string; icon: string }>
  buildCost: Record<string, [string, number][]>
  generators: Record<string, { mw: number; water: number; fuels: Record<string, number> }>
  recipes: Recipe[]
}

export const D = raw as unknown as GameData
export const RESOURCES = new Set(D.resources)
export const recipeById: Record<string, Recipe> = Object.fromEntries(D.recipes.map((r) => [r.id, r]))
export const recipesFor: Record<string, Recipe[]> = {}
for (const r of D.recipes) for (const [it] of r.out) (recipesFor[it] ??= []).push(r)

export const itemName = (id: string) => D.items[id]?.name ?? id
export const isLiquid = (id: string) => !!D.items[id]?.liquid
export const unit = (id: string) => (isLiquid(id) ? "m³/min" : "/min")
export const itemIcon = (id: string) => (D.items[id] ? `icons/${D.items[id].icon}.png` : "")
export const machineIcon = (id: string) => (D.machines[id] ? `icons/${D.machines[id].icon}.png` : "")
export const recipePerMin = (r: Recipe, amount: number) => (amount * 60) / r.time
export const recipeName = (r: Recipe) => r.name.replace(/^Alternate: /, "")

export function fmt(n: number) {
  if (!isFinite(n)) return "∞"
  const a = Math.abs(n)
  const s = a >= 100 ? n.toFixed(1) : a >= 10 ? n.toFixed(2) : n.toFixed(3)
  return s.replace(/\.?0+$/, "") || "0"
}

// Sorted list of everything a recipe can produce, for the target picker.
export const producibleItems = Object.keys(recipesFor).sort((a, b) => itemName(a).localeCompare(itemName(b)))
export const allItems = Object.keys(D.items).sort((a, b) => itemName(a).localeCompare(itemName(b)))
export const resourceItems = D.resources.slice().sort((a, b) => itemName(a).localeCompare(itemName(b)))

export function defaultRecipe(item: string) {
  // Unpackage recipes need the packaged item, which you'd have to make first; never a sensible default.
  const rs = (recipesFor[item] || []).filter((r) => !r.name.startsWith("Unpackage"))
  const main = (r: Recipe) => r.out[0][0] === item
  // The recipe named after the item, then a standard recipe made for it, then an alternate made for it,
  // then one that makes it on the side.
  return (rs.find((r) => !r.alt && r.name === itemName(item)) || rs.find((r) => !r.alt && main(r)) || rs.find(main)
    || rs.find((r) => !r.alt) || rs[0] || recipesFor[item]?.[0])?.id
}

export const MINERS = [
  { tier: 1, rate: 60, id: "Desc_MinerMk1_C" },
  { tier: 2, rate: 120, id: "Desc_MinerMk2_C" },
  { tier: 3, rate: 240, id: "Desc_MinerMk3_C" },
] as const
export const BELTS = [60, 120, 270, 480, 780, 1200]
export const PIPES = [300, 600]
export const PURITY = { impure: 0.5, normal: 1, pure: 2 } as const
export type Purity = keyof typeof PURITY

export function extractorFor(res: string, minerTier: number) {
  if (res === "Desc_Water_C") return "Desc_WaterPump_C"
  if (res === "Desc_LiquidOil_C") return "Desc_OilPump_C"
  if (res === "Desc_NitrogenGas_C") return "Desc_FrackingExtractor_C" // only found on resource well satellites
  return MINERS[minerTier - 1].id
}
