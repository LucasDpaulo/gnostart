import { useMemo, useState } from 'react';
import type { VenuePoi } from '../../types/venue';
import type { RouteState } from '../../hooks/useRouteState';
import './RoutePanel.css';

interface RoutePanelProps {
  pois: VenuePoi[];
  route: RouteState;
}

export function RoutePanel({ pois, route }: RoutePanelProps) {
  const [originSearch, setOriginSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  const [focusedField, setFocusedField] = useState<'origin' | 'destination' | null>(null);

  const originPoi = pois.find((p) => p.id === route.originId);
  const destPoi = pois.find((p) => p.id === route.destinationId);

  const suggestions = useMemo(() => {
    const query = focusedField === 'origin' ? originSearch : destSearch;
    if (!query.trim()) return pois;
    const q = query.toLowerCase().trim();
    return pois.filter((p) => p.name.toLowerCase().includes(q));
  }, [pois, focusedField, originSearch, destSearch]);

  const handleSelect = (poi: VenuePoi) => {
    if (focusedField === 'origin') {
      route.selectOrigin(poi.id);
      setOriginSearch(poi.name);
    } else {
      route.selectDestination(poi.id);
      setDestSearch(poi.name);
    }
    setFocusedField(null);
  };

  const walkingMinutes = route.distanceMeters
    ? Math.max(1, Math.round(route.distanceMeters / 70))
    : null;

  return (
    <div className="route-panel">
      <div className="route-panel__inputs">
        <div className="route-panel__field">
          <label className="route-panel__label">📍 De onde?</label>
          <input
            className="route-panel__input"
            type="text"
            placeholder="Selecionar origem..."
            value={focusedField === 'origin' ? originSearch : (originPoi?.name ?? originSearch)}
            onChange={(e) => setOriginSearch(e.target.value)}
            onFocus={() => { setFocusedField('origin'); setOriginSearch(''); }}
          />
        </div>
        <div className="route-panel__field">
          <label className="route-panel__label">🎯 Para onde?</label>
          <input
            className="route-panel__input"
            type="text"
            placeholder="Selecionar destino..."
            value={focusedField === 'destination' ? destSearch : (destPoi?.name ?? destSearch)}
            onChange={(e) => setDestSearch(e.target.value)}
            onFocus={() => { setFocusedField('destination'); setDestSearch(''); }}
          />
        </div>
      </div>

      {focusedField && (
        <ul className="route-panel__suggestions">
          {suggestions.map((poi) => (
            <li key={poi.id}>
              <button className="route-panel__suggestion" onClick={() => handleSelect(poi)}>
                {poi.icon ?? '📌'} {poi.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {route.path && (
        <div className="route-panel__info">
          <span className="route-panel__distance">
            {route.distanceMeters != null && route.distanceMeters >= 1000
              ? `${(route.distanceMeters / 1000).toFixed(1)} km`
              : `${route.distanceMeters} m`}
          </span>
          <span className="route-panel__eta">~{walkingMinutes} min caminhando</span>
          <button className="route-panel__clear" onClick={route.clearRoute}>
            Limpar rota
          </button>
        </div>
      )}

      {route.originId && route.destinationId && !route.path && (
        <div className="route-panel__error">
          Não foi possível encontrar uma rota entre esses pontos.
        </div>
      )}
    </div>
  );
}
