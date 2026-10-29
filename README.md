[![Satisfactory Planner by kevinschaich](https://kevinschaich.com/og/satisfactory-planner.png)](https://kevinschaich.com/project/satisfactory-planner/)

# Satisfactory Planner

Plan your Satisfactory factory from your own resource nodes

**[Try it →](https://kevinschaich.com/project/satisfactory-planner/)**

## How it works

- **Planner**: pick what to make and how much; it builds the production chain from the nodes you've marked as yours, with the machines, power and build cost.
- **Map**: every resource node, well and geyser in the world. Mark the ones you've extracted and it plans around them.
- **Power**: generators fed by fuel products, counted into the plan.

Everything runs in your browser and is saved there.

## Run locally

```bash
bun install
bun run dev
```

## Credits and third-party material

Everything below came from somewhere else. This project is unofficial and not affiliated with Coffee Stain Studios.

### Game content

- **Satisfactory** game data, names, item, building and machine icons, and the world map artwork are the property of **Coffee Stain Studios**. They're used here for a personal, non-commercial fan tool.

### Data

| What | Where it's from | License | Used for |
|---|---|---|---|
| Recipes, items, buildings, power use, building costs, generators and fuel energy (`src/data/game.json`) | [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools), `data/data1.0.json`, converted by `tools/build_data.py` | MIT | Everything the planner calculates |
| Item, building and machine icons (`public/icons/`) | [greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools), `www/assets/images/items/*_256.png` (game art, see above) | MIT (repo) | Icons throughout the app |
| World resource node positions, purities, resource wells and geysers (`tools/sources/world-nodes.json` → `src/data/map-nodes.json`) | [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics), `src/recipes/WorldResourceNodes.json`, itself derived from [Hirashi3630/satisfactory_node_heatmap](https://github.com/Hirashi3630/satisfactory_node_heatmap) | MIT | Map tab |
| Map coordinate calibration (world bounds −324,700…425,300 × −375,000…375,000) | [Hirashi3630/satisfactory_node_heatmap](https://github.com/Hirashi3630/satisfactory_node_heatmap) | MIT | Placing nodes on the map |
| World map tiles (`public/tiles/`, zoom 0–6) | [rockfactory/satisfactory-logistics](https://github.com/rockfactory/satisfactory-logistics) tile CDN (`satisfactory-logistics-maps.fra1.cdn.digitaloceanspaces.com/map/v2`); map art is Coffee Stain's | Map art: Coffee Stain | Map tab background |
| Building footprints, Blueprint Designer sizes, machine dimensions | [Satisfactory Wiki (wiki.gg)](https://satisfactory.wiki.gg/) | CC BY-NC-SA 4.0 | Earlier layout features |
| Game mechanics reference (miner rates, purity multipliers, belt/pipe speeds, overclocking, power shards) | [Satisfactory Wiki (wiki.gg)](https://satisfactory.wiki.gg/), [Satisfactory Wiki (Fandom)](https://satisfactory.fandom.com/), [satisfactory-calculator.com](https://satisfactory-calculator.com) | CC BY-NC-SA 4.0 (wikis) | Checking numbers; the interactive map was the design reference for the Map tab |

### Software

| Package | License |
|---|---|
| [React](https://react.dev) | MIT |
| [Vite](https://vitejs.dev) | MIT |
| [Tailwind CSS](https://tailwindcss.com) | MIT |
| [shadcn/ui](https://ui.shadcn.com) components (via `@kevinschaich/components`) | MIT |
| [Base UI](https://base-ui.com) | MIT |
| [React Flow (@xyflow/react)](https://reactflow.dev) | MIT |
| [elkjs](https://github.com/kieler/elkjs) (graph layout) | EPL-2.0 |
| [Lucide](https://lucide.dev) icons | ISC |
| [clsx](https://github.com/lukeed/clsx), [tailwind-merge](https://github.com/dcastil/tailwind-merge) | MIT |
