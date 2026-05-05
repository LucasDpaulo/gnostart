import {
  Circle,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Pane,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { findNearestNode, resolveRoutableNodeId } from '../../utils/pathfinding';
import { MapDockButtons } from './allbuttons/MapDockButtons';
import { MapHeader } from './header/MapHeader';
import { MapAdminEditor, MapAdminPanel } from './admin/MapAdminPanel';
import { AgendaPanel } from './allbuttons/cronogram/AgendaPanel';
import { useMapDock } from './dock/useMapDock';
import { MapController, MapInteractionEvents, MapSizeSync, MapViewportBoundsController } from './map/MapControllers';
import { MapPoiLayer, MapPresenceLayer, MapRouteLayer } from './map/MapLayers';
import {
  getImagePointDistance,
  imageToLatLng,
  isPointInsidePolygon,
  latLngToImageOverlay,
  logicalMapOverlayBounds,
  mapOverlayBounds,
  mapViewportBounds,
  MAP_HEIGHT,
  MAP_WIDTH,
} from './map/mapProjection';
import {
  BRAND_COLORS,
  getPoiAccentColor,
  getPoiBadgeText,
  getPoiIcon,
  isBrandPaletteColor,
  mixColors,
  normalizeBadgeText,
  normalizeHexColor,
  stateIcons,
} from './map/poiVisuals';
import { getAutoAssignedPoiPhotoReference, getPoiPhotoImage, resolvePoiPhotoUrl, resolvePoiPrimaryPhotoUrl } from './map/poiPhotos';
import { PartnersPanel } from './allbuttons/partnership/PartnersPanel';
import { ManualOriginFallbackOverlay } from './allbuttons/routes/ManualOriginFallbackOverlay';
import { PinPanel } from './allbuttons/local/PinPanel';
import { RoutePanel } from './allbuttons/routes/RoutePanel';
import { useRouteNavigation } from './allbuttons/routes/useRouteNavigation';
import { MapTutorialOverlay } from './tutorial/MapTutorialOverlay';
import { usePoiAdmin } from './admin/usePoiAdmin';
import {
  CURRENT_MAP_BUILD_REGISTRATION,
  describeMapBuildRegistrationDifference,
  formatMapBuildRegistration,
  isSameMapBuildRegistration,
  sanitizeMapBuildRegistration,
} from './admin/buildRegistration';
import { agendaDays, agendaSessions, compareAgendaSessions, formatAgendaDuration } from './data/agenda';
import { tutorialSteps } from './tutorial/tutorialSteps';
import type {
  AdminAgendaPoiLinkSnapshot,
  AdminWorkspaceSnapshot,
  AgendaDayId,
  AgendaSession,
  AgendaSessionPoiLinkOverrides,
  DockPanelKey,
  EditingPoi,
  InitialPoiRuntimeState,
  MapBuildRegistration,
  ManualRouteOrigin,
  PoiAccessCount,
  PoiDataSource,
  PointData,
  PoiRuntimeBackupSnapshot,
  PoiType,
  TapIndicator,
} from './types';
import {
  getPoiSearchTerms,
  normalizeForSearch,
  resolveAgendaSessionPoi,
  sessionMatchesPoi,
} from './utils/poiMatching';
import {
  EVENT_BOUNDARY_IMAGE_POINTS,
  FREE_WALK_NAVIGATION_ENABLED,
  MAP_CENTER,
  MAP_VIEW_CENTER,
  OFFICIAL_MAP_BOUNDS_VISCOSITY,
  OFFICIAL_MAP_FOREGROUND_SURFACE_URLS,
  OFFICIAL_MAP_SURFACE_URLS,
  getPoiAutoVisibleLimit,
  getPoiPinSizes,
  getPoiPinScaleTier,
  getPoiPreviewSizeLimits,
  shouldShowPoiPins,
} from '../../config/mapConfig';
import rawInitialPoisSeed from '../../data/locaisEventoSocialSeed.json';
import brandIcon from '../../assets/icone.svg';
import logicalMapSurfaceUrl from '../../../scripts/logica_nova.png';

const DEFAULT_DOCK_PANEL_HEIGHTS: Record<DockPanelKey, number> = {
  pins: 0.66,
  route: 0.7,
  agenda: 0.9,
  partners: 0.9,
};

const MIN_DOCK_PANEL_HEIGHTS: Record<DockPanelKey, number> = {
  pins: 0.34,
  route: 0.38,
  agenda: 0.42,
  partners: 0.42,
};

const ROUTE_REVEAL_MIN_DURATION_MS = 1000;
const ROUTE_REVEAL_MAX_DURATION_MS = 3000;
const ROUTE_REVEAL_MS_PER_METER = 11;
const MANUAL_ROUTE_ORIGIN_POI_MAX_DISTANCE = 120;
const MANUAL_ROUTE_FALLBACK_TIMEOUT_MS = 0;
const PRESENTATION_WALKER_MIN_DURATION_MS = 2500;
const PRESENTATION_WALKER_MAX_DURATION_MS = 5200;
const PRESENTATION_WALKER_MS_PER_METER = 16;
const TAP_FEEDBACK_DURATION_MS = 560;
const TAP_FEEDBACK_MAX_MOVE_PX = 12;
const AVERAGE_WALKING_SPEED_MPS = 1.4;
const WALKER_PROGRESS_UPDATE_MS = 250;
const ROUTE_AUTO_EXPIRE_MS = 5 * 60 * 1000;

const toRadians = (value: number) => (value * Math.PI) / 180;

const getLatLngDistanceMeters = (from: [number, number], to: [number, number]) => {
  const earthRadius = 6371000;
  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinLng ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadius * centralAngle;
};

const getPathDistanceMeters = (positions: [number, number][]) => {
  if (positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i += 1) {
    total += getLatLngDistanceMeters(positions[i - 1], positions[i]);
  }
  return total;
};

const formatDistanceLabel = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  const rounded = Math.max(5, Math.round(meters / 5) * 5);
  return `${rounded} m`;
};

const formatWalkingTimeLabel = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0.45) return '< 1 min';
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded >= 60) {
    const hours = Math.floor(rounded / 60);
    const restMinutes = rounded % 60;
    return restMinutes > 0 ? `${hours}h ${restMinutes}min` : `${hours}h`;
  }
  return `${rounded} min`;
};

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;

const getAdaptiveAnimationDuration = (
  distanceMeters: number,
  minDurationMs: number,
  maxDurationMs: number,
  msPerMeter: number,
) => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return minDurationMs;
  return Math.min(maxDurationMs, Math.max(minDurationMs, distanceMeters * msPerMeter));
};

const getPointAlongPath = (positions: [number, number][], progress: number): [number, number] => {
  if (positions.length === 0) return [MAP_CENTER[0], MAP_CENTER[1]];
  if (positions.length === 1) return positions[0];

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segmentDistances: number[] = [];
  let totalDistance = 0;
  for (let i = 1; i < positions.length; i += 1) {
    const distance = getLatLngDistanceMeters(positions[i - 1], positions[i]);
    segmentDistances.push(distance);
    totalDistance += distance;
  }

  if (totalDistance <= 0) return positions[positions.length - 1];

  const targetDistance = totalDistance * clampedProgress;
  let coveredDistance = 0;

  for (let i = 1; i < positions.length; i += 1) {
    const segmentDistance = segmentDistances[i - 1];
    if (coveredDistance + segmentDistance >= targetDistance) {
      const ratio =
        segmentDistance > 0 ? (targetDistance - coveredDistance) / segmentDistance : 0;
      const [startLat, startLng] = positions[i - 1];
      const [endLat, endLng] = positions[i];
      return [startLat + (endLat - startLat) * ratio, startLng + (endLng - startLng) * ratio];
    }
    coveredDistance += segmentDistance;
  }

  return positions[positions.length - 1];
};

const getPathSliceUntilProgress = (positions: [number, number][], progress: number): [number, number][] => {
  if (positions.length === 0) return [];
  if (positions.length === 1) return positions;

  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (clampedProgress <= 0) return [positions[0]];
  if (clampedProgress >= 1) return positions;

  const segmentDistances: number[] = [];
  let totalDistance = 0;
  for (let i = 1; i < positions.length; i += 1) {
    const distance = getLatLngDistanceMeters(positions[i - 1], positions[i]);
    segmentDistances.push(distance);
    totalDistance += distance;
  }

  if (totalDistance <= 0) return positions;

  const targetDistance = totalDistance * clampedProgress;
  let coveredDistance = 0;
  const revealedPath: [number, number][] = [positions[0]];

  for (let i = 1; i < positions.length; i += 1) {
    const segmentDistance = segmentDistances[i - 1];
    if (coveredDistance + segmentDistance >= targetDistance) {
      const ratio = segmentDistance > 0 ? (targetDistance - coveredDistance) / segmentDistance : 0;
      const [startLat, startLng] = positions[i - 1];
      const [endLat, endLng] = positions[i];
      revealedPath.push([startLat + (endLat - startLat) * ratio, startLng + (endLng - startLng) * ratio]);
      return revealedPath;
    }

    revealedPath.push(positions[i]);
    coveredDistance += segmentDistance;
  }

  return positions;
};
const POI_ACCESS_STORAGE_KEY = 'gnostart.poiAccessCount.mapaGeral';
const POI_RUNTIME_BACKUP_STORAGE_KEY = 'gnostart.poiRuntimeBackup.mapaGeral';
const ADMIN_POI_WORKSPACE_STORAGE_KEY = 'gnostart.adminPoiWorkspace.mapaGeral';
const ADMIN_AGENDA_POI_LINKS_STORAGE_KEY = 'gnostart.adminAgendaPoiLinks.mapaGeral';
const MOBILE_MEDIA_QUERY = '(max-width: 900px)';
const COMPACT_MEDIA_QUERY = '(max-width: 1180px), (max-height: 760px)';
const PRESENTATION_MODE_QUERY_KEY = 'modo';
const PRESENTATION_MODE_DEFAULT = true;
const POI_STORAGE_SCHEMA_VERSION = 10;
const POI_DATA_EXPORT_FILENAME = 'locais_evento_social.json';
const EVENT_NAME = 'GNOSTART';
const EVENT_LABEL = `Evento ${EVENT_NAME}`;
const CURRENT_MAP_BUILD_LABEL = formatMapBuildRegistration(CURRENT_MAP_BUILD_REGISTRATION);
const REMOVED_POI_IDS = new Set<string>(['laboratorio_game', 'armazem_da_criatividade_1773977448618']);
const PUBLICLY_HIDDEN_POI_IDS = new Set<string>();
const TUTORIAL_STORAGE_KEY = 'gnostart.mapTutorialSeen.mapaGeral';
const LEGACY_STORAGE_KEYS_TO_CLEAR = [
  'gnostart.poiAccessCount',
  'gnostart.poiRuntimeBackup',
  'gnostart.adminPoiWorkspace',
  'gnostart.adminAgendaPoiLinks',
  'gnostart.mapTutorialSeen.v3',
  'gnostart.poiAccessCount.logicaNova',
  'gnostart.poiRuntimeBackup.logicaNova',
  'gnostart.adminPoiWorkspace.logicaNova',
  'gnostart.adminAgendaPoiLinks.logicaNova',
  'gnostart.mapTutorialSeen.logicaNova',
];
// Ajuste manual rapido de layout. Troque estes valores para calibrar a interface sem expor botoes no app.
const BRAND_LOGO_SCALE = 1.2;

const getPresentationModeFromQuery = () => {
  if (typeof window === 'undefined') return PRESENTATION_MODE_DEFAULT;
  const rawMode = new URLSearchParams(window.location.search)
    .get(PRESENTATION_MODE_QUERY_KEY)
    ?.trim()
    .toLowerCase();

  if (rawMode === 'admin' || rawMode === 'edicao') return false;
  if (rawMode === 'apresentacao') return true;
  return PRESENTATION_MODE_DEFAULT;
};

