# Architectural invariants

Agents must not violate these. Change this file only alongside a decision recorded in
§17 of `docs/ARCHITECTURE.md`.

1. **EAN is the key.** Products and placements are keyed on EAN/GTIN, never on name.
2. **The core tier is budgeted.** Core stays under 3 MB gzipped and must be enough on its
   own to search, resolve a list and compute a route. Nothing from the display tier goes
   into a core chunk.
3. **Generic entries resolve through `CategoryPlacement` before routing.** The router
   only ever sees single target nodes; no generalised TSP.
4. **No backend.** No server, accounts or remote database. Sharing is via URL-encoded
   list state.
5. **`packages/core` is framework-free.** React code lives in apps or `packages/map-render`.
6. **`packages/core/src/types.ts` is the data contract.** Changes need two reviewers.
7. **Agents propose, humans commit.** Agents report findings and suggest changes; people
   make the edits, the commits and the merges.
