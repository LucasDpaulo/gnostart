# Gnomon (gnostart)

Interactive event venue mapping and navigation app.

## Stack
- React 19 + TypeScript + Vite + Leaflet + react-leaflet
- Docker/Nginx for production

## Key paths
- `src/utils/pathfinding.tsx` — A* pathfinding with MinHeap priority queue
- `src/components/Maps/Gnomon.tsx` — Main component (~2500 lines)
- `src/components/Maps/allbuttons/routes/useRouteNavigation.ts` — Route navigation hook
- `src/data/navGraph.json` — Navigation graph (walkable corridors)
- `src/config/mapConfig.ts` — Map dimensions, zoom, POI config

## Commands
- `npm run dev` — Dev server (port 5173)
- `npm run build` — Production build
- `npm run lint` — ESLint (has 19 pre-existing issues)
- `npx tsc --noEmit` — Type check

## Notes
- Language: Portuguese (Brazil)
- Fork from JaoVile/gnostart → LucasDpaulo/gnostart