const defaultPoiImages: Record<PoiType, string> = {
  entrada: '/images/pois/indicadores/entrada.svg',
  banheiro: '/images/pois/indicadores/banheiro.svg',
  atividade: '/images/pois/indicadores/evento.svg',
  servico: '/images/pois/indicadores/apoio.svg',
};

const poiTypeLabels: Record<PoiType, string> = {
  atividade: 'Atividades',
  servico: 'Serviços',
  banheiro: 'Banheiros',
  entrada: 'Entradas',
};

const poiTypeSingularLabels: Record<PoiType, string> = {
  atividade: 'Atividade',
  servico: 'Serviço',
  banheiro: 'Banheiro',
  entrada: 'Entrada',
};

const attachNearestNode = (poi: PointData): PointData => {
  if (FREE_WALK_NAVIGATION_ENABLED) return poi;
  const resolvedNodeId = resolveRoutableNodeId(poi.x, poi.y, poi.nodeId ?? null, 120, 120);
  return { ...poi, nodeId: resolvedNodeId ?? undefined };
};

const isPoiRemoved = (id: string) => REMOVED_POI_IDS.has(id);

const withAutoAssignedPoiPhoto = (poi: PointData): PointData => {
  const imagemUrl = getAutoAssignedPoiPhotoReference(poi.id, poi.nome, poi.imagemUrl);
  return imagemUrl && imagemUrl !== poi.imagemUrl ? { ...poi, imagemUrl } : poi;
};

const isPoiType = (value: unknown): value is PoiType =>
  value === 'atividade' || value === 'servico' || value === 'banheiro' || value === 'entrada';

const sanitizeStoredPoi = (value: unknown): PointData | null => {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  const x = typeof candidate.x === 'number' ? candidate.x : Number(candidate.x);
  const y = typeof candidate.y === 'number' ? candidate.y : Number(candidate.y);

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.nome !== 'string' ||
    !isPoiType(candidate.tipo) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  if (isPoiRemoved(candidate.id)) {
    return null;
  }

  return attachNearestNode(
    withAutoAssignedPoiPhoto({
      id: candidate.id,
      nome: candidate.nome.trim(),
      tipo: candidate.tipo,
      x,
      y,
      descricao: typeof candidate.descricao === 'string' ? candidate.descricao : undefined,
      imagemUrl: typeof candidate.imagemUrl === 'string' ? candidate.imagemUrl : undefined,
      contato: typeof candidate.contato === 'string' ? candidate.contato : undefined,
      corDestaque: typeof candidate.corDestaque === 'string' ? candidate.corDestaque : undefined,
      selo: typeof candidate.selo === 'string' ? candidate.selo : undefined,
      nodeId: typeof candidate.nodeId === 'string' ? candidate.nodeId : undefined,
    }),
  );
};

const parseStoredPoiList = (value: unknown) =>
  (Array.isArray(value) ? value.map(sanitizeStoredPoi).filter(Boolean) : []) as PointData[];

const clearLocalStorageKey = (storageKey: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignora erro de storage para nao interromper o mapa.
  }
};

const parseStoredPoiImport = (
  value: unknown,
): {
  pois: PointData[];
  draftPoiIds: string[];
  build: MapBuildRegistration | null;
} => {
  if (Array.isArray(value)) {
    return {
      pois: parseStoredPoiList(value),
      draftPoiIds: [],
      build: null,
    };
  }

  if (!value || typeof value !== 'object') {
    return {
      pois: [],
      draftPoiIds: [],
      build: null,
    };
  }

  const candidate = value as Record<string, unknown>;
  const pois = parseStoredPoiList(candidate.pois);
  const validPoiIds = new Set(pois.map((poi) => poi.id));
  const draftPoiIds = Array.isArray(candidate.draftPoiIds)
    ? candidate.draftPoiIds.filter((id): id is string => typeof id === 'string' && validPoiIds.has(id))
    : [];

  return {
    pois,
    draftPoiIds,
    build: sanitizeMapBuildRegistration(candidate.build),
  };
};

const getFrontSeedPois = () => {
  const importedSeedPois = parseStoredPoiList(rawInitialPoisSeed);
  return importedSeedPois;
};

const loadPoiRuntimeBackupSnapshot = (): PoiRuntimeBackupSnapshot | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(POI_RUNTIME_BACKUP_STORAGE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<PoiRuntimeBackupSnapshot> | PointData[];
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      clearLocalStorageKey(POI_RUNTIME_BACKUP_STORAGE_KEY);
      return null;
    }

    if (parsed.version !== POI_STORAGE_SCHEMA_VERSION) {
      clearLocalStorageKey(POI_RUNTIME_BACKUP_STORAGE_KEY);
      return null;
    }

    const build = sanitizeMapBuildRegistration(parsed.build);
    if (!isSameMapBuildRegistration(build, CURRENT_MAP_BUILD_REGISTRATION)) {
      clearLocalStorageKey(POI_RUNTIME_BACKUP_STORAGE_KEY);
      return null;
    }

    return {
      version: POI_STORAGE_SCHEMA_VERSION,
      pois: parseStoredPoiList(parsed.pois),
      build: build ?? undefined,
    };
  } catch {
    return null;
  }
};

const loadPoiRuntimeBackup = (): PointData[] => loadPoiRuntimeBackupSnapshot()?.pois ?? [];

const loadAdminWorkspaceSnapshot = (): AdminWorkspaceSnapshot | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(ADMIN_POI_WORKSPACE_STORAGE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as Partial<AdminWorkspaceSnapshot>;
    if (parsed.version !== POI_STORAGE_SCHEMA_VERSION) {
      clearLocalStorageKey(ADMIN_POI_WORKSPACE_STORAGE_KEY);
      return null;
    }
    const pois = parseStoredPoiList(parsed?.pois);
    if (pois.length === 0) {
      clearLocalStorageKey(ADMIN_POI_WORKSPACE_STORAGE_KEY);
      return null;
    }

    const build = sanitizeMapBuildRegistration(parsed.build);
    if (!isSameMapBuildRegistration(build, CURRENT_MAP_BUILD_REGISTRATION)) {
      clearLocalStorageKey(ADMIN_POI_WORKSPACE_STORAGE_KEY);
      return null;
    }

    const validPoiIds = new Set(pois.map((poi) => poi.id));
    const draftPoiIds = Array.isArray(parsed?.draftPoiIds)
      ? parsed.draftPoiIds.filter((id): id is string => typeof id === 'string' && validPoiIds.has(id))
      : [];

    return {
      version: POI_STORAGE_SCHEMA_VERSION,
      pois,
      draftPoiIds,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      build: build ?? undefined,
    };
  } catch {
    return null;
  }
};

const persistAdminWorkspaceSnapshot = (value: Omit<AdminWorkspaceSnapshot, 'version'>) => {
  if (typeof window === 'undefined') return;

  try {
    const snapshot: AdminWorkspaceSnapshot = {
      version: POI_STORAGE_SCHEMA_VERSION,
      pois: value.pois,
      draftPoiIds: value.draftPoiIds,
      updatedAt: value.updatedAt,
      build: CURRENT_MAP_BUILD_REGISTRATION,
    };
    window.localStorage.setItem(ADMIN_POI_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignora erro de storage para não interromper o admin.
  }
};

const clearAdminWorkspaceSnapshot = () => {
  clearLocalStorageKey(ADMIN_POI_WORKSPACE_STORAGE_KEY);
};

const sanitizeAgendaPoiLinkRecord = (value: unknown): AgendaSessionPoiLinkOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([sessionId, poiId]) => typeof sessionId === 'string' && typeof poiId === 'string' && poiId.trim().length > 0,
    ),
  );
};

const loadAdminAgendaPoiLinks = (): AgendaSessionPoiLinkOverrides => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(ADMIN_AGENDA_POI_LINKS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as Partial<AdminAgendaPoiLinkSnapshot> | Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      clearLocalStorageKey(ADMIN_AGENDA_POI_LINKS_STORAGE_KEY);
      return {};
    }

    const hasVersionedShape = 'version' in parsed || 'links' in parsed;
    if (hasVersionedShape) {
      const snapshot = parsed as Partial<AdminAgendaPoiLinkSnapshot>;
      if (snapshot.version !== POI_STORAGE_SCHEMA_VERSION) {
        clearLocalStorageKey(ADMIN_AGENDA_POI_LINKS_STORAGE_KEY);
        return {};
      }
      return sanitizeAgendaPoiLinkRecord(snapshot.links);
    }

    clearLocalStorageKey(ADMIN_AGENDA_POI_LINKS_STORAGE_KEY);
    return {};
  } catch {
    return {};
  }
};

