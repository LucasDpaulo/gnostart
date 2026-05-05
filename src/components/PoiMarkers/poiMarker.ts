import L from 'leaflet';
import type { PoiType } from '../../types/venue';

const POI_TYPE_DEFAULTS: Record<PoiType, { emoji: string; accent: string }> = {
  atividade: { emoji: '⭐', accent: '#9a8bd9' },
  servico: { emoji: '🏪', accent: '#8aaed8' },
  banheiro: { emoji: '🚻', accent: '#9bb8df' },
  entrada: { emoji: '🚪', accent: '#a4c49b' },
};

export function createPoiIcon(
  type: PoiType,
  isActive: boolean,
  customIcon?: string,
  customAccent?: string,
  size = 36,
): L.DivIcon {
  const defaults = POI_TYPE_DEFAULTS[type];
  const emoji = customIcon ?? defaults.emoji;
  const accent = customAccent ?? defaults.accent;

  return new L.DivIcon({
    html: `<div class="poi-pin${isActive ? ' poi-pin--active' : ''}" style="--accent:${accent}; --size:${size}px">
      <span class="poi-pin__glyph">${emoji}</span>
    </div>`,
    className: '',
    iconSize: [size, Math.round(size * 1.25)],
    iconAnchor: [size / 2, Math.round(size * 1.25)],
  });
}
