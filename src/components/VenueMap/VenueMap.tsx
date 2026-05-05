import { useCallback, useState } from 'react';
import type { VenuePoi } from '../../types/venue';
import { useVenueConfig } from '../../hooks/useVenueConfig';
import { useRouteState } from '../../hooks/useRouteState';
import { MapCanvas } from '../MapCanvas/MapCanvas';
import { PoiMarkers } from '../PoiMarkers/PoiMarkers';
import { RouteOverlay } from '../RouteOverlay/RouteOverlay';
import { BottomSheet } from '../Panels/BottomSheet';
import { PoiListPanel } from '../Panels/PoiListPanel';
import { RoutePanel } from '../Panels/RoutePanel';
import './VenueMap.css';

type PanelType = 'pois' | 'route' | null;

interface VenueMapProps {
  venueId: string;
}

export function VenueMap({ venueId }: VenueMapProps) {
  const { config, isLoading, error } = useVenueConfig(venueId);
  const route = useRouteState(
    config?.pois ?? [],
    config?.waypoints ?? [],
    config?.map.metersPerPixel,
  );
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);

  const handlePoiSelect = useCallback((poi: VenuePoi) => {
    setActivePoiId(poi.id);
    setActivePanel(null);
  }, []);

  const handlePoiNavigate = useCallback((poi: VenuePoi) => {
    route.selectDestination(poi.id);
    setActivePanel('route');
  }, [route]);

  const closePanel = useCallback(() => setActivePanel(null), []);

  if (isLoading) {
    return (
      <div className="venue-map__loading">
        <div className="venue-map__spinner" />
        Carregando mapa...
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="venue-map__error">
        <p>Erro ao carregar o mapa</p>
        <small>{error}</small>
      </div>
    );
  }

  const mapImageUrl = `/venues/${venueId}/${config.map.image}`;
  const themeColor = config.theme?.primary ?? '#6a38d0';

  return (
    <div className="venue-map" style={{ '--theme-primary': themeColor } as React.CSSProperties}>
      <header className="venue-map__header">
        <h1 className="venue-map__title">{config.meta.name}</h1>
      </header>

      <div className="venue-map__canvas">
        <MapCanvas
          imageUrl={mapImageUrl}
          width={config.map.width}
          height={config.map.height}
        >
          <PoiMarkers
            pois={config.pois}
            activePoiId={activePoiId}
            onSelect={handlePoiSelect}
          />
          {route.path && <RouteOverlay path={route.path} color={themeColor} />}
        </MapCanvas>
      </div>

      <BottomSheet isOpen={activePanel !== null} onClose={closePanel}>
        {activePanel === 'pois' && (
          <PoiListPanel
            pois={config.pois}
            onSelect={handlePoiSelect}
            onNavigate={handlePoiNavigate}
          />
        )}
        {activePanel === 'route' && (
          <RoutePanel pois={config.pois} route={route} />
        )}
      </BottomSheet>

      <nav className="venue-map__dock">
        <button
          className={`venue-map__dock-btn${activePanel === 'pois' ? ' venue-map__dock-btn--active' : ''}`}
          onClick={() => setActivePanel(activePanel === 'pois' ? null : 'pois')}
        >
          📍 Locais
        </button>
        <button
          className={`venue-map__dock-btn${activePanel === 'route' ? ' venue-map__dock-btn--active' : ''}`}
          onClick={() => setActivePanel(activePanel === 'route' ? null : 'route')}
        >
          🧭 Rota
        </button>
      </nav>
    </div>
  );
}
