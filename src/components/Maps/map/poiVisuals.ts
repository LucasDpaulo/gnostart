import L from 'leaflet';
import pinMapaSvg from '../../../assets/pin_mapa.svg?raw';
import type { PoiPinScaleTier, PoiPinSizeByTier } from '../../../config/mapConfig';
import type { PointData, PoiType } from '../types';
import { resolvePoiPrimaryPhotoUrl } from './poiPhotos';

export const BRAND_COLORS = {
  ink: '#5c33ad',
  inkSoft: '#7b56ca',
  primary: '#6a38d0',
  primaryStrong: '#5326b8',
  primarySoft: '#8d6fe7',
  primarySoftest: '#efe8ff',
  highlight: '#d9c8ff',
  highlightSoft: '#f5efff',
  surface: '#ffffff',
  surfaceSoft: '#f6f2fc',
  border: '#ddd4ee',
  textMuted: '#6f677f',
} as const;

export const SOFT_PIN_COLORS = {
  greenSoft: '#92b98c',
  greenLeaf: '#a4c49b',
  blueSoft: '#8aaed8',
  blueDeep: '#7698c8',
  skySoft: '#9bb8df',
  tealSoft: '#7fb4ad',
  violetSoft: '#9a8bd9',
  violetDeep: '#8576c9',
  periwinkle: '#8f9ddd',
  amberSoft: '#d7bf78',
  slateSoft: '#8f98aa',
  slateDeep: '#7d8798',
  silverSoft: '#a7afbc',
  warmSand: '#ccb36f',
} as const;

export const defaultPoiImages: Record<PoiType, string> = {
  entrada: '/images/pois/indicadores/entrada.svg',
  banheiro: '/images/pois/indicadores/banheiro.svg',
  atividade: '/images/pois/indicadores/evento.svg',
  servico: '/images/pois/indicadores/apoio.svg',
};

const BRAND_PALETTE = new Set<string>([...Object.values(BRAND_COLORS), ...Object.values(SOFT_PIN_COLORS)].map((value) => value.toLowerCase()));

const poiTypeAccentMap: Record<PoiType, string> = {
  atividade: SOFT_PIN_COLORS.violetSoft,
  servico: SOFT_PIN_COLORS.slateSoft,
  banheiro: SOFT_PIN_COLORS.skySoft,
  entrada: SOFT_PIN_COLORS.greenLeaf,
};

const poiMarkerGlyphs = {
  entrada:
    "<svg viewBox='0 0 24 24' width='66' height='66' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M4.2 4.2H12.4V19.8H4.2Z' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/><path d='M19.8 12H9.4' stroke='white' stroke-width='1.9' stroke-linecap='round'/><path d='M15.3 7.2L20.1 12L15.3 16.8' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/></svg>",
  banheiro:
    "<svg viewBox='0 0 24 24' width='68' height='68' fill='none' xmlns='http://www.w3.org/2000/svg'><circle cx='7.1' cy='5.1' r='1.55' stroke='white' stroke-width='1.8'/><circle cx='16.9' cy='5.1' r='1.55' stroke='white' stroke-width='1.8'/><path d='M7.1 7.8V11.4M5.2 10.3H9M6.3 13.2L5.5 20M7.9 13.2L8.7 20M16.9 7.8V20M14.9 10.2H18.9M16.9 11.7L14.9 20M16.9 11.7L18.9 20' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>",
  atividade:
    "<svg viewBox='0 0 24 24' width='64' height='64' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 3.2L13.8 8.2L19.2 8.4L14.9 11.7L16.5 17L12 13.8L7.5 17L9.1 11.7L4.8 8.4L10.2 8.2L12 3.2Z' stroke='white' stroke-width='1.8' stroke-linejoin='round'/></svg>",
  servico:
    "<svg viewBox='0 0 24 24' width='64' height='64' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 8.9L5.1 4H18.9L21 8.9' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/><path d='M4.1 8.9V20H19.9V8.9' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/><path d='M9 20V14.2H15V20' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/></svg>",
  microfone:
    "<svg viewBox='0 0 24 24' width='64' height='64' fill='none' xmlns='http://www.w3.org/2000/svg'><rect x='9' y='3.5' width='6' height='10' rx='3' stroke='white' stroke-width='1.9'/><path d='M6.8 10.8C6.8 13.6 9.04 15.8 12 15.8C14.96 15.8 17.2 13.6 17.2 10.8' stroke='white' stroke-width='1.9' stroke-linecap='round'/><path d='M12 15.8V20.2M8.8 20.2H15.2' stroke='white' stroke-width='1.9' stroke-linecap='round'/></svg>",
  estande:
    "<svg viewBox='0 0 24 24' width='62' height='62' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M5 10.2H19V19.2H5V10.2Z' stroke='white' stroke-width='1.8' stroke-linejoin='round'/><path d='M4.2 10.2L6.1 5.3H17.9L19.8 10.2' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/><path d='M9.2 19.2V14.7H14.8V19.2' stroke='white' stroke-width='1.8' stroke-linejoin='round'/></svg>",
  startup:
    "<svg viewBox='0 0 24 24' width='68' height='68' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M4.5 10.4L12 4.4L19.5 10.4V19.3H4.5V10.4Z' stroke='white' stroke-width='1.9' stroke-linejoin='round'/><path d='M9.4 19.3V13.9H14.6V19.3M8.2 7.7H15.8' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/></svg>",
  organizacao:
    "<svg viewBox='0 0 24 24' width='64' height='64' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M5 20V6.3L12 3.8L19 6.3V20' stroke='white' stroke-width='1.9' stroke-linejoin='round'/><path d='M9 9.2H9.01M15 9.2H15.01M9 13.2H9.01M15 13.2H15.01M12 20V16.2' stroke='white' stroke-width='1.9' stroke-linecap='round'/></svg>",
} as const;

