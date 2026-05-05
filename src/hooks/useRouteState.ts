import { useCallback, useMemo, useState } from 'react';
import type { VenuePoi, VenueWaypoint } from '../types/venue';
import { buildGraph, findRoute, getPathDistance } from '../core/pathfinding';

export interface RouteState {
  originId: string | null;
  destinationId: string | null;
  path: [number, number][] | null;
  distanceMeters: number | null;
  selectOrigin: (id: string | null) => void;
  selectDestination: (id: string | null) => void;
  clearRoute: () => void;
}

export function useRouteState(
  pois: VenuePoi[],
  waypoints: VenueWaypoint[],
  metersPerPixel = 1,
): RouteState {
  const [originId, setOriginId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(waypoints), [waypoints]);
  const poisById = useMemo(() => {
    const map = new Map<string, VenuePoi>();
    for (const poi of pois) map.set(poi.id, poi);
    return map;
  }, [pois]);

  const path = useMemo(() => {
    if (!originId || !destinationId) return null;
    const origin = poisById.get(originId);
    const dest = poisById.get(destinationId);
    if (!origin || !dest) return null;
    return findRoute(graph, origin.x, origin.y, origin.waypointId, dest.x, dest.y, dest.waypointId);
  }, [originId, destinationId, graph, poisById]);

  const distanceMeters = useMemo(() => {
    if (!path) return null;
    return Math.round(getPathDistance(path, metersPerPixel));
  }, [path, metersPerPixel]);

  const selectOrigin = useCallback((id: string | null) => setOriginId(id), []);
  const selectDestination = useCallback((id: string | null) => setDestinationId(id), []);
  const clearRoute = useCallback(() => {
    setOriginId(null);
    setDestinationId(null);
  }, []);

  return { originId, destinationId, path, distanceMeters, selectOrigin, selectDestination, clearRoute };
}