const persistAdminAgendaPoiLinks = (value: AgendaSessionPoiLinkOverrides) => {
  if (typeof window === 'undefined') return;

  try {
    const snapshot: AdminAgendaPoiLinkSnapshot = {
      version: POI_STORAGE_SCHEMA_VERSION,
      links: value,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(ADMIN_AGENDA_POI_LINKS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignora erro de storage para nao interromper o admin.
  }
};

const getInitialPoiRuntimeState = (): InitialPoiRuntimeState => {
  const workspaceSnapshot = loadAdminWorkspaceSnapshot();
  if (workspaceSnapshot) {
    const buildWarning = describeMapBuildRegistrationDifference(workspaceSnapshot.build, CURRENT_MAP_BUILD_REGISTRATION);
    return {
      pois: workspaceSnapshot.pois,
      source: 'local-workspace',
      draftPoiIds: workspaceSnapshot.draftPoiIds,
      buildWarning,
    };
  }

  const runtimeBackupSnapshot = loadPoiRuntimeBackupSnapshot();
  if (runtimeBackupSnapshot && runtimeBackupSnapshot.pois.length > 0) {
    const buildWarning = describeMapBuildRegistrationDifference(
      runtimeBackupSnapshot.build,
      CURRENT_MAP_BUILD_REGISTRATION,
    );
    return {
      pois: runtimeBackupSnapshot.pois,
      source: 'local-backup',
      draftPoiIds: [],
      buildWarning,
    };
  }

  return {
    pois: getFrontSeedPois(),
    source: 'front-seed',
    draftPoiIds: [],
    buildWarning: null,
  };
};

const loadPoiAccessCount = (): PoiAccessCount => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(POI_ACCESS_STORAGE_KEY);
    if (!rawValue) return {};
    const parsed = JSON.parse(rawValue) as PoiAccessCount;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const persistPoiAccessCount = (value: PoiAccessCount) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(POI_ACCESS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignora erro de storage para não quebrar a UX.
  }
};

const getPoiGalleryImages = (poi: PointData) => {
  return Array.from(
    new Set(
      [getPoiPhotoImage(poi.id, poi.nome), resolvePoiPhotoUrl(poi.imagemUrl), defaultPoiImages[poi.tipo]].filter(Boolean) as string[],
    ),
  );
};

const ModaCenterMap = () => {
  const [initialPoiRuntime] = useState(getInitialPoiRuntimeState);
  const [isPresentationMode] = useState(getPresentationModeFromQuery);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPinsSummaryOpen, setIsPinsSummaryOpen] = useState(false);
  const [isLogicalMapCompareOpen, setIsLogicalMapCompareOpen] = useState(false);
  const [adminPanelPosition, setAdminPanelPosition] = useState({ x: 18, y: 78 });
  const [isAdminPanelDragging, setIsAdminPanelDragging] = useState(false);
  const [pois, setPois] = useState<PointData[]>(initialPoiRuntime.pois);
  const [officialMapSurfaceUrls, setOfficialMapSurfaceUrls] = useState<string[]>([]);
  const [poiDataSource, setPoiDataSource] = useState<PoiDataSource>(initialPoiRuntime.source);
  const [draftPoiIds, setDraftPoiIds] = useState<string[]>(initialPoiRuntime.draftPoiIds);
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [adminTypeFilter, setAdminTypeFilter] = useState<'todos' | PoiType>('todos');
  const [adminStatusMessage, setAdminStatusMessage] = useState<string | null>(
    initialPoiRuntime.buildWarning ??
      (initialPoiRuntime.source === 'local-workspace'
      ? 'Edição local carregada. Revise os pontos e publique apenas quando estiver tudo certo.'
        : null),
  );
  const [adminAgendaPoiLinks, setAdminAgendaPoiLinks] = useState<AgendaSessionPoiLinkOverrides>(loadAdminAgendaPoiLinks);
  const [rota, setRota] = useState<number[][] | null>(null);
  const [editingPoi, setEditingPoi] = useState<EditingPoi | null>(null);
  const [focusPoint, setFocusPoint] = useState<PointData | null>(null);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
  const [expandedPopupPoiId, setExpandedPopupPoiId] = useState<string | null>(null);
  const [mapZoomLevel, setMapZoomLevel] = useState(0);
  const [mapZoomRange, setMapZoomRange] = useState<{ min: number; max?: number }>({ min: 0 });
  const handleMapZoomLevelChange = useCallback((value: number) => {
    setMapZoomLevel((current) => (current === value ? current : value));
  }, []);
  const handleMapZoomRangeChange = useCallback((minZoom: number, maxZoom: number | null) => {
    const resolvedMaxZoom = maxZoom ?? undefined;
    setMapZoomRange((current) =>
      current.min === minZoom && current.max === resolvedMaxZoom
        ? current
        : { min: minZoom, max: resolvedMaxZoom },
    );
  }, []);
  const [poiAccessCount, setPoiAccessCount] = useState<PoiAccessCount>(loadPoiAccessCount);
  const [searchTerm, setSearchTerm] = useState('');
  const [enabledTypes, setEnabledTypes] = useState<Record<PoiType, boolean>>({
    atividade: true,
    servico: true,
    banheiro: true,
    entrada: true,
  });
  const [manualVisiblePoiIds, setManualVisiblePoiIds] = useState<string[]>([]);
  const [selectedOriginId, setSelectedOriginId] = useState('');
  const [manualMapOrigin, setManualMapOrigin] = useState<ManualRouteOrigin | null>(null);
  const [originQuery, setOriginQuery] = useState('');
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [isManualOriginPickerOpen, setIsManualOriginPickerOpen] = useState(false);
  const [manualOriginPickerMode, setManualOriginPickerMode] = useState<'fallback' | 'reposition' | null>(null);
  const [isManualOriginRequired, setIsManualOriginRequired] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  useEffect(() => {
    LEGACY_STORAGE_KEYS_TO_CLEAR.forEach((storageKey) => clearLocalStorageKey(storageKey));
  }, []);
  const {
    isMobile,
    isCompactViewport,
    prefersReducedMotion,
    viewportHeight,
    viewportWidth,
    isPinsPanelOpen,
    isRoutePanelOpen,
    isAgendaPanelOpen,
    isPartnersPanelOpen,
    dockPanelHeights,
    isDockSheetDragging,
    activeDockPanel,
    isDockPanelOpen,
    dockSheetBodyRef,
    closeDockPanel,
    toggleDockPanel,
    handleDockSheetDragPointerDown,
    handleDockSheetDragPointerMove,
    handleDockSheetDragPointerUp,
    handleDockSheetDragPointerCancel,
  } = useMapDock({
    defaultDockPanelHeights: DEFAULT_DOCK_PANEL_HEIGHTS,
    minDockPanelHeights: MIN_DOCK_PANEL_HEIGHTS,
    mobileMediaQuery: MOBILE_MEDIA_QUERY,
    compactMediaQuery: COMPACT_MEDIA_QUERY,
  });
  const [selectedAgendaDay, setSelectedAgendaDay] = useState<AgendaDayId>('21');
  const [favoriteAgendaIds, setFavoriteAgendaIds] = useState<string[]>([]);
  const [routeMessage, setRouteMessage] = useState(
    'Escolha um destino e confirme onde voce esta para montar a rota pelos corredores do mapa.',
  );
  const [isRouteViewportSettled, setIsRouteViewportSettled] = useState(true);
  const [shouldAnimateRouteReveal, setShouldAnimateRouteReveal] = useState(false);
  const [routeRevealProgress, setRouteRevealProgress] = useState(0);
  const [walkerProgress, setWalkerProgress] = useState(0);
  const [walkerPosition, setWalkerPosition] = useState<[number, number] | null>(null);
  const [tapIndicators, setTapIndicators] = useState<TapIndicator[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const walkerTimerRef = useRef<number | null>(null);
  const routeRevealFrameRef = useRef<number | null>(null);
  const tapIndicatorIdRef = useRef(0);
  const tapIndicatorTimeoutsRef = useRef<number[]>([]);
  const manualOriginFallbackTimerRef = useRef<number | null>(null);
  const adminImportInputRef = useRef<HTMLInputElement | null>(null);
  const suppressAdminMapClickRef = useRef(false);
  const adminMapClickTimeoutRef = useRef<number | null>(null);
  const adminPanelDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pointerGestureRef = useRef(new Map<number, { startX: number; startY: number; moved: boolean }>());
  const lastPanelStateRef = useRef({
    pins: false,
    route: false,
    agenda: false,
    partners: false,
  });
  const publicPois = useMemo(
    () => pois.filter((poi) => !PUBLICLY_HIDDEN_POI_IDS.has(poi.id)),
    [pois],
  );
  const effectiveAdminAgendaPoiLinks = useMemo(() => {
    const validSessionIds = new Set(agendaSessions.map((session) => session.id));
    const validPoiIds = new Set(pois.map((poi) => poi.id));

    return Object.fromEntries(
      Object.entries(adminAgendaPoiLinks).filter(
        ([sessionId, poiId]) => validSessionIds.has(sessionId) && validPoiIds.has(poiId),
      ),
    );
  }, [adminAgendaPoiLinks, pois]);
  const effectiveManualVisiblePoiIds = useMemo(
    () => manualVisiblePoiIds.filter((id) => publicPois.some((poi) => poi.id === id)),
    [manualVisiblePoiIds, publicPois],
  );

  const suppressNextAdminMapClick = useCallback((durationMs = 180) => {
    if (typeof window === 'undefined') return;

    suppressAdminMapClickRef.current = true;
    if (adminMapClickTimeoutRef.current !== null) {
      window.clearTimeout(adminMapClickTimeoutRef.current);
    }

    adminMapClickTimeoutRef.current = window.setTimeout(() => {
      suppressAdminMapClickRef.current = false;
      adminMapClickTimeoutRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    if (!isPresentationMode || !isAdmin) return;
    setIsAdmin(false);
    setEditingPoi(null);
  }, [isPresentationMode, isAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined' || isAdmin) return;
    const hasSeenTutorial = window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
    if (hasSeenTutorial) return;
    setTutorialStepIndex(0);
    setIsTutorialOpen(true);
  }, [isAdmin]);

  const playUiSound = useCallback(
    (variant: 'tap' | 'panel' | 'route') => {
      if (typeof window === 'undefined' || isAdmin) return;
      if (!window.AudioContext) return;

      const context = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = context;
      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }

      const soundMap = {
        tap: {
          type: 'sine' as OscillatorType,
          start: 880,
          end: 640,
          gain: 0.015,
          duration: 0.065,
          filter: 1650,
        },
        panel: {
          type: 'triangle' as OscillatorType,
          start: 430,
          end: 620,
          gain: 0.018,
          duration: 0.11,
          filter: 1350,
        },
        route: {
          type: 'triangle' as OscillatorType,
          start: 540,
          end: 840,
          gain: 0.022,
          duration: 0.14,
          filter: 1500,
        },
      };

      const settings = soundMap[variant];
      const now = context.currentTime + 0.01;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();

      oscillator.type = settings.type;
      oscillator.frequency.setValueAtTime(settings.start, now);
      oscillator.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(settings.filter, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(settings.gain, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + settings.duration + 0.04);
    },
    [isAdmin],
  );

  const spawnTapIndicator = useCallback(
    (x: number, y: number) => {
      if (typeof window === 'undefined' || isAdmin) return;

      const nextId = tapIndicatorIdRef.current;
      tapIndicatorIdRef.current += 1;
      setTapIndicators((prev) => [...prev, { id: nextId, x, y }]);
      playUiSound('tap');

      const timeoutId = window.setTimeout(() => {
        setTapIndicators((prev) => prev.filter((indicator) => indicator.id !== nextId));
        tapIndicatorTimeoutsRef.current = tapIndicatorTimeoutsRef.current.filter((id) => id !== timeoutId);
      }, TAP_FEEDBACK_DURATION_MS);

      tapIndicatorTimeoutsRef.current.push(timeoutId);
    },
    [isAdmin, playUiSound],
  );

  const handleRootPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerGestureRef.current.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    });
  };

  const handleRootPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const trackedPointer = pointerGestureRef.current.get(event.pointerId);
    if (!trackedPointer || trackedPointer.moved) return;

    const moveX = event.clientX - trackedPointer.startX;
    const moveY = event.clientY - trackedPointer.startY;
    if (Math.hypot(moveX, moveY) > TAP_FEEDBACK_MAX_MOVE_PX) {
      trackedPointer.moved = true;
    }
  };

  const handleRootPointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const trackedPointer = pointerGestureRef.current.get(event.pointerId);
    pointerGestureRef.current.delete(event.pointerId);
    if (!trackedPointer || trackedPointer.moved) return;
    spawnTapIndicator(event.clientX, event.clientY);
  };

  const handleRootPointerCancelCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerGestureRef.current.delete(event.pointerId);
  };

  useEffect(() => {
    const previousState = lastPanelStateRef.current;
    const hasPanelOpened =
      (!previousState.pins && isPinsPanelOpen) ||
      (!previousState.route && isRoutePanelOpen) ||
      (!previousState.agenda && isAgendaPanelOpen) ||
      (!previousState.partners && isPartnersPanelOpen);

    if (hasPanelOpened) {
      playUiSound('panel');
    }

    lastPanelStateRef.current = {
      pins: isPinsPanelOpen,
      route: isRoutePanelOpen,
      agenda: isAgendaPanelOpen,
      partners: isPartnersPanelOpen,
    };
  }, [isPinsPanelOpen, isRoutePanelOpen, isAgendaPanelOpen, isPartnersPanelOpen, playUiSound]);


  useEffect(() => {
    return () => {
      tapIndicatorTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      tapIndicatorTimeoutsRef.current = [];
      if (adminMapClickTimeoutRef.current !== null) {
        window.clearTimeout(adminMapClickTimeoutRef.current);
        adminMapClickTimeoutRef.current = null;
      }

      if (routeRevealFrameRef.current !== null) {
        window.cancelAnimationFrame(routeRevealFrameRef.current);
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);
  const routeShadowColor = mixColors(BRAND_COLORS.ink, BRAND_COLORS.primaryStrong, 0.24);
  const routeGuideColor = mixColors(BRAND_COLORS.highlight, BRAND_COLORS.surface, 0.36);
  const previewMarkerTone = mixColors(BRAND_COLORS.primaryStrong, BRAND_COLORS.ink, 0.1);

  const renderPresenceMarker = (
    position: [number, number],
    options: {
      label: string;
      tone: string;
      accuracyMeters?: number;
    },
  ) => {
    const outerRadius = isMobile ? 11 : 12;
    const middleRadius = isMobile ? 7 : 8;
    const coreRadius = isMobile ? 2.6 : 3;
    const haloTone = mixColors(options.tone, BRAND_COLORS.surface, 0.18);
    const ringTone = mixColors(options.tone, BRAND_COLORS.surface, 0.5);

    return (
      <>
        {typeof options.accuracyMeters === 'number' && (
          <Circle
            center={position}
            radius={Math.max(6, options.accuracyMeters)}
            pathOptions={{
              color: options.tone,
              weight: 1.4,
              opacity: 0.2,
              fillColor: options.tone,
              fillOpacity: 0.08,
            }}
            interactive={false}
          />
        )}
        <CircleMarker
          center={position}
          radius={outerRadius}
          interactive={false}
          pathOptions={{
            stroke: false,
            fillColor: haloTone,
            fillOpacity: 0.24,
          }}
        />
        <CircleMarker
          center={position}
          radius={middleRadius}
          interactive={false}
          pathOptions={{
            color: ringTone,
            weight: 3,
            fillColor: options.tone,
            fillOpacity: 1,
          }}
        >
          <Tooltip permanent direction='top' offset={[0, -16]} className='route-walker-label'>
            {options.label}
          </Tooltip>
        </CircleMarker>
        <CircleMarker
          center={position}
          radius={coreRadius}
          interactive={false}
          pathOptions={{
            stroke: false,
            fillColor: BRAND_COLORS.surface,
            fillOpacity: 0.98,
          }}
        />
      </>
    );
  };

  const routeLatLngPoints = useMemo<[number, number][]>(
    () => (rota ? rota.map(([y, x]) => imageToLatLng(x, y)) : []),
    [rota],
  );
  const animatedRouteLatLngPoints = useMemo<[number, number][]>(
    () => getPathSliceUntilProgress(routeLatLngPoints, routeRevealProgress),
    [routeLatLngPoints, routeRevealProgress],
  );
  const visibleRouteLatLngPoints =
    routeLatLngPoints.length > 1 && isRouteViewportSettled ? animatedRouteLatLngPoints : [];
  const routeRevealHeadPoint =
    visibleRouteLatLngPoints.length > 0 ? visibleRouteLatLngPoints[visibleRouteLatLngPoints.length - 1] : null;
  const isRouteRevealComplete =
    routeLatLngPoints.length <= 1 || prefersReducedMotion || routeRevealProgress >= 0.999;

  const routeDistanceMeters = useMemo(() => getPathDistanceMeters(routeLatLngPoints), [routeLatLngPoints]);
  const routeEtaMinutes = routeDistanceMeters / (AVERAGE_WALKING_SPEED_MPS * 60);
  const routeRemainingEtaLabel =
    walkerProgress >= 0.995
      ? 'chegando'
      : formatWalkingTimeLabel(routeEtaMinutes * Math.max(0, 1 - walkerProgress));
  const arePinsHiddenByZoom = !shouldShowPoiPins(mapZoomLevel, mapZoomRange.min, isMobile, isAdmin);

  const orderedByAccessPois = useMemo(() => {
    return [...publicPois].sort((a, b) => {
      const accessDiff = (poiAccessCount[b.id] ?? 0) - (poiAccessCount[a.id] ?? 0);
      if (accessDiff !== 0) return accessDiff;
      return a.nome.localeCompare(b.nome);
    });
  }, [poiAccessCount, publicPois]);

  const searchablePois = useMemo(() => {
    const query = normalizeForSearch(searchTerm.trim());
    return orderedByAccessPois.filter((poi) => {
      if (!enabledTypes[poi.tipo]) return false;
      if (!query) return true;
      return getPoiSearchTerms(poi).some((term) => term.includes(query) || query.includes(term));
    });
  }, [orderedByAccessPois, searchTerm, enabledTypes]);

  const routeSuggestionPois = useMemo(
    () => [...orderedByAccessPois].sort((a, b) => a.nome.localeCompare(b.nome)),
    [orderedByAccessPois],
  );

  const getRouteSuggestions = useCallback((rawQuery: string) => {
    const query = normalizeForSearch(rawQuery.trim());
    const baseList = query
      ? routeSuggestionPois.filter((poi) => {
          const poiTerms = getPoiSearchTerms(poi);
          return poiTerms.some((term) => term.includes(query) || query.includes(term));
        })
      : routeSuggestionPois;

    return [...baseList]
      .sort((a, b) => {
        if (!query) return a.nome.localeCompare(b.nome);

        const aName = normalizeForSearch(a.nome);
        const bName = normalizeForSearch(b.nome);
        const aType = normalizeForSearch(a.tipo);
        const bType = normalizeForSearch(b.tipo);

        const aStarts = Number(aName.startsWith(query));
        const bStarts = Number(bName.startsWith(query));
        if (aStarts !== bStarts) return bStarts - aStarts;

        const aTypeStarts = Number(aType.startsWith(query));
        const bTypeStarts = Number(bType.startsWith(query));
        if (aTypeStarts !== bTypeStarts) return bTypeStarts - aTypeStarts;

        return a.nome.localeCompare(b.nome);
      })
      .slice(0, 8);
  }, [routeSuggestionPois]);

  const deferredDestinationQuery = useDeferredValue(destinationQuery);
  const deferredOriginQuery = useDeferredValue(originQuery);
  const destinationSuggestions = useMemo(() => {
    return getRouteSuggestions(deferredDestinationQuery);
  }, [deferredDestinationQuery, getRouteSuggestions]);
  const originSuggestions = useMemo(() => {
    return getRouteSuggestions(deferredOriginQuery).filter((poi) => poi.id !== selectedDestinationId);
  }, [deferredOriginQuery, getRouteSuggestions, selectedDestinationId]);

  const selectedAgendaDayMeta = useMemo(
    () => agendaDays.find((day) => day.id === selectedAgendaDay) ?? agendaDays[0],
    [selectedAgendaDay],
  );

  const agendaSessionsForSelectedDay = useMemo(
    () => agendaSessions.filter((session) => session.dayId === selectedAgendaDay).sort(compareAgendaSessions),
    [selectedAgendaDay],
  );

  const agendaDayStats = useMemo(() => {
    if (agendaSessionsForSelectedDay.length === 0) {
      return {
        sessionCount: 0,
        venueCount: 0,
        speakerCount: 0,
        connectedCount: 0,
        windowLabel: '--',
      };
    }

    const firstSession = agendaSessionsForSelectedDay[0];
    const lastSession = agendaSessionsForSelectedDay[agendaSessionsForSelectedDay.length - 1];
    const speakerCount = new Set(
      agendaSessionsForSelectedDay.flatMap((session) => session.speakers.map((speaker) => speaker.name)),
    ).size;
    const venueCount = new Set(agendaSessionsForSelectedDay.map((session) => session.venue)).size;
    const connectedCount = agendaSessionsForSelectedDay.filter((session) => {
      return resolveAgendaSessionPoi(session, pois, effectiveAdminAgendaPoiLinks) !== null;
    }).length;

    return {
      sessionCount: agendaSessionsForSelectedDay.length,
      venueCount,
      speakerCount,
      connectedCount,
      windowLabel: `${firstSession.startTime} - ${lastSession.endTime}`,
    };
  }, [agendaSessionsForSelectedDay, effectiveAdminAgendaPoiLinks, pois]);
  const agendaPanelSessions = useMemo(
    () =>
      agendaSessionsForSelectedDay.map((session) => {
        const matchedPoi = resolveAgendaSessionPoi(session, pois, effectiveAdminAgendaPoiLinks);
        return {
          id: session.id,
          weekday: session.weekday,
          dateLabel: session.dateLabel,
          category: session.category,
          title: session.title,
          summary: session.summary,
          venue: session.venue,
          audience: session.audience,
          startTime: session.startTime,
          endTime: session.endTime,
          accent: session.accent,
          durationLabel: formatAgendaDuration(session.startTime, session.endTime),
          isFavorite: favoriteAgendaIds.includes(session.id),
          hasLinkedPoi: Boolean(matchedPoi),
          linkedPoiImage: matchedPoi
            ? resolvePoiPrimaryPhotoUrl(matchedPoi.id, matchedPoi.nome, matchedPoi.imagemUrl) || defaultPoiImages[matchedPoi.tipo]
            : null,
          linkedPoiName: matchedPoi?.nome ?? null,
          speakers: session.speakers,
        };
      }),
    [agendaSessionsForSelectedDay, effectiveAdminAgendaPoiLinks, favoriteAgendaIds, pois],
  );
  const autoVisiblePois = useMemo(() => {
    return orderedByAccessPois.filter((poi) => enabledTypes[poi.tipo]).slice(0, getPoiAutoVisibleLimit());
  }, [orderedByAccessPois, enabledTypes]);

  const visiblePois = useMemo(() => {
    if (isAdmin) return pois;

    if (arePinsHiddenByZoom) {
      return [];
    }

    const manualSelectionSet = new Set(effectiveManualVisiblePoiIds);
    const basePois =
      effectiveManualVisiblePoiIds.length > 0
        ? publicPois.filter((poi) => manualSelectionSet.has(poi.id) && enabledTypes[poi.tipo])
        : autoVisiblePois;

    const resultById = new Map(basePois.map((poi) => [poi.id, poi]));
    [activePoiId, selectedDestinationId].forEach((id) => {
      if (!id) return;
      const poi = publicPois.find((item) => item.id === id);
      if (poi) resultById.set(poi.id, poi);
    });

    return Array.from(resultById.values());
  }, [
    isAdmin,
    pois,
    publicPois,
    effectiveManualVisiblePoiIds,
    enabledTypes,
    autoVisiblePois,
    arePinsHiddenByZoom,
    activePoiId,
    selectedDestinationId,
  ]);

  const getPoiById = useCallback((id: string) => pois.find((poi) => poi.id === id), [pois]);
  const selectedOriginPoi = useMemo(
    () => (selectedOriginId ? pois.find((poi) => poi.id === selectedOriginId) ?? null : null),
    [selectedOriginId, pois],
  );
  const selectedDestinationPoi = useMemo(
    () => (selectedDestinationId ? pois.find((poi) => poi.id === selectedDestinationId) ?? null : null),
    [selectedDestinationId, pois],
  );
  const manualOriginNearbyPois = useMemo(() => {
    const routeReadyPois = publicPois.filter((poi) => poi.id !== selectedDestinationId && (FREE_WALK_NAVIGATION_ENABLED || poi.nodeId));
    const candidatePois = routeReadyPois.length > 0 ? routeReadyPois : publicPois.filter((poi) => poi.id !== selectedDestinationId);

    if (candidatePois.length === 0) return [];

    const sortedPois = selectedDestinationPoi
      ? [...candidatePois].sort((left, right) => {
          const leftDistance = getImagePointDistance(
            { x: left.x, y: left.y },
            { x: selectedDestinationPoi.x, y: selectedDestinationPoi.y },
          );
          const rightDistance = getImagePointDistance(
            { x: right.x, y: right.y },
            { x: selectedDestinationPoi.x, y: selectedDestinationPoi.y },
          );

          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
          return left.nome.localeCompare(right.nome);
        })
      : [...candidatePois].sort((left, right) => left.nome.localeCompare(right.nome));

    return sortedPois.slice(0, 5).map((poi) => ({
      id: poi.id,
      nome: poi.nome,
      tipoLabel: poiTypeSingularLabels[poi.tipo],
    }));
  }, [getImagePointDistance, publicPois, selectedDestinationId, selectedDestinationPoi]);
  const manualMapOriginNearestPoi = useMemo(
    () =>
      manualMapOrigin?.nearestPoiId ? publicPois.find((poi) => poi.id === manualMapOrigin.nearestPoiId) ?? null : null,
    [manualMapOrigin, publicPois],
  );
  const manualMapOriginMarkerPosition = useMemo<[number, number] | null>(
    () =>
      manualMapOrigin
        ? imageToLatLng(manualMapOrigin.x, manualMapOrigin.y)
        : selectedOriginPoi
          ? imageToLatLng(selectedOriginPoi.x, selectedOriginPoi.y)
          : null,
    [manualMapOrigin, selectedOriginPoi],
  );
  const manualOriginMarkerLabel = manualMapOrigin ? 'Origem escolhida no mapa' : 'Voce esta aqui';
  const draftPoiIdSet = useMemo(() => new Set(draftPoiIds), [draftPoiIds]);
  const filteredAdminPois = useMemo(() => {
    const normalizedQuery = normalizeForSearch(adminSearchTerm);

    return pois
      .filter((poi) => {
        if (adminTypeFilter !== 'todos' && poi.tipo !== adminTypeFilter) return false;
        if (!normalizedQuery) return true;
        return getPoiSearchTerms(poi).some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term));
      })
      .sort((left, right) => {
        const leftIsDraft = draftPoiIdSet.has(left.id);
        const rightIsDraft = draftPoiIdSet.has(right.id);
        if (leftIsDraft !== rightIsDraft) return leftIsDraft ? -1 : 1;
        return left.nome.localeCompare(right.nome);
      });
  }, [adminSearchTerm, adminTypeFilter, draftPoiIdSet, pois]);
  const adminAgendaPoiLinkRows = useMemo(
    () =>
      [...agendaSessions]
        .sort(compareAgendaSessions)
        .map((session) => ({
          sessionId: session.id,
          title: session.title,
          venue: session.venue,
          overridePoiId: effectiveAdminAgendaPoiLinks[session.id] ?? null,
          resolvedPoiName: resolveAgendaSessionPoi(session, pois, effectiveAdminAgendaPoiLinks)?.nome ?? null,
        })),
    [effectiveAdminAgendaPoiLinks, pois],
  );
  const adminAgendaPoiLinkOptions = useMemo(
    () =>
      [...pois]
        .sort((left, right) => left.nome.localeCompare(right.nome))
        .map((poi) => ({
          id: poi.id,
          nome: poi.nome,
          isPubliclyHidden: PUBLICLY_HIDDEN_POI_IDS.has(poi.id),
        })),
    [pois],
  );
  const disconnectedPoiCount = useMemo(
    () => (FREE_WALK_NAVIGATION_ENABLED ? 0 : pois.filter((poi) => !poi.nodeId).length),
    [pois],
  );

  const hasPoiManualRouteOrigin = Boolean(selectedOriginPoi);
  const hasManualMapRouteOrigin = Boolean(manualMapOrigin);
  const hasManualRouteOrigin = hasPoiManualRouteOrigin || hasManualMapRouteOrigin;
  const isManualOriginFallbackRequired = isManualOriginRequired && !hasManualRouteOrigin;
  const routeOriginSummaryName = hasManualRouteOrigin ? 'Origem confirmada' : 'Escolha sua origem';
  const routeOriginSummaryHelp = hasManualRouteOrigin
    ? 'Voce pode gerar outra rota, alterar seu local atual ou cancelar a navegacao a qualquer momento.'
    : 'Escolha um ponto principal ou toque perto de um corredor branco para iniciar a rota.';
  const routeMarkerPosition = walkerPosition;
  const getManualOriginRequiredMessage = useCallback((destinationName?: string | null) => {
    if (destinationName) {
      return `Para ir ate ${destinationName}, primeiro escolha onde voce esta no mapa ou pelos pontos principais.`;
    }
    return 'Primeiro escolha onde voce esta no mapa ou pelos pontos principais para gerar a rota.';
  }, []);
  const activeRouteOriginSummaryName = hasPoiManualRouteOrigin
    ? selectedOriginPoi?.nome ?? 'Origem de teste'
    : hasManualMapRouteOrigin
      ? manualMapOriginNearestPoi
        ? `Ponto escolhido perto de ${manualMapOriginNearestPoi.nome}`
        : manualMapOrigin?.label ?? 'Origem manual no mapa'
      : isManualOriginFallbackRequired
        ? 'Confirme onde voce esta'
        : routeOriginSummaryName;
  const activeRouteOriginSummaryHelp = hasPoiManualRouteOrigin
    ? 'Origem escolhida pelos pontos principais. A rota vai sair deste local ate o destino atual.'
    : hasManualMapRouteOrigin
      ? 'Origem escolhida no mapa. Toque novamente perto de um corredor branco para reposicionar sua saida.'
      : isManualOriginFallbackRequired
        ? getManualOriginRequiredMessage(selectedDestinationPoi?.nome ?? null)
        : routeOriginSummaryHelp;
  const activeRouteMetricLabel = hasManualRouteOrigin ? 'Modo' : 'Progresso';
  const activeRouteMetricValue = hasPoiManualRouteOrigin
    ? 'Ponto principal'
    : hasManualMapRouteOrigin
      ? 'Origem no mapa'
      : `${Math.round(walkerProgress * 100)}%`;
  const {
    clearManualRouteOrigin,
    clearRoute,
    selectDestinationPoi,
    selectOriginPoi,
    selectManualMapOrigin,
    navigateToPoi,
  } = useRouteNavigation({
    pois,
    selectedOriginId,
    setSelectedOriginId,
    manualMapOrigin,
    setManualMapOrigin,
    setOriginQuery,
    setShowOriginSuggestions,
    selectedDestinationId,
    setSelectedDestinationId,
    setDestinationQuery,
    setShowDestinationSuggestions,
    setRota,
    setIsRouteViewportSettled,
    setShouldAnimateRouteReveal,
    setRouteRevealProgress,
    setRouteMessage,
    setWalkerPosition,
    setWalkerProgress,
    routeRevealFrameRef,
    walkerTimerRef,
    getPoiById,
    imageToLatLng,
    getPathDistanceMeters,
    formatDistanceLabel,
    formatWalkingTimeLabel,
    getImagePointDistance,
    requireManualOriginConfirmation: isManualOriginFallbackRequired,
    onPlayRouteSound: () => playUiSound('route'),
    onNavigateToPoiStart: closeDockPanel,
    onRequireManualOrigin: (poi) => {
      closeDockPanel();
      setExpandedPopupPoiId(null);
      setActivePoiId(null);
      setManualOriginPickerMode('fallback');
      setIsManualOriginPickerOpen(true);
      setIsManualOriginRequired(true);
      setRouteMessage(getManualOriginRequiredMessage(poi.nome));
    },
    routeLatLngPoints,
    routeDistanceMeters,
    isRouteRevealComplete,
    isRouteViewportSettled,
    shouldAnimateRouteReveal,
    prefersReducedMotion,
    isPresentationMode,
    getPointAlongPath,
    getAdaptiveAnimationDuration,
    easeInOutCubic,
    freeWalkNavigationEnabled: FREE_WALK_NAVIGATION_ENABLED,
    config: {
      averageWalkingSpeedMps: AVERAGE_WALKING_SPEED_MPS,
      routeRevealMinDurationMs: ROUTE_REVEAL_MIN_DURATION_MS,
      routeRevealMaxDurationMs: ROUTE_REVEAL_MAX_DURATION_MS,
      routeRevealMsPerMeter: ROUTE_REVEAL_MS_PER_METER,
      presentationWalkerMinDurationMs: PRESENTATION_WALKER_MIN_DURATION_MS,
      presentationWalkerMaxDurationMs: PRESENTATION_WALKER_MAX_DURATION_MS,
      presentationWalkerMsPerMeter: PRESENTATION_WALKER_MS_PER_METER,
      walkerProgressUpdateMs: WALKER_PROGRESS_UPDATE_MS,
      routeAutoExpireMs: ROUTE_AUTO_EXPIRE_MS,
    },
  });
  const selectedDestinationSupportsGuidedRoute = Boolean(
    selectedDestinationPoi &&
      (FREE_WALK_NAVIGATION_ENABLED ||
        resolveRoutableNodeId(
          selectedDestinationPoi.x,
          selectedDestinationPoi.y,
          selectedDestinationPoi.nodeId ?? null,
          120,
          120,
        )),
  );
  const manualOriginOverlayStatusMessage = manualOriginPickerMode === 'reposition' ? routeMessage : null;
  const openManualOriginPicker = useCallback(
    (mode: 'fallback' | 'reposition' = 'reposition', message?: string) => {
      closeDockPanel();
      setExpandedPopupPoiId(null);
      setActivePoiId(null);
      setManualOriginPickerMode(mode);
      setIsManualOriginPickerOpen(true);
      if (message) {
        setRouteMessage(message);
      }
    },
    [closeDockPanel],
  );
  const handleChangeRouteOrigin = useCallback(() => {
    clearManualRouteOrigin();
    setIsManualOriginRequired(true);
    openManualOriginPicker('reposition', 'Toque em outro corredor ou perto de um pin para mudar sua origem.');
  }, [clearManualRouteOrigin, openManualOriginPicker]);
  const handleRouteOriginSuggestionSelect = useCallback(
    (poi: PointData) => {
      setIsManualOriginRequired(false);
      setIsManualOriginPickerOpen(false);
      setManualOriginPickerMode(null);
      selectOriginPoi(poi);
    },
    [selectOriginPoi],
  );
  const handleNearbyManualOriginSelect = useCallback(
    (poiId: string) => {
      const selectedPoi = publicPois.find((poi) => poi.id === poiId);
      if (!selectedPoi) return;

      setIsManualOriginRequired(false);
      setIsManualOriginPickerOpen(false);
      setManualOriginPickerMode(null);
      selectOriginPoi(selectedPoi);
    },
    [publicPois, selectOriginPoi],
  );

  const handlePublicMapClick = useCallback(
    (point: { lat: number; lng: number; x: number; y: number }) => {
      setActivePoiId(null);
      setExpandedPopupPoiId(null);

      if (!isManualOriginPickerOpen) return;

      let nearestPoi: PointData | null = null;
      let nearestDistance = Infinity;

      for (const poi of publicPois) {
        const distance = getImagePointDistance({ x: point.x, y: point.y }, { x: poi.x, y: poi.y });
        if (distance < nearestDistance && distance <= MANUAL_ROUTE_ORIGIN_POI_MAX_DISTANCE) {
          nearestDistance = distance;
          nearestPoi = poi;
        }
      }

      if (!isPointInsidePolygon({ x: point.x, y: point.y }, EVENT_BOUNDARY_IMAGE_POINTS)) {
        setRouteMessage('Toque dentro da area util do evento para iniciar a rota.');
        return;
      }

      const resolvedNodeId = resolveRoutableNodeId(point.x, point.y, nearestPoi?.nodeId ?? null, 120, 60);
      const isManualOriginAllowed = Boolean(resolvedNodeId || nearestPoi);

      if (!isManualOriginAllowed) {
        setRouteMessage('Nao encontramos um corredor valido no mapa para iniciar a rota a partir desse toque.');
        return;
      }

      setIsManualOriginRequired(false);
      setIsManualOriginPickerOpen(false);
      setManualOriginPickerMode(null);
      selectManualMapOrigin({
        id: 'manual_map_origin',
        label: nearestPoi ? `Ponto escolhido perto de ${nearestPoi.nome}` : 'Ponto escolhido no mapa',
        x: point.x,
        y: point.y,
        lat: point.lat,
        lng: point.lng,
        snappedNodeId: resolvedNodeId,
        nearestPoiId: nearestPoi?.id ?? null,
      });
    },
    [getImagePointDistance, isManualOriginPickerOpen, publicPois, selectManualMapOrigin],
  );

  useEffect(() => {
    if (selectedOriginId || manualMapOrigin || !selectedDestinationId || !selectedDestinationSupportsGuidedRoute) {
      setIsManualOriginRequired(false);
    }
  }, [manualMapOrigin, selectedDestinationId, selectedDestinationSupportsGuidedRoute, selectedOriginId]);

  const registerPoiAccess = (poiId: string) => {
    setPoiAccessCount((prev) => ({
      ...prev,
      [poiId]: (prev[poiId] ?? 0) + 1,
    }));
  };

  const focusPoi = useCallback((poi: PointData, registerAccess = true, options?: { moveCamera?: boolean }) => {
    if (registerAccess) registerPoiAccess(poi.id);
    if (isMobile) closeDockPanel();
    setActivePoiId(poi.id);
    if (options?.moveCamera === false) return;
    setFocusPoint(poi);
  }, [isMobile, closeDockPanel]);

  const handlePoiListView = useCallback((poi: PointData) => {
    focusPoi(poi, true);
    closeDockPanel();
  }, [focusPoi, closeDockPanel]);

  const handlePoiListNavigate = useCallback((poi: PointData) => {
    focusPoi(poi, true);
    navigateToPoi(poi);
    closeDockPanel();
  }, [focusPoi, navigateToPoi, closeDockPanel]);

  const handleSetPoiAsCurrentLocation = useCallback(
    (poi: PointData) => {
      focusPoi(poi, true, { moveCamera: false });
      setIsManualOriginRequired(false);
      setIsManualOriginPickerOpen(false);
      setManualOriginPickerMode(null);
      selectOriginPoi(poi);
      closeDockPanel();
    },
    [closeDockPanel, focusPoi, selectOriginPoi],
  );

  const getAgendaSessionPoi = (session: AgendaSession) => {
    return resolveAgendaSessionPoi(session, pois, effectiveAdminAgendaPoiLinks);
  };

  const handleAgendaSessionFocus = (session: AgendaSession) => {
    const matchedPoi = getAgendaSessionPoi(session);
    if (!matchedPoi) return;
    focusPoi(matchedPoi, true);
    closeDockPanel();
  };
  const handleAgendaSessionFocusById = (sessionId: string) => {
    const session = agendaSessions.find((item) => item.id === sessionId);
    if (!session) return;
    handleAgendaSessionFocus(session);
  };

  const toggleAgendaFavorite = (sessionId: string) => {
    setFavoriteAgendaIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    );
  };

  const handleMarkerSelection = useCallback((poi: PointData) => {
    if (isAdmin) {
      setEditingPoi({ ...poi });
      setFocusPoint(poi);
      return;
    }

    focusPoi(poi, true);
  }, [isAdmin, focusPoi]);

  const toggleType = (type: PoiType) => {
    setEnabledTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const {
    updatePoiPosition,
    salvarLocalizacaoAtual,
    updateEditingPoiCoordinates,
    handleAdminMapPointPick,
    startNewPoiDraft,
    salvarRascunhoPonto,
    abrirImportadorJson,
    handleAdminImportFileChange,
    restaurarFontePrincipal,
    salvarPonto,
    deletarPonto,
    toggleManualVisibility,
    baixarJson,
    baixarLogCompleto,
    copiarLogCompleto,
    handleSetAdminAgendaPoiLink,
    handleResetAdminAgendaPoiLinks,
  } = usePoiAdmin({
    isAdmin,
    editingPoi,
    setEditingPoi,
    focusPoint,
    setFocusPoint,
    activePoiId,
    setActivePoiId,
    selectedDestinationId,
    clearRoute,
    pois,
    setPois,
    draftPoiIds,
    setDraftPoiIds,
    setManualVisiblePoiIds,
    setPoiDataSource,
    setAdminStatusMessage,
    setPoiAccessCount,
    adminImportInputRef,
    effectiveAdminAgendaPoiLinks,
    setAdminAgendaPoiLinks,
    latLngToImageOverlay,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    freeWalkNavigationEnabled: FREE_WALK_NAVIGATION_ENABLED,
    findNearestNodeFn: findNearestNode,
    parseStoredPoiImport,
    loadPoiRuntimeBackup,
    getFrontSeedPois,
    clearAdminWorkspaceSnapshot,
    eventName: EVENT_NAME,
    exportFileName: POI_DATA_EXPORT_FILENAME,
    currentMapBuildLabel: CURRENT_MAP_BUILD_LABEL,
  });

  useEffect(() => {
    setOfficialMapSurfaceUrls([...new Set([...OFFICIAL_MAP_SURFACE_URLS, ...OFFICIAL_MAP_FOREGROUND_SURFACE_URLS])]);
  }, []);

  useEffect(() => {
    closeDockPanel();
  }, [closeDockPanel, isMobile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (manualOriginFallbackTimerRef.current !== null) {
      window.clearTimeout(manualOriginFallbackTimerRef.current);
      manualOriginFallbackTimerRef.current = null;
    }

    const shouldPromptManualOrigin =
      !isAdmin &&
      selectedDestinationSupportsGuidedRoute &&
      !selectedOriginId &&
      !manualMapOrigin &&
      !isManualOriginRequired &&
      routeLatLngPoints.length <= 1;

    if (!shouldPromptManualOrigin) {
      if (manualOriginPickerMode === 'reposition' && isManualOriginPickerOpen) {
        return;
      }

      if (!selectedDestinationId || !selectedDestinationSupportsGuidedRoute || routeLatLngPoints.length > 1 || selectedOriginId || manualMapOrigin) {
        setIsManualOriginPickerOpen(false);
        setManualOriginPickerMode(null);
      }
      return;
    }

    manualOriginFallbackTimerRef.current = window.setTimeout(() => {
      setManualOriginPickerMode('fallback');
      setIsManualOriginPickerOpen(true);
      setIsManualOriginRequired(true);
      setRota(null);
      setRouteMessage(getManualOriginRequiredMessage(selectedDestinationPoi?.nome ?? null));
    }, MANUAL_ROUTE_FALLBACK_TIMEOUT_MS);

    return () => {
      if (manualOriginFallbackTimerRef.current !== null) {
        window.clearTimeout(manualOriginFallbackTimerRef.current);
        manualOriginFallbackTimerRef.current = null;
      }
    };
  }, [
    isAdmin,
    isManualOriginRequired,
    manualMapOrigin,
    manualOriginPickerMode,
    routeLatLngPoints.length,
    selectedDestinationPoi?.nome,
    selectedDestinationId,
    selectedDestinationSupportsGuidedRoute,
    selectedOriginId,
    getManualOriginRequiredMessage,
    setRota,
    setRouteMessage,
    isManualOriginPickerOpen,
  ]);



  useEffect(() => {
    persistPoiAccessCount(poiAccessCount);
  }, [poiAccessCount]);

  useEffect(() => {
    if (poiDataSource !== 'local-workspace' && draftPoiIds.length === 0) {
      clearAdminWorkspaceSnapshot();
      return;
    }

    persistAdminWorkspaceSnapshot({
      pois,
      draftPoiIds,
      updatedAt: new Date().toISOString(),
    });
  }, [draftPoiIds, poiDataSource, pois]);

  useEffect(() => {
    persistAdminAgendaPoiLinks(effectiveAdminAgendaPoiLinks);
  }, [effectiveAdminAgendaPoiLinks]);

  useEffect(() => {
    if (activePoiId && !pois.some((poi) => poi.id === activePoiId)) {
      setActivePoiId(null);
    }
  }, [activePoiId, pois]);




  useEffect(() => {
    setExpandedPopupPoiId(null);
  }, [activePoiId]);

  const poiPinScaleTier = getPoiPinScaleTier(mapZoomLevel, mapZoomRange.min, isMobile);
  const poiPinSizes = getPoiPinSizes(isMobile);
  const getMarkerIcon = useCallback((poi: PointData, isActive: boolean) => {
    if (!isAdmin && poi.id === selectedDestinationId) {
      return getPoiIcon(poi, poiPinScaleTier, poiPinSizes, true);
    }
    if (!isAdmin && isActive) {
      return getPoiIcon(poi, poiPinScaleTier, poiPinSizes, true);
    }
    return getPoiIcon(poi, poiPinScaleTier, poiPinSizes, false);
  }, [isAdmin, selectedDestinationId, poiPinScaleTier, poiPinSizes]);
  const mapOverlayOpacity = 1;
  const logicalMapOverlayOpacity = isLogicalMapCompareOpen ? 0.78 : isManualOriginPickerOpen ? 0.2 : 0;
  const logicalMapOverlayClassName = isLogicalMapCompareOpen ? 'map-logic-compare-overlay' : 'map-logic-route-overlay';
  const logicalMapOverlayZIndex = 20 + officialMapSurfaceUrls.length;
  const resolvedDefaultZoom = 17;
  const popupSizePreset = getPoiPreviewSizeLimits(isMobile, viewportWidth, viewportHeight, poiPinScaleTier);
  const currentTutorialStep = tutorialSteps[tutorialStepIndex] ?? null;
  const dockWidth = isMobile
    ? '100vw'
    : isCompactViewport
      ? 'min(520px, calc(100vw - 24px))'
      : 'min(560px, calc(100vw - 48px))';
  const dockBottom = isMobile ? 0 : 22;
  const activeDockSheetHeight =
    activeDockPanel && viewportHeight > 0 ? Math.round(viewportHeight * dockPanelHeights[activeDockPanel]) : 0;
  const adminDenseButtonStyle: CSSProperties = {
    ...actionButton,
    minHeight: 34,
    padding: '8px 10px',
    borderRadius: '7px',
    fontSize: 12,
    lineHeight: 1.15,
  };
  const adminDenseInputStyle: CSSProperties = {
    ...inputStyle,
    padding: '7px 9px',
    marginTop: '3px',
    marginBottom: '8px',
    borderRadius: '7px',
    fontSize: 13,
  };
  const editingAccentColorPreview =
    (editingPoi?.corDestaque && isBrandPaletteColor(editingPoi.corDestaque) && normalizeHexColor(editingPoi.corDestaque)) ||
    BRAND_COLORS.primary;
  const hasInvalidEditingAccentColor = Boolean(
    editingPoi?.corDestaque?.trim() && !isBrandPaletteColor(editingPoi.corDestaque),
  );
  const editingBadgePreview =
    normalizeBadgeText(editingPoi?.selo) ?? editingPoi?.nome?.trim().charAt(0).toUpperCase() ?? 'P';
  const sourceMetaMap: Record<PoiDataSource, { label: string; tint: string; tone: string }> = {
    'local-workspace': {
      label: 'Fonte ativa: edição local',
      tint: 'rgba(217, 200, 255, 0.24)',
      tone: BRAND_COLORS.ink,
    },
    'local-backup': {
      label: 'Fonte ativa: backup local',
      tint: 'rgba(45, 35, 61, 0.12)',
      tone: BRAND_COLORS.ink,
    },
    'front-seed': {
      label: 'Fonte ativa: base local do aplicativo',
      tint: 'rgba(239, 232, 255, 0.92)',
      tone: BRAND_COLORS.primaryStrong,
    },
  };
  const currentSourceMeta = sourceMetaMap[poiDataSource];
  const editingPoiIsDraft = Boolean(editingPoi?.id && draftPoiIdSet.has(editingPoi.id));
  const getPoiRelatedSessions = useCallback(
    (poi: PointData) =>
      agendaSessions.filter((session) => sessionMatchesPoi(session, poi, effectiveAdminAgendaPoiLinks)).slice(0, 3),
    [effectiveAdminAgendaPoiLinks],
  );
  const closeTutorial = useCallback(() => {
    setIsTutorialOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    }
  }, []);
  const handleNextTutorialStep = useCallback(() => {
    setTutorialStepIndex((current) => {
      if (current >= tutorialSteps.length - 1) {
        closeTutorial();
        return current;
      }

      return current + 1;
    });
  }, [closeTutorial]);
  const safeViewportWidth = viewportWidth > 0 ? viewportWidth : 1280;
  const safeViewportHeight = viewportHeight > 0 ? viewportHeight : 900;
  const adminPanelFloatingWidth =
    safeViewportWidth <= 320 ? safeViewportWidth - 12 : Math.min(isCompactViewport ? 360 : 400, safeViewportWidth - 24);
  const adminPanelFloatingHeight =
    safeViewportHeight <= 520
      ? safeViewportHeight - 20
      : Math.min(Math.round(safeViewportHeight * (isMobile ? 0.9 : 0.84)), safeViewportHeight - 40);
  const clampAdminPanelPosition = useCallback(
    (position: { x: number; y: number }) => {
      const marginX = 12;
      const minY = 72;
      const maxX = Math.max(marginX, safeViewportWidth - adminPanelFloatingWidth - marginX);
      const maxY = Math.max(minY, safeViewportHeight - adminPanelFloatingHeight - 18);

      return {
        x: Math.min(Math.max(marginX, Math.round(position.x)), maxX),
        y: Math.min(Math.max(minY, Math.round(position.y)), maxY),
      };
    },
    [adminPanelFloatingHeight, adminPanelFloatingWidth, safeViewportHeight, safeViewportWidth],
  );
  const handleCloseAdminMode = useCallback(() => {
    adminPanelDragStateRef.current = null;
    setIsAdminPanelDragging(false);
    setIsPinsSummaryOpen(false);
    setIsAdmin(false);
    setEditingPoi(null);
  }, []);
  const handleAdminPanelDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isAdmin) return;
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      suppressNextAdminMapClick(240);
      adminPanelDragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: adminPanelPosition.x,
        originY: adminPanelPosition.y,
      };
      setIsAdminPanelDragging(true);
    },
    [adminPanelPosition.x, adminPanelPosition.y, isAdmin, suppressNextAdminMapClick],
  );

  useEffect(() => {
    if (!isAdmin) {
      adminPanelDragStateRef.current = null;
      setIsAdminPanelDragging(false);
      setIsPinsSummaryOpen(false);
      return;
    }

    setAdminPanelPosition((current) => {
      const next = clampAdminPanelPosition(current);
      return current.x === next.x && current.y === next.y ? current : next;
    });
  }, [clampAdminPanelPosition, isAdmin]);

  useEffect(() => {
    if (!isAdminPanelDragging || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent) => {
      const currentDrag = adminPanelDragStateRef.current;
      if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;

      setAdminPanelPosition(
        clampAdminPanelPosition({
          x: currentDrag.originX + (event.clientX - currentDrag.startX),
          y: currentDrag.originY + (event.clientY - currentDrag.startY),
        }),
      );
    };

    const handlePointerFinish = (event: PointerEvent) => {
      const currentDrag = adminPanelDragStateRef.current;
      if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;

      adminPanelDragStateRef.current = null;
      setIsAdminPanelDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerFinish);
    window.addEventListener('pointercancel', handlePointerFinish);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerFinish);
      window.removeEventListener('pointercancel', handlePointerFinish);
    };
  }, [clampAdminPanelPosition, isAdminPanelDragging]);
  return (
    <div
      onPointerDownCapture={handleRootPointerDownCapture}
      onPointerMoveCapture={handleRootPointerMoveCapture}
      onPointerUpCapture={handleRootPointerUpCapture}
      onPointerCancelCapture={handleRootPointerCancelCapture}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100dvh',
        position: 'relative',
        display: 'flex',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {isAdmin && (
          <button
            type='button'
            onClick={() => setIsPinsSummaryOpen((current) => !current)}
            className='btn btn-neutral'
            style={{
              ...adminDenseButtonStyle,
              position: 'fixed',
              top: 16,
              left: 16,
              zIndex: 3400,
              minWidth: 184,
              minHeight: 42,
              padding: '10px 14px',
              borderRadius: 14,
              boxShadow: '0 18px 38px rgba(15, 23, 42, 0.18)',
              backdropFilter: 'blur(12px)',
              background: 'rgba(255, 255, 255, 0.94)',
              border: '1px solid rgba(196, 207, 222, 0.95)',
            }}
          >
            {isPinsSummaryOpen ? 'Fechar lista dos pins' : 'Ver lista dos pins'}
          </button>
        )}

        {isAdmin && (
          <button
            type='button'
            onClick={() => setIsLogicalMapCompareOpen((current) => !current)}
            className='btn btn-neutral'
            style={{
              ...adminDenseButtonStyle,
              position: 'fixed',
              top: 68,
              left: 16,
              zIndex: 3400,
              minWidth: 208,
              minHeight: 42,
              padding: '10px 14px',
              borderRadius: 14,
              boxShadow: '0 18px 38px rgba(15, 23, 42, 0.18)',
              backdropFilter: 'blur(12px)',
              background: isLogicalMapCompareOpen ? 'rgba(92, 51, 173, 0.92)' : 'rgba(255, 255, 255, 0.94)',
              color: isLogicalMapCompareOpen ? '#ffffff' : undefined,
              border: isLogicalMapCompareOpen
                ? '1px solid rgba(92, 51, 173, 0.98)'
                : '1px solid rgba(196, 207, 222, 0.95)',
            }}
          >
            {isLogicalMapCompareOpen ? 'Fechar comparacao logica' : 'Comparar logica com oficial'}
          </button>
        )}

        {isAdmin && isLogicalMapCompareOpen && (
          <div
            style={{
              position: 'fixed',
              top: 120,
              left: 16,
              zIndex: 3400,
              maxWidth: 280,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'rgba(31, 20, 58, 0.88)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              boxShadow: '0 16px 32px rgba(15, 23, 42, 0.24)',
              backdropFilter: 'blur(12px)',
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            Base de rota: `logica_nova.png`
            <br />
            Base visual: `mapa_geral.webp`
          </div>
        )}

        {isAdmin && (
          <div
            style={{
              position: 'absolute',
              left: adminPanelPosition.x,
              top: adminPanelPosition.y,
              width: adminPanelFloatingWidth,
              height: adminPanelFloatingHeight,
              maxWidth: 'calc(100% - 24px)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 24,
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid rgba(205, 214, 228, 0.96)',
              boxShadow: '0 30px 80px rgba(17, 24, 39, 0.24)',
              backdropFilter: 'blur(16px)',
              zIndex: 2100,
              fontSize: 13,
            }}
            className='map-floating-panel'
          >
            <div
              onPointerDown={handleAdminPanelDragPointerDown}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                background: 'linear-gradient(135deg, rgba(20, 25, 40, 0.96), rgba(51, 36, 99, 0.92))',
                color: '#ffffff',
                cursor: isAdminPanelDragging ? 'grabbing' : 'grab',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>Painel admin</div>
                <div style={{ fontSize: 11, opacity: 0.78 }}>
                  Arraste esta barra para reposicionar e revisar os pins com mais conforto.
                </div>
              </div>
              <div
                aria-hidden='true'
                style={{
                  width: 42,
                  height: 28,
                  borderRadius: 999,
                  background: 'rgba(255, 255, 255, 0.14)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  letterSpacing: '0.12em',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                ::
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(244, 247, 252, 0.96))',
              }}
            >
              <MapAdminPanel
                adminImportInputRef={adminImportInputRef}
                onImportFileChange={handleAdminImportFileChange}
                isPinsSummaryOpen={isPinsSummaryOpen}
                onClosePinsSummary={() => setIsPinsSummaryOpen(false)}
                freeWalkNavigationEnabled={FREE_WALK_NAVIGATION_ENABLED}
                currentSourceMeta={currentSourceMeta}
                currentMapBuildLabel={CURRENT_MAP_BUILD_LABEL}
                poisCount={pois.length}
                draftPoiCount={draftPoiIds.length}
                disconnectedPoiCount={disconnectedPoiCount}
                onStartNewPoiDraft={startNewPoiDraft}
                onOpenJsonImporter={abrirImportadorJson}
                adminDenseButtonStyle={adminDenseButtonStyle}
                adminDenseInputStyle={adminDenseInputStyle}
                adminSearchTerm={adminSearchTerm}
                onAdminSearchTermChange={setAdminSearchTerm}
                adminTypeFilter={adminTypeFilter}
                onAdminTypeFilterChange={setAdminTypeFilter}
                adminStatusMessage={adminStatusMessage}
                adminAgendaPoiLinks={adminAgendaPoiLinkRows}
                adminAgendaPoiLinkOptions={adminAgendaPoiLinkOptions}
                onSetAgendaPoiLink={handleSetAdminAgendaPoiLink}
                onResetAgendaPoiLinks={handleResetAdminAgendaPoiLinks}
                allAdminPois={pois}
                filteredAdminPois={filteredAdminPois}
                draftPoiIdSet={draftPoiIdSet}
                editingPoiId={editingPoi?.id ?? null}
                getPoiAccentColor={getPoiAccentColor}
                getPoiBadgeText={getPoiBadgeText}
                onSelectPoi={(poi) => {
                  setEditingPoi({ ...poi });
                  setFocusPoint(poi);
                  setActivePoiId(poi.id);
                }}
                onRestorePrimarySource={restaurarFontePrincipal}
                onDownloadJson={baixarJson}
                onDownloadLog={baixarLogCompleto}
                onCopyLog={copiarLogCompleto}
                onExitAdmin={handleCloseAdminMode}
              />
            </div>
          </div>
        )}

        <MapAdminEditor
          isOpen={isAdmin && Boolean(editingPoi)}
          editingPoi={editingPoi}
          editingPoiIsDraft={editingPoiIsDraft}
          freeWalkNavigationEnabled={FREE_WALK_NAVIGATION_ENABLED}
          brandColors={{
            ink: BRAND_COLORS.ink,
            primaryStrong: BRAND_COLORS.primaryStrong,
            textMuted: BRAND_COLORS.textMuted,
            primary: BRAND_COLORS.primary,
          }}
          editingAccentColorPreview={editingAccentColorPreview}
          editingBadgePreview={editingBadgePreview}
          hasInvalidEditingAccentColor={hasInvalidEditingAccentColor}
          setEditingPoi={setEditingPoi}
          mapWidth={MAP_WIDTH}
          mapHeight={MAP_HEIGHT}
          adminDenseInputStyle={adminDenseInputStyle}
          adminDenseButtonStyle={adminDenseButtonStyle}
          onPositionInputChange={updateEditingPoiCoordinates}
          onSaveLocation={salvarLocalizacaoAtual}
          onSaveDraft={salvarRascunhoPonto}
          onSavePoi={salvarPonto}
          onDeletePoi={deletarPonto}
          onClose={() => setEditingPoi(null)}
        />

        {!isAdmin && (
          <>
            <MapHeader logoSrc={brandIcon} logoScale={BRAND_LOGO_SCALE} />
            {hasManualMapRouteOrigin && (
              <div className='map-origin-quick-actions'>
                <button
                  type='button'
                  onClick={handleChangeRouteOrigin}
                  className='map-origin-quick-action map-origin-quick-action-primary'
                >
                  Mudar localizacao
                </button>
                <button
                  type='button'
                  onClick={clearManualRouteOrigin}
                  className='map-origin-quick-action map-origin-quick-action-close'
                  aria-label='Cancelar localizacao atual'
                  title='Cancelar localizacao atual'
                >
                  X
                </button>
              </div>
            )}
          </>
        )}
        {!isAdmin && (
          <MapTutorialOverlay
            isOpen={isTutorialOpen}
            currentStep={currentTutorialStep}
            currentStepIndex={tutorialStepIndex}
            totalSteps={tutorialSteps.length}
            onNext={handleNextTutorialStep}
            onClose={closeTutorial}
          />
        )}

        {!isAdmin && (
          <div
            style={
              {
                position: 'fixed',
                left: '50%',
                bottom: dockBottom,
                transform: 'translateX(-50%)',
                zIndex: activeDockPanel === 'route' ? 3350 : 3200,
                width: dockWidth,
              } as CSSProperties
            }
            className={`map-surface-toolbar map-action-dock ${isDockPanelOpen ? `sheet-open panel-${activeDockPanel}` : ''}`}
          >
            <div
              ref={dockSheetBodyRef}
              className={`map-action-sheet-body ${isDockPanelOpen ? 'active' : ''} ${isDockSheetDragging ? 'dragging' : ''}`}
              style={{ '--sheet-height': `${activeDockSheetHeight}px` } as CSSProperties}
            >
              {isDockPanelOpen && (
                <div
                  className='map-sheet-drag-handle-wrap'
                  onPointerDown={handleDockSheetDragPointerDown}
                  onPointerMove={handleDockSheetDragPointerMove}
                  onPointerUp={handleDockSheetDragPointerUp}
                  onPointerCancel={handleDockSheetDragPointerCancel}
                  role='separator'
                  aria-label='Arraste para ajustar a altura do painel'
                  aria-orientation='vertical'
                >
                  <div className='map-sheet-drag-handle' />
                </div>
              )}
              <div className='map-action-sheet-scroll'>
                {activeDockPanel === 'pins' && (
                  <PinPanel
                    searchTerm={searchTerm}
                    onSearchTermChange={setSearchTerm}
                    poiTypeLabels={poiTypeLabels}
                    poiTypeSingularLabels={poiTypeSingularLabels}
                    enabledTypes={enabledTypes}
                    onToggleType={toggleType}
                    searchablePois={searchablePois}
                    manualVisiblePoiIds={effectiveManualVisiblePoiIds}
                    onResetManualVisibility={() => setManualVisiblePoiIds([])}
                    arePinsHiddenByZoom={arePinsHiddenByZoom}
                    isPresentationMode={isPresentationMode}
                    inputStyle={inputStyle}
                    getPoiAccentColor={getPoiAccentColor}
                    getPoiAccentRingColor={(accentColor) => mixColors(accentColor, '#ffffff', 0.74)}
                    onToggleManualVisibility={toggleManualVisibility}
                    onFocusPoi={(poi) => focusPoi(poi, true)}
                    onViewPoi={handlePoiListView}
                    onNavigatePoi={handlePoiListNavigate}
                  />
                )}

                {activeDockPanel === 'agenda' && (
                  <AgendaPanel
                    days={agendaDays}
                    selectedDayId={selectedAgendaDay}
                    onSelectDay={(dayId) => setSelectedAgendaDay(dayId as AgendaDayId)}
                    selectedDayMeta={selectedAgendaDayMeta}
                    stats={agendaDayStats}
                    sessions={agendaPanelSessions}
                    onToggleFavorite={toggleAgendaFavorite}
                    onOpenOnMap={handleAgendaSessionFocusById}
                  />
                )}

                {activeDockPanel === 'partners' && <PartnersPanel />}

                {activeDockPanel === 'route' && (
                  <RoutePanel
                    activeRouteOriginSummaryName={activeRouteOriginSummaryName}
                    activeRouteOriginSummaryHelp={activeRouteOriginSummaryHelp}
                    originQuery={originQuery}
                    onOriginQueryChange={(value) => {
                      if (hasManualRouteOrigin) {
                        clearManualRouteOrigin();
                      }
                      setOriginQuery(value);
                      setSelectedOriginId('');
                      setShowOriginSuggestions(true);
                    }}
                    onOriginFocus={() => setShowOriginSuggestions(true)}
                    onOriginBlur={() => window.setTimeout(() => setShowOriginSuggestions(false), 120)}
                    onOriginSuggestionSelect={handleRouteOriginSuggestionSelect}
                    originSuggestions={originSuggestions}
                    showOriginSuggestions={showOriginSuggestions}
                    destinationQuery={destinationQuery}
                    onDestinationQueryChange={(value) => {
                      setDestinationQuery(value);
                      setSelectedDestinationId('');
                      setShowDestinationSuggestions(true);
                    }}
                    onDestinationFocus={() => setShowDestinationSuggestions(true)}
                    onDestinationBlur={() => window.setTimeout(() => setShowDestinationSuggestions(false), 120)}
                    onDestinationSuggestionSelect={selectDestinationPoi}
                    destinationSuggestions={destinationSuggestions}
                    showDestinationSuggestions={showDestinationSuggestions}
                    onClearRoute={clearRoute}
                    onChangeRouteOrigin={handleChangeRouteOrigin}
                    hasManualRouteOrigin={hasManualRouteOrigin}
                    routeMessage={routeMessage}
                    routeDistanceMeters={routeDistanceMeters}
                    routeEtaMinutes={routeEtaMinutes}
                    activeRouteMetricLabel={activeRouteMetricLabel}
                    activeRouteMetricValue={activeRouteMetricValue}
                    isPresentationMode={isPresentationMode}
                    isMobile={isMobile}
                    inputStyle={inputStyle}
                    buttonStyle={actionButton}
                    formatDistanceLabel={formatDistanceLabel}
                    formatWalkingTimeLabel={formatWalkingTimeLabel}
                  />
                )}
              </div>
            </div>

            <MapDockButtons activeDockPanel={activeDockPanel} onTogglePanel={toggleDockPanel} />
            </div>
        )}
        {!isAdmin && (
          <ManualOriginFallbackOverlay
            isOpen={isManualOriginPickerOpen}
            mode={manualOriginPickerMode}
            destinationName={selectedDestinationPoi?.nome ?? null}
            statusMessage={manualOriginOverlayStatusMessage}
            nearbyPois={manualOriginNearbyPois}
            onSelectNearbyPoi={handleNearbyManualOriginSelect}
          />
        )}
          <MapContainer
            center={MAP_VIEW_CENTER}
            zoom={resolvedDefaultZoom}
            minZoom={mapZoomRange.min}
            maxZoom={mapZoomRange.max}
            maxBounds={mapViewportBounds}
            maxBoundsViscosity={OFFICIAL_MAP_BOUNDS_VISCOSITY}
            style={{ height: '100%', width: '100%', flex: 1, minWidth: 0, minHeight: 0 }}
            zoomControl={false}
            scrollWheelZoom={true}
            doubleClickZoom={true}
            touchZoom={true}
            boxZoom={false}
            keyboard={false}
            dragging={true}
            zoomSnap={0.25}
            zoomDelta={0.25}
            preferCanvas={true}
            zoomAnimation={!prefersReducedMotion}
            markerZoomAnimation={!prefersReducedMotion}
            fadeAnimation={!prefersReducedMotion}
            wheelDebounceTime={40}
            wheelPxPerZoomLevel={80}
          >
            <MapViewportBoundsController
              isMobile={isMobile}
              mapOverlayBounds={mapOverlayBounds}
              mapViewportBounds={mapViewportBounds}
              onZoomLevelChange={handleMapZoomLevelChange}
              onZoomRangeChange={handleMapZoomRangeChange}
            />
          {officialMapSurfaceUrls.map((surfaceUrl, index) => (
            <ImageOverlay
              key={surfaceUrl}
              url={surfaceUrl}
              bounds={mapOverlayBounds}
              opacity={mapOverlayOpacity}
              zIndex={20 + index}
            />
          ))}
          {logicalMapOverlayOpacity > 0 && (
            <ImageOverlay
              url={logicalMapSurfaceUrl}
              bounds={logicalMapOverlayBounds}
              opacity={logicalMapOverlayOpacity}
              zIndex={logicalMapOverlayZIndex}
              className={logicalMapOverlayClassName}
            />
          )}
          <MapInteractionEvents
            isAdmin={isAdmin}
            suppressAdminMapClickRef={suppressAdminMapClickRef}
            latLngToImageOverlay={latLngToImageOverlay}
            onPublicMapClick={handlePublicMapClick}
            onAdminMapClick={handleAdminMapPointPick}
            onZoomLevelChange={setMapZoomLevel}
          />
          <MapSizeSync />
          <MapController
            routeLatLngPoints={routeLatLngPoints}
            onRouteViewportSettledChange={setIsRouteViewportSettled}
          />

          <Pane name='route-overlay-pane' style={{ zIndex: 675, pointerEvents: 'none' }}>
            <MapRouteLayer
              routeLatLngPoints={routeLatLngPoints}
              visibleRouteLatLngPoints={visibleRouteLatLngPoints}
              isMobile={isMobile}
              isRouteViewportSettled={isRouteViewportSettled}
              isRouteRevealComplete={isRouteRevealComplete}
              routeRevealHeadPoint={routeRevealHeadPoint}
              routeShadowColor={routeShadowColor}
              routeGuideColor={routeGuideColor}
              surfaceColor={BRAND_COLORS.surface}
              primaryColor={BRAND_COLORS.primaryStrong}
              mixColors={mixColors}
            />
          </Pane>

          {!isAdmin && (
            <Pane name='route-presence-pane' style={{ zIndex: 680, pointerEvents: 'none' }}>
              <MapPresenceLayer
                manualOriginMarkerPosition={manualMapOriginMarkerPosition}
                manualOriginMarkerLabel={manualOriginMarkerLabel}
                routeLatLngPoints={routeLatLngPoints}
                routeMarkerPosition={routeMarkerPosition}
                routeRemainingEtaLabel={routeRemainingEtaLabel}
                manualOriginMarkerTone={BRAND_COLORS.highlight}
                previewMarkerTone={previewMarkerTone}
                renderPresenceMarker={renderPresenceMarker}
              />
            </Pane>
          )}

          <MapPoiLayer
            visiblePois={visiblePois}
            activePoiId={activePoiId}
            selectedOriginId={selectedOriginId}
            selectedDestinationId={selectedDestinationId}
            isAdmin={isAdmin}
            defaultPoiImages={defaultPoiImages}
            imageToLatLng={imageToLatLng}
            getMarkerIcon={getMarkerIcon}
            getPoiAccentColor={getPoiAccentColor}
            getPoiGalleryImages={getPoiGalleryImages}
            getRelatedSessions={getPoiRelatedSessions}
            eventLabel={EVENT_LABEL}
            expandedPopupPoiId={expandedPopupPoiId}
            onToggleExpandedPopup={(poiId) => setExpandedPopupPoiId((prev) => (prev === poiId ? null : poiId))}
            onPopupNavigate={(poi) => {
              focusPoi(poi, false, { moveCamera: false });
              navigateToPoi(poi);
            }}
            onPopupSetOrigin={handleSetPoiAsCurrentLocation}
            onMarkerSelect={handleMarkerSelection}
            onSuppressNextAdminMapClick={suppressNextAdminMapClick}
            onUpdatePoiPosition={updatePoiPosition}
            popupSizePreset={popupSizePreset}
            editingPoi={editingPoi}
            stateIcons={stateIcons}
          />
        </MapContainer>
        <div className='tap-feedback-layer' aria-hidden='true'>
          {tapIndicators.map((indicator) => (
            <span
              key={indicator.id}
              className='tap-indicator'
              style={{ left: indicator.x, top: indicator.y }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  marginTop: '4px',
  marginBottom: '10px',
  borderRadius: '8px',
  border: '1px solid var(--color-border-strong)',
  background: '#fbfdff',
  color: 'var(--color-text)',
  boxSizing: 'border-box',
};

const actionButton: CSSProperties = {
  flex: 1,
  border: 'none',
  padding: '10px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 700,
  fontFamily: 'inherit',
};

export default ModaCenterMap;




          