const poiMarkerGlyphById: Partial<Record<string, keyof typeof poiMarkerGlyphs>> = {};

const PIN_MAPA_ASPECT_RATIO = 640 / 512;
const PIN_MAPA_TIP_RATIO_Y = 585 / 640;
const PIN_MAPA_PHOTO_FRAME = {
  x: 158,
  y: 122,
  size: 196,
};

const poiIconCache = new Map<string, L.DivIcon>();

const hexToRgb = (value: string) => {
  const sanitized = value.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(sanitized)) return null;
  return {
    r: Number.parseInt(sanitized.slice(0, 2), 16),
    g: Number.parseInt(sanitized.slice(2, 4), 16),
    b: Number.parseInt(sanitized.slice(4, 6), 16),
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const mixColors = (baseHex: string, targetHex: string, weight: number) => {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  if (!base || !target) return baseHex;
  const clampedWeight = Math.max(0, Math.min(1, weight));
  const mix = (from: number, to: number) => from * (1 - clampedWeight) + to * clampedWeight;
  return rgbToHex(mix(base.r, target.r), mix(base.g, target.g), mix(base.b, target.b));
};

export const normalizeHexColor = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    const [, raw] = short;
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
};

export const isBrandPaletteColor = (value?: string) => {
  const normalized = normalizeHexColor(value);
  return normalized ? BRAND_PALETTE.has(normalized) : false;
};

export const normalizeBadgeText = (value?: string) => {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 3).toUpperCase();
};

export const getPoiBadgeText = (poi: PointData) => {
  const customBadge = normalizeBadgeText(poi.selo);
  if (customBadge) return customBadge;
  const fallback = poi.nome.trim().charAt(0).toUpperCase();
  return fallback || 'P';
};

export const getPoiAccentColor = (poi: PointData) => {
  const customAccent = normalizeHexColor(poi.corDestaque);
  if (customAccent && isBrandPaletteColor(customAccent)) {
    return customAccent;
  }

  return poiTypeAccentMap[poi.tipo];
};

export const getPoiAccentRingColor = (accentColor: string) => mixColors(accentColor, '#ffffff', 0.74);

const getPoiPalette = (poi: PointData) => {
  const accent = getPoiAccentColor(poi);
  return {
    accent,
    from: mixColors(accent, BRAND_COLORS.surface, 0.3),
    to: mixColors(accent, BRAND_COLORS.ink, 0.12),
  };
};

