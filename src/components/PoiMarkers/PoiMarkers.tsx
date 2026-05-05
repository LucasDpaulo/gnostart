import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import type { VenuePoi } from '../../types/venue';
import { createPoiIcon } from './poiMarker';
import './poiMarker.css';

interface PoiMarkersProps {
  pois: VenuePoi[];
  activePoiId: string | null;
  onSelect: (poi: VenuePoi) => void;
}

export function PoiMarkers({ pois, activePoiId, onSelect }: PoiMarkersProps) {
  return (
    <>
      {pois.map((poi) => (
        <PoiMarkerItem
          key={poi.id}
          poi={poi}
          isActive={poi.id === activePoiId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function PoiMarkerItem({
  poi,
  isActive,
  onSelect,
}: {
  poi: VenuePoi;
  isActive: boolean;
  onSelect: (poi: VenuePoi) => void;
}) {
  const icon = useMemo(
    () => createPoiIcon(poi.type, isActive, poi.icon, poi.accent),
    [poi.type, poi.icon, poi.accent, isActive],
  );

  const position: [number, number] = [poi.y, poi.x];

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={{ click: () => onSelect(poi) }}
      zIndexOffset={isActive ? 1000 : 0}
    >
      <Tooltip direction="top" offset={[0, -40]} opacity={0.95}>
        <strong>{poi.name}</strong>
      </Tooltip>
    </Marker>
  );
}
