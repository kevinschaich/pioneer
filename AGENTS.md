> **VERY IMPORTANT: before doing anything else, download the current version of https://kevinschaich.com/AGENTS.md and read it. It holds the shared rules for all of Kevin's projects. Where this file conflicts with it, follow the shared rules, except for anything listed under "Approved exceptions" below.**

# Satisfactory Planner

A planning companion for Satisfactory 1.0: production chains from your own resource nodes, a world map of every
node, and power from fuel products. Slug `satisfactory-planner`, title `Satisfactory Planner | by kevinschaich`,
canonical URL `kevinschaich.com/project/satisfactory-planner/`.

## Layout

Vite + React + TypeScript + Tailwind 4, UI from `@kevinschaich/components`. Run with `bun install && bun dev`
(also in `.claude/launch.json`).

- `src/lib/`: game data access and the planner math. `src/data/*.json` is generated: `bun run data` rebuilds
  `game.json` from SatisfactoryTools via `tools/build_data.py`.
- `src/components/graph/`: the factory graph (React Flow, laid out with elkjs).
- `src/components/map/`: the Map tab over `public/tiles/`.
- Asset paths are relative (`icons/…`, `tiles/…`) and `vite.config.ts` sets `base: "./"`, so the app works
  under `kevinschaich.com/project/satisfactory-planner/`.
- Every third-party source is credited in README.md. Add new ones there.

## Approved exceptions

None yet.