const getPoiMarkerGlyphKey = (poi: PointData): keyof typeof poiMarkerGlyphs => poiMarkerGlyphById[poi.id] ?? poi.tipo;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scopeSvgIds = (svgMarkup: string, scopeId: string) => {
  const scopedIds = ['bodyGrad', 'rimGrad', 'photoRing', 'accentGrad', 'shadow', 'softGlow', 'photoClip'];
  return scopedIds.reduce((output, rawId) => {
    const scopedId = `${scopeId}-${rawId}`;
    return output
      .replace(new RegExp(`id="${rawId}"`, 'g'), `id="${scopedId}"`)
      .replace(new RegExp(`url\\(#${rawId}\\)`, 'g'), `url(#${scopedId})`);
  }, svgMarkup);
};

const colorPairsCache = new Map<string, readonly (readonly [string, string])[]>();
const colorizedSvgCache = new Map<string, string>();

const buildPoiMarkerColorPairs = (accent: string) => {
  const cached = colorPairsCache.get(accent);
  if (cached) return cached;
  const pairs = [
  ['#8F5BCE', mixColors('#8F5BCE', accent, 0.18)],
  ['#6E37A6', mixColors('#6E37A6', accent, 0.22)],
  ['#4B1F7D', mixColors('#4B1F7D', accent, 0.2)],
  ['#2E0D5A', mixColors('#2E0D5A', accent, 0.16)],
  ['#CBB3F7', mixColors('#CBB3F7', accent, 0.14)],
  ['#EFE6FF', mixColors('#EFE6FF', accent, 0.08)],
  ['#D7C0FF', mixColors('#D7C0FF', accent, 0.12)],
  ['#A87AE3', mixColors('#A87AE3', accent, 0.54)],
  ['#5A2397', mixColors('#5A2397', accent, 0.58)],
  ['#E9DBFF', mixColors('#E9DBFF', accent, 0.12)],
  ['#D6C0FF', mixColors('#D6C0FF', accent, 0.18)],
  ['#A97BE3', mixColors('#A97BE3', accent, 0.34)],
  ['#8A58C8', mixColors('#8A58C8', accent, 0.52)],
  ['#B58AF0', mixColors('#B58AF0', accent, 0.3)],
  ['#EBDFFF', mixColors('#EBDFFF', accent, 0.08)],
  ['#F6F1FF', mixColors('#F6F1FF', accent, 0.04)],
  ['#B389F1', mixColors('#B389F1', accent, 0.22)],
  ['#8B5BCA', mixColors('#8B5BCA', accent, 0.42)],
  ['#B18BE7', mixColors('#B18BE7', accent, 0.26)],
  ['#D4C2F7', mixColors('#D4C2F7', accent, 0.14)],
  ['#E6DBFB', mixColors('#E6DBFB', accent, 0.1)],
  ['#F6F2FF', mixColors('#F6F2FF', accent, 0.04)],
] as const;
  colorPairsCache.set(accent, pairs);
  return pairs;
};

const colorizePinMapaSvg = (svgMarkup: string, accent: string) => {
  const cacheKey = accent;
  const cached = colorizedSvgCache.get(cacheKey);
  if (cached) return cached;
  const result = buildPoiMarkerColorPairs(accent).reduce(
    (output, [rawColor, replacement]) => output.replace(new RegExp(escapeRegExp(rawColor), 'gi'), replacement),
    svgMarkup,
  );
  colorizedSvgCache.set(cacheKey, result);
  return result;
};

const sanitizeSvgScopeId = (value: string) => value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const buildPoiMarkerFallbackArtwork = (poi: PointData, clipId: string, accent: string) => {
  const { x, y, size } = PIN_MAPA_PHOTO_FRAME;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const outerFill = mixColors(accent, '#ffffff', 0.76);
  const innerFill = mixColors(accent, '#ffffff', 0.08);
  const ringStroke = mixColors(accent, '#ffffff', 0.48);
  const glyphKey = getPoiMarkerGlyphKey(poi);
  const glyphMarkup = poiMarkerGlyphs[glyphKey];

  return `<g clip-path="url(#${clipId})"><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${mixColors(
    accent,
    '#ffffff',
    0.9,
  )}"/><circle cx="${cx}" cy="${cy}" r="84" fill="${outerFill}"/><circle cx="${cx}" cy="${cy}" r="68" fill="${innerFill}" stroke="${ringStroke}" stroke-width="6"/><g transform="translate(${cx - 33}, ${cy - 33})">${glyphMarkup}</g></g>`;
};

