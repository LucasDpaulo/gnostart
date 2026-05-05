import L from 'leaflet';
import type { JSX } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip } from 'react-leaflet';
import { PoiPopupCard, type PoiPopupAgendaSession } from '../routes-pins-previews/PoiPopupCard';
import type { PointData, PoiType } from '../types';
import { resolvePoiPrimaryPhotoUrl } from './poiPhotos';

export const MapRouteLayer = ({
  routeLatLngPoints,
  visibleRouteLatLngPoints,
  isMobile,
  isRouteViewportSettled,
  isRouteRevealComplete,
  routeRevealHeadPoint,
  routeGuideColor,
  surfaceColor,
  primaryColor,
  mixColors,
}: {
  routeLatLngPoints: [number, number][];
  visibleRouteLatLngPoints: [number, number][];
  isMobile: boolean;
  isRouteViewportSettled: boolean;
  isRouteRevealComplete: boolean;
  routeRevealHeadPoint: [number, number] | null;
  routeGuideColor: string;
  surfaceColor: string;
  primaryColor: string;
  mixColors: (baseHex: string, targetHex: string, weight: number) => string;
}) => {
  if (routeLatLngPoints.length <= 1) return null;

  return (
    <>
      <Polyline
        positions={visibleRouteLatLngPoints}
        pathOptions={{
          color: primaryColor,
          weight: isMobile ? 4 : 4.5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        positions={visibleRouteLatLngPoints}
        pathOptions={{
          color: routeGuideColor,
          weight: isMobile ? 1.3 : 1.5,
          opacity: 0.86,
          dashArray: isMobile ? '2 8' : '2 10',
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {isRouteViewportSettled && !isRouteRevealComplete && routeRevealHeadPoint && (
        <>
          <CircleMarker
            center={routeRevealHeadPoint}
            radius={isMobile ? 6 : 7}
            interactive={false}
            pathOptions={{
              stroke: false,
              fillColor: mixColors(primaryColor, surfaceColor, 0.18),
              fillOpacity: 0.24,
            }}
          />
          <CircleMarker
            center={routeRevealHeadPoint}
            radius={isMobile ? 3.8 : 4.2}
            interactive={false}
            pathOptions={{
              color: surfaceColor,
              weight: 2,
              fillColor: primaryColor,
              fillOpacity: 1,
            }}
          />
        </>
      )}
    </>
  );
};

export const MapPresenceLayer = ({
  manualOriginMarkerPosition,
  manualOriginMarkerLabel,
  routeLatLngPoints,
  routeMarkerPosition,
  routeRemainingEtaLabel,
  manualOriginMarkerTone,
  previewMarkerTone,
  renderPresenceMarker,
}: {
  manualOriginMarkerPosition: [number, number] | null;
  manualOriginMarkerLabel: string;
  routeLatLngPoints: [number, number][];
  routeMarkerPosition: [number, number] | null;
  routeRemainingEtaLabel: string;
  manualOriginMarkerTone: string;
  previewMarkerTone: string;
  renderPresenceMarker: (
    position: [number, number],
    options: { label: string; tone: string; accuracyMeters?: number },
  ) => JSX.Element;
}) => (
  <>
    {manualOriginMarkerPosition &&
      renderPresenceMarker(manualOriginMarkerPosition, {
        label: manualOriginMarkerLabel,
        tone: manualOriginMarkerTone,
      })}

    {routeLatLngPoints.length > 1 &&
      !manualOriginMarkerPosition &&
      routeMarkerPosition &&
      renderPresenceMarker(routeMarkerPosition, {
        label: routeRemainingEtaLabel === 'chegando' ? 'Chegando ao destino' : `Chegada em ~${routeRemainingEtaLabel}`,
        tone: previewMarkerTone,
      })}
  </>
);

export const MapPoiLayer = ({
  visiblePois,
  activePoiId,
  selectedOriginId,
  selectedDestinationId,
  isAdmin,
  defaultPoiImages,
  imageToLatLng,
  getMarkerIcon,
  getPoiAccentColor,
  getPoiGalleryImages,
  getRelatedSessions,
  eventLabel,
  expandedPopupPoiId,
  onToggleExpandedPopup,
  onPopupNavigate,
  onPopupSetOrigin,
  onMarkerSelect,
  onSuppressNextAdminMapClick,
  onUpdatePoiPosition,
  popupSizePreset,
  editingPoi,
  stateIcons,
}: {
  visiblePois: PointData[];
  activePoiId: string | null;
  selectedOriginId: string;
  selectedDestinationId: string;
  isAdmin: boolean;
  defaultPoiImages: Record<PoiType, string>;
  imageToLatLng: (x: number, y: number) => [number, number];
  getMarkerIcon: (poi: PointData, isActive: boolean) => L.DivIcon;
  getPoiAccentColor: (poi: PointData) => string;
  getPoiGalleryImages: (poi: PointData) => string[];
  getRelatedSessions: (poi: PointData) => readonly PoiPopupAgendaSession[];
  eventLabel: string;
  expandedPopupPoiId: string | null;
  onToggleExpandedPopup: (poiId: string) => void;
  onPopupNavigate: (poi: PointData) => void;
  onPopupSetOrigin: (poi: PointData) => void;
  onMarkerSelect: (poi: PointData) => void;
  onSuppressNextAdminMapClick: (durationMs?: number) => void;
  onUpdatePoiPosition: (poiId: string, lat: number, lng: number) => void;
  popupSizePreset: {
    width: number;
    minWidth: number;
    maxWidth: number;
    maxHeight: number;
    tier: 'medium' | 'medium-large' | 'large';
    isMobile: boolean;
  };
  editingPoi: Partial<PointData> | null;
  stateIcons: {
    novo: L.DivIcon;
  };
}) => (
  <>
    {visiblePois.map((poi) => {
      const isActive = poi.id === activePoiId;
      const isOriginSelected = poi.id === selectedOriginId;
      const isDestinationSelected = poi.id === selectedDestinationId;
      const popupImage = resolvePoiPrimaryPhotoUrl(poi.id, poi.nome, poi.imagemUrl) || defaultPoiImages[poi.tipo];
      const popupAccentColor = getPoiAccentColor(poi);
      const popupGallery = getPoiGalleryImages(poi);
      const popupHeroImage = popupGallery[0] ?? popupImage;
      const relatedSessions = getRelatedSessions(poi);
      const isPopupExpanded = expandedPopupPoiId === poi.id;
      const popupDetailsId = `popup-details-${poi.id}`;

      return (
        <Marker
          key={poi.id}
          position={imageToLatLng(poi.x, poi.y)}
          icon={getMarkerIcon(poi, !isAdmin && (isDestinationSelected || isOriginSelected || isActive))}
          zIndexOffset={isActive || isOriginSelected || isDestinationSelected ? 1800 : 1200}
          draggable={isAdmin}
          eventHandlers={{
            click: (event) => {
              event.originalEvent?.stopPropagation?.();
              if (isAdmin) {
                onSuppressNextAdminMapClick();
              }
              onMarkerSelect(poi);
            },
            mousedown: (event) => {
              event.originalEvent?.stopPropagation?.();
              if (isAdmin) {
                onSuppressNextAdminMapClick();
              }
            },
            dragstart: () => {
              if (isAdmin) {
                onSuppressNextAdminMapClick(320);
              }
            },
            dragend: (event) => {
              if (!isAdmin) return;
              onSuppressNextAdminMapClick(320);
              const marker = event.target as L.Marker;
              const latLng = marker.getLatLng();
              onUpdatePoiPosition(poi.id, latLng.lat, latLng.lng);
            },
          }}
        >
          <PoiPopupCard
            poi={{
              id: poi.id,
              nome: poi.nome,
            }}
            eventLabel={eventLabel}
            relatedSessions={relatedSessions}
            popupImage={popupImage}
            popupHeroImage={popupGallery.length > 0 ? popupHeroImage : null}
            popupAccentColor={popupAccentColor}
            popupDetailsId={popupDetailsId}
            isExpanded={isPopupExpanded}
            onToggleExpanded={() => onToggleExpandedPopup(poi.id)}
            onNavigate={() => onPopupNavigate(poi)}
            onSetAsOrigin={() => onPopupSetOrigin(poi)}
            popupSizePreset={popupSizePreset}
          />

          {isActive && (
            <Tooltip permanent direction='bottom' offset={[0, 18]} className='poi-selected-label'>
              {poi.nome}
            </Tooltip>
          )}
        </Marker>
      );
    })}

    {isAdmin &&
      editingPoi &&
      !editingPoi.id &&
      typeof editingPoi.x === 'number' &&
      typeof editingPoi.y === 'number' && (
        <Marker position={imageToLatLng(editingPoi.x, editingPoi.y)} icon={stateIcons.novo} />
      )}
  </>
);
