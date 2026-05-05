import type { VenueWaypoint } from '../types/venue';

class MinHeap {
  private heap: { id: string; f: number }[] = [];

  get size() {
    return this.heap.length;
  }

  push(id: string, f: number) {
    this.heap.push({ id, f });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): string | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top.id;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].f <= this.heap[i].f) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].f < this.heap[smallest].f) smallest = left;
      if (right < n && this.heap[right].f < this.heap[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

export interface WaypointGraph {
  nodes: Map<string, { x: number; y: number; connections: string[] }>;
}

export function buildGraph(waypoints: VenueWaypoint[]): WaypointGraph {
  const nodes = new Map<string, { x: number; y: number; connections: string[] }>();
  for (const wp of waypoints) {
    nodes.set(wp.id, { x: wp.x, y: wp.y, connections: wp.connections });
  }
  return { nodes };
}

export function findPath(
  graph: WaypointGraph,
  startId: string,
  endId: string,
): [number, number][] | null {
  const startNode = graph.nodes.get(startId);
  const endNode = graph.nodes.get(endId);
  if (!startNode || !endNode) return null;
  if (startId === endId) return [[startNode.y, startNode.x]];

  const heuristic = (a: string, b: string) => {
    const na = graph.nodes.get(a)!;
    const nb = graph.nodes.get(b)!;
    return Math.hypot(na.x - nb.x, na.y - nb.y);
  };

  const openHeap = new MinHeap();
  const closed = new Set<string>();
  const cameFrom: Record<string, string> = {};
  const gScore: Record<string, number> = { [startId]: 0 };

  openHeap.push(startId, heuristic(startId, endId));

  while (openHeap.size > 0) {
    const current = openHeap.pop();
    if (!current) break;
    if (current === endId) {
      const path: [number, number][] = [];
      let node: string | undefined = current;
      while (node) {
        const n = graph.nodes.get(node)!;
        path.unshift([n.y, n.x]);
        node = cameFrom[node];
      }
      return path;
    }

    closed.add(current);
    const currentNode = graph.nodes.get(current);
    if (!currentNode) continue;

    for (const neighborId of currentNode.connections) {
      if (closed.has(neighborId)) continue;
      const neighborNode = graph.nodes.get(neighborId);
      if (!neighborNode) continue;

      const tentativeG = (gScore[current] ?? Infinity) +
        Math.hypot(currentNode.x - neighborNode.x, currentNode.y - neighborNode.y);

      if (tentativeG < (gScore[neighborId] ?? Infinity)) {
        cameFrom[neighborId] = current;
        gScore[neighborId] = tentativeG;
        openHeap.push(neighborId, tentativeG + heuristic(neighborId, endId));
      }
    }
  }

  return null;
}

export function findRoute(
  graph: WaypointGraph,
  originX: number,
  originY: number,
  originWaypointId: string,
  destX: number,
  destY: number,
  destWaypointId: string,
): [number, number][] | null {
  const path = findPath(graph, originWaypointId, destWaypointId);
  if (!path) return null;

  const result: [number, number][] = [[originY, originX], ...path, [destY, destX]];

  // Deduplicate consecutive identical points
  const deduped: [number, number][] = [result[0]];
  for (let i = 1; i < result.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (result[i][0] !== prev[0] || result[i][1] !== prev[1]) {
      deduped.push(result[i]);
    }
  }
  return deduped;
}

export function getPathDistance(path: [number, number][], metersPerPixel = 1): number {
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    dist += Math.hypot(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]);
  }
  return dist * metersPerPixel;
}
