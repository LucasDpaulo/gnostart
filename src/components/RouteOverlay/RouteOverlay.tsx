import { useEffect, useRef, useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import type L from 'leaflet';
import './routeOverlay.css';

interface RouteOverlayProps {
  path: [number, number][];
  color?: string;
}

export function RouteOverlay({ path, color = '#6a38d0' }: RouteOverlayProps) {
  const polylineRef = useRef<L.Polyline>(null);

  const positions = useMemo(() => path, [path]);

  useEffect(() => {
    const el = polylineRef.current?.getElement() as HTMLElement | null;
    if (!el) return;
    el.classList.remove('route-animate');
    void el.offsetWidth;
    el.classList.add('route-animate');
  }, [positions]);

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#ffffff',
          weight: 6,
          opacity: 0.6,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        ref={polylineRef}
        positions={positions}
        pathOptions={{
          color,
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'route-path',
        }}
      />
    </>
  );
}
