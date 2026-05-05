import L from 'leaflet';
import type { ReactNode } from 'react';
import { MapContainer, ImageOverlay } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface MapCanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  children?: ReactNode;
}

export function MapCanvas({ imageUrl, width, height, children }: MapCanvasProps) {
  const bounds: L.LatLngBoundsExpression = [[0, 0], [height, width]];
  const center: [number, number] = [height / 2, width / 2];

  const minZoom = -2;
  const maxZoom = 3;

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={center}
      zoom={-1}
      minZoom={minZoom}
      maxZoom={maxZoom}
      maxBounds={bounds}
      maxBoundsViscosity={0.9}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      zoomSnap={0.5}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      attributionControl={false}
    >
      <ImageOverlay url={imageUrl} bounds={bounds} />
      {children}
    </MapContainer>
  );
}
