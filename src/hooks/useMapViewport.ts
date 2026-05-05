import { useCallback, useEffect, useState } from 'react';

export interface MapViewport {
  isMobile: boolean;
  zoomLevel: number;
  setZoomLevel: (z: number) => void;
}

export function useMapViewport(): MapViewport {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [zoomLevel, setZoomLevel] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSetZoom = useCallback((z: number) => setZoomLevel(z), []);

  return { isMobile, zoomLevel, setZoomLevel: handleSetZoom };
}
