import { useMemo, useState } from 'react';
import type { VenuePoi, PoiType } from '../../types/venue';
import './PoiListPanel.css';

const TYPE_LABELS: Record<PoiType, { label: string; emoji: string }> = {
  atividade: { label: 'Atividades', emoji: '⭐' },
  servico: { label: 'Serviços', emoji: '🏪' },
  banheiro: { label: 'Banheiros', emoji: '🚻' },
  entrada: { label: 'Entradas', emoji: '🚪' },
};

interface PoiListPanelProps {
  pois: VenuePoi[];
  onSelect: (poi: VenuePoi) => void;
  onNavigate: (poi: VenuePoi) => void;
}

export function PoiListPanel({ pois, onSelect, onNavigate }: PoiListPanelProps) {
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<PoiType | null>(null);

  const filtered = useMemo(() => {
    let result = pois;
    if (activeType) result = result.filter((p) => p.type === activeType);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [pois, search, activeType]);

  const types = Object.keys(TYPE_LABELS) as PoiType[];

  return (
    <div className="poi-list">
      <input
        className="poi-list__search"
        type="text"
        placeholder="Buscar local..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="poi-list__filters">
        {types.map((type) => (
          <button
            key={type}
            className={`poi-list__filter${activeType === type ? ' poi-list__filter--active' : ''}`}
            onClick={() => setActiveType(activeType === type ? null : type)}
          >
            {TYPE_LABELS[type].emoji} {TYPE_LABELS[type].label}
          </button>
        ))}
      </div>
      <ul className="poi-list__items">
        {filtered.map((poi) => (
          <li key={poi.id} className="poi-list__item">
            <button className="poi-list__item-btn" onClick={() => onSelect(poi)}>
              <span className="poi-list__item-icon">{poi.icon ?? TYPE_LABELS[poi.type].emoji}</span>
              <span className="poi-list__item-name">{poi.name}</span>
            </button>
            <button className="poi-list__nav-btn" onClick={() => onNavigate(poi)} title="Ir até aqui">
              📍
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="poi-list__empty">Nenhum local encontrado</li>
        )}
      </ul>
    </div>
  );
}