const buildPoiMarkerPhotoArtwork = (photoUrl: string, clipId: string, accent: string) => {
  const { x, y, size } = PIN_MAPA_PHOTO_FRAME;
  const safePhotoUrl = escapeHtmlAttribute(photoUrl);
  const baseFill = mixColors(accent, '#ffffff', 0.84);
  const overlayFill = mixColors(accent, '#ffffff', 0.18);

  return `<g clip-path="url(#${clipId})"><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${baseFill}"/><image href="${safePhotoUrl}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${overlayFill}" opacity="0.14"/></g>`;
};

const createPoiMarkerSvg = (poi: PointData, accent: string, scopeId: string, photoUrl: string | null) => {
  let svgMarkup = scopeSvgIds(pinMapaSvg, scopeId);
  svgMarkup = colorizePinMapaSvg(svgMarkup, accent);

  const clipId = `${scopeId}-photoClip`;
  const clipGroupPattern = new RegExp(
    `<g clip-path="url\\(#${escapeRegExp(clipId)}\\)">[\\s\\S]*?<\\/g>`,
    'i',
  );
  svgMarkup = svgMarkup.replace(
    clipGroupPattern,
    photoUrl ? buildPoiMarkerPhotoArtwork(photoUrl, clipId, accent) : buildPoiMarkerFallbackArtwork(poi, clipId, accent),
  );

  return svgMarkup.replace('<svg ', '<svg class="poi-marker-svg" ');
};

const createIcon = (label: string, color: string, size = 30, isHighlighted = false) =>
  new L.DivIcon({
    html: `<div style='background:${color}; color:white; width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:${isHighlighted ? 3 : 2}px solid white; box-shadow:${isHighlighted ? '0 10px 22px rgba(15,23,42,0.42)' : '0 3px 8px rgba(15,23,42,0.35)'}; font-size:${size * 0.45}px; font-weight:700; transform:${isHighlighted ? 'scale(1.06)' : 'scale(1)'};'>${label}</div>`,
    className: 'custom-poi-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const createPoiIcon = (
  poi: PointData,
  accent: string,
  photoUrl: string | null,
  size = 34,
  isHighlighted = false,
) => {
  const scopeId = `poi-marker-${sanitizeSvgScopeId(poi.id)}-${isHighlighted ? 'active' : 'idle'}`;
  const svgMarkup = createPoiMarkerSvg(poi, accent, scopeId, photoUrl);
  const height = Math.round(size * PIN_MAPA_ASPECT_RATIO);
  return new L.DivIcon({
    html: `<div class='poi-marker-shell poi-marker-shell--svg${isHighlighted ? ' is-highlighted' : ''}' style='--poi-width:${size}px; --poi-height:${height}px;'><span class='poi-marker-art'>${svgMarkup}</span></div>`,
    className: 'custom-poi-icon',
    iconSize: [size, height],
    iconAnchor: [size / 2, Math.round(height * PIN_MAPA_TIP_RATIO_Y)],
    popupAnchor: [0, -Math.round(height * 0.78)],
  });
};

export const getPoiIcon = (
  poi: PointData,
  sizeTier: PoiPinScaleTier,
  pinSizes: PoiPinSizeByTier,
  isHighlighted = false,
) => {
  const palette = getPoiPalette(poi);
  const size = pinSizes[sizeTier];
  const photoUrl = resolvePoiPrimaryPhotoUrl(poi.id, poi.nome, poi.imagemUrl);
  const cacheKey = `${poi.id}|${palette.accent}|${photoUrl ?? 'sem-foto'}|${sizeTier}|${size}|${isHighlighted ? 1 : 0}`;
  const cached = poiIconCache.get(cacheKey);
  if (cached) return cached;

  const icon = createPoiIcon(poi, palette.accent, photoUrl, size, isHighlighted);
  poiIconCache.set(cacheKey, icon);
  return icon;
};

export const stateIcons = {
  novo: createIcon('+', BRAND_COLORS.highlight, 22),
  origem: createIcon('O', BRAND_COLORS.primary, 40, true),
  destino: createIcon('D', BRAND_COLORS.ink, 40, true),
};
