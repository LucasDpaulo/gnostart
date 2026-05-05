import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  buildDirectPath,
  findPathBetweenPoints,
  resolveRoutableNodeId,
} from '../../../../utils/pathfinding';
import type { ManualRouteOrigin, PointData } from '../../types';

type UseRouteNavigationOptions = {
  pois: PointData[];
  selectedOriginId: string;
  setSelectedOriginId: Dispatch<SetStateAction<string>>;
  manualMapOrigin: ManualRouteOrigin | null;
  setManualMapOrigin: Dispatch<SetStateAction<ManualRouteOrigin | null>>;
  setOriginQuery: Dispatch<SetStateAction<string>>;
  setShowOriginSuggestions: Dispatch<SetStateAction<boolean>>;
  selectedDestinationId: string;
  setSelectedDestinationId: Dispatch<SetStateAction<string>>;
  setDestinationQuery: Dispatch<SetStateAction<string>>;
  setShowDestinationSuggestions: Dispatch<SetStateAction<boolean>>;
  setRota: Dispatch<SetStateAction<number[][] | null>>;
  setIsRouteViewportSettled: Dispatch<SetStateAction<boolean>>;
  setShouldAnimateRouteReveal: Dispatch<SetStateAction<boolean>>;
  setRouteRevealProgress: Dispatch<SetStateAction<number>>;
  setRouteMessage: Dispatch<SetStateAction<string>>;
  setWalkerPosition: Dispatch<SetStateAction<[number, number] | null>>;
  setWalkerProgress: Dispatch<SetStateAction<number>>;
  routeRevealFrameRef: MutableRefObject<number | null>;
  walkerTimerRef: MutableRefObject<number | null>;
  getPoiById: (id: string) => PointData | undefined;
  imageToLatLng: (x: number, y: number) => [number, number];
  getPathDistanceMeters: (positions: [number, number][]) => number;
  formatDistanceLabel: (meters: number) => string;
  formatWalkingTimeLabel: (minutes: number) => string;
  getImagePointDistance: (from: { x: number; y: number }, to: { x: number; y: number }) => number;
  requireManualOriginConfirmation: boolean;
  onPlayRouteSound: () => void;
  onNavigateToPoiStart?: () => void;
  onRequireManualOrigin?: (poi: PointData) => void;
  routeLatLngPoints: [number, number][];
  routeDistanceMeters: number;
  isRouteRevealComplete: boolean;
  isRouteViewportSettled: boolean;
  shouldAnimateRouteReveal: boolean;
  prefersReducedMotion: boolean;
  isPresentationMode: boolean;
  getPointAlongPath: (positions: [number, number][], progress: number) => [number, number];
  getAdaptiveAnimationDuration: (
    distanceMeters: number,
    minDurationMs: number,
    maxDurationMs: number,
    msPerMeter: number,
  ) => number;
  easeInOutCubic: (value: number) => number;
  freeWalkNavigationEnabled: boolean;
  config: {
    averageWalkingSpeedMps: number;
    routeRevealMinDurationMs: number;
    routeRevealMaxDurationMs: number;
    routeRevealMsPerMeter: number;
    presentationWalkerMinDurationMs: number;
    presentationWalkerMaxDurationMs: number;
    presentationWalkerMsPerMeter: number;
    walkerProgressUpdateMs: number;
    routeAutoExpireMs: number;
  };
};

export const useRouteNavigation = ({
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
  requireManualOriginConfirmation,
  onPlayRouteSound,
  onNavigateToPoiStart,
  onRequireManualOrigin,
  routeLatLngPoints,
  routeDistanceMeters,
  isRouteViewportSettled,
  shouldAnimateRouteReveal,
  prefersReducedMotion,
  getAdaptiveAnimationDuration,
  easeInOutCubic,
  freeWalkNavigationEnabled,
  config,
}: UseRouteNavigationOptions) => {
  const lastPoiRouteKeyRef = useRef('');
  const lastManualRouteKeyRef = useRef('');
  const routeAutoExpireTimerRef = useRef<number | null>(null);

  const resetRouteTimers = useCallback(() => {
    if (routeAutoExpireTimerRef.current !== null) {
      window.clearTimeout(routeAutoExpireTimerRef.current);
      routeAutoExpireTimerRef.current = null;
    }
  }, []);

  const resetRouteVisualState = useCallback(() => {
    setRota(null);
    setIsRouteViewportSettled(true);
    setShouldAnimateRouteReveal(false);
    setRouteRevealProgress(0);
    setWalkerPosition(null);
    setWalkerProgress(0);
    lastPoiRouteKeyRef.current = '';
    lastManualRouteKeyRef.current = '';
  }, [
    setIsRouteViewportSettled,
    setRota,
    setRouteRevealProgress,
    setShouldAnimateRouteReveal,
    setWalkerPosition,
    setWalkerProgress,
  ]);

  const getManualOriginRequiredMessage = useCallback((destinationLabel?: string) => {
    if (destinationLabel) {
      return `Antes de ir ate ${destinationLabel}, escolha onde voce esta no mapa ou pelos pontos principais.`;
    }
    return 'Antes de gerar a rota, escolha onde voce esta no mapa ou pelos pontos principais.';
  }, []);

  const getPoiRouteKey = useCallback((originPoi: PointData, destinationPoi: PointData) => {
    return [
      originPoi.id,
      Math.round(originPoi.x),
      Math.round(originPoi.y),
      originPoi.nodeId ?? 'sem-no',
      destinationPoi.id,
      Math.round(destinationPoi.x),
      Math.round(destinationPoi.y),
      destinationPoi.nodeId ?? 'sem-no',
    ].join(':');
  }, []);

  const commitRoutePath = useCallback(
    (
      routePath: number[][],
      originLabel: string,
      destinationLabel: string,
      options?: {
        animateReveal?: boolean;
        announce?: boolean;
        playSound?: boolean;
      },
    ) => {
      const pathLatLng = routePath.map(([y, x]) => imageToLatLng(x, y));
      const distanceMeters = getPathDistanceMeters(pathLatLng);
      const etaMinutes = distanceMeters / (config.averageWalkingSpeedMps * 60);
      const distanceLabel = formatDistanceLabel(distanceMeters);
      const etaLabel = formatWalkingTimeLabel(etaMinutes);
      const shouldAnimateReveal =
        options?.animateReveal ?? (!prefersReducedMotion && routePath.length > 1 && routePath.length <= 180);
      const shouldAnnounce = options?.announce ?? true;
      const shouldPlaySound = options?.playSound ?? true;

      setShouldAnimateRouteReveal(shouldAnimateReveal);
      setIsRouteViewportSettled(!shouldAnimateReveal);
      setRouteRevealProgress(shouldAnimateReveal ? 0 : 1);
      setRota(routePath);

      if (shouldPlaySound) {
        onPlayRouteSound();
      }

      if (shouldAnnounce) {
        setRouteMessage(
          `Rota pronta: ${originLabel} -> ${destinationLabel}. Distancia: ${distanceLabel} | Tempo medio: ${etaLabel}.`,
        );
      }
    },
    [
      config.averageWalkingSpeedMps,
      formatDistanceLabel,
      formatWalkingTimeLabel,
      getPathDistanceMeters,
      imageToLatLng,
      onPlayRouteSound,
      setIsRouteViewportSettled,
      setRota,
      setRouteMessage,
      setRouteRevealProgress,
      setShouldAnimateRouteReveal,
    ],
  );

  const getManualRouteKey = useCallback((origin: ManualRouteOrigin, destinationPoi: PointData) => {
    return [
      destinationPoi.id,
      Math.round(destinationPoi.x),
      Math.round(destinationPoi.y),
      destinationPoi.nodeId ?? 'sem-no',
      origin.snappedNodeId ?? 'sem-no',
      Math.round(origin.x),
      Math.round(origin.y),
    ].join(':');
  }, []);

  const resolveRoutePathBetweenPoints = useCallback(
    (
      origin: { x: number; y: number },
      destination: { x: number; y: number },
      preferredOriginNodeId?: string | null,
      preferredDestinationNodeId?: string | null,
    ) => {
      if (freeWalkNavigationEnabled) {
        return {
          startNodeId: null,
          endNodeId: null,
          path: buildDirectPath(origin, destination),
        };
      }

      return findPathBetweenPoints(origin, destination, {
        preferredStartNodeId: preferredOriginNodeId,
        preferredEndNodeId: preferredDestinationNodeId,
        preferredNodeMaxDistance: 120,
        nodeSnapMaxDistance: 120,
      });
    },
    [freeWalkNavigationEnabled],
  );

  const buildRouteBetweenPois = useCallback(
    (originId: string, destinationId: string) => {
      const originPoi = getPoiById(originId);
      const destinationPoi = getPoiById(destinationId);

      if (!originPoi || !destinationPoi) {
        lastPoiRouteKeyRef.current = '';
        resetRouteVisualState();
        setRouteMessage('Escolha uma origem e um destino validos para montar a rota.');
        return;
      }

      if (originPoi.id === destinationPoi.id) {
        lastPoiRouteKeyRef.current = '';
        resetRouteVisualState();
        setRouteMessage(`Origem e destino apontam para o mesmo ponto em ${destinationPoi.nome}.`);
        return;
      }

      const routeKey = getPoiRouteKey(originPoi, destinationPoi);
      if (routeKey === lastPoiRouteKeyRef.current) {
        return;
      }

      const resolvedRoute = resolveRoutePathBetweenPoints(
        { x: originPoi.x, y: originPoi.y },
        { x: destinationPoi.x, y: destinationPoi.y },
        originPoi.nodeId ?? null,
        destinationPoi.nodeId ?? null,
      );
      const rawPath = resolvedRoute.path;

      if (!rawPath) {
        lastPoiRouteKeyRef.current = '';
        resetRouteVisualState();
        setRouteMessage(`Nao encontramos rota entre ${originPoi.nome} e ${destinationPoi.nome}.`);
        return;
      }

      if (!freeWalkNavigationEnabled && resolvedRoute.startNodeId && resolvedRoute.startNodeId === resolvedRoute.endNodeId) {
        lastPoiRouteKeyRef.current = '';
        resetRouteVisualState();
        setRouteMessage(`Origem e destino chegam ao mesmo trecho de rota em ${destinationPoi.nome}.`);
        return;
      }

      lastPoiRouteKeyRef.current = routeKey;
      lastManualRouteKeyRef.current = '';
      commitRoutePath(rawPath, originPoi.nome, destinationPoi.nome);
    },
    [
      commitRoutePath,
      freeWalkNavigationEnabled,
      getPoiRouteKey,
      getPoiById,
      resetRouteVisualState,
      resolveRoutePathBetweenPoints,
      setRouteMessage,
    ],
  );

  const buildRouteFromManualMapOrigin = useCallback(
    (
      origin: ManualRouteOrigin,
      destinationId: string,
      options?: {
        animateReveal?: boolean;
        announce?: boolean;
        playSound?: boolean;
      },
    ) => {
      const destinationPoi = getPoiById(destinationId);
      if (!destinationPoi) {
        resetRouteVisualState();
        lastManualRouteKeyRef.current = '';
        setRouteMessage('Escolha um destino valido antes de iniciar a navegacao.');
        return;
      }

      const resolvedRoute = resolveRoutePathBetweenPoints(
        { x: origin.x, y: origin.y },
        { x: destinationPoi.x, y: destinationPoi.y },
        origin.snappedNodeId,
        destinationPoi.nodeId ?? null,
      );
      const resolvedOriginNodeId = resolvedRoute.startNodeId;
      const manualRouteKey = getManualRouteKey(
        resolvedOriginNodeId ? { ...origin, snappedNodeId: resolvedOriginNodeId } : origin,
        destinationPoi,
      );
      if (manualRouteKey && manualRouteKey === lastManualRouteKeyRef.current) {
        return;
      }

      if (
        freeWalkNavigationEnabled
          ? getImagePointDistance({ x: origin.x, y: origin.y }, { x: destinationPoi.x, y: destinationPoi.y }) < 8
          : resolvedRoute.startNodeId && resolvedRoute.startNodeId === resolvedRoute.endNodeId
      ) {
        resetRouteVisualState();
        lastManualRouteKeyRef.current = '';
        setRouteMessage(`Voce ja esta em ${destinationPoi.nome}.`);
        return;
      }

      if (!freeWalkNavigationEnabled && !resolvedOriginNodeId) {
        resetRouteVisualState();
        lastManualRouteKeyRef.current = '';
        setRouteMessage('Toque mais perto de um corredor branco para marcar sua origem no mapa.');
        return;
      }

      const rawPath = resolvedRoute.path;

      if (!rawPath) {
        resetRouteVisualState();
        lastManualRouteKeyRef.current = '';
        setRouteMessage(`Nao encontramos rota entre ${origin.label} e ${destinationPoi.nome}.`);
        return;
      }

      lastManualRouteKeyRef.current = manualRouteKey;
      commitRoutePath(rawPath, origin.label, destinationPoi.nome, options);
    },
    [
      commitRoutePath,
      freeWalkNavigationEnabled,
      getImagePointDistance,
      getManualRouteKey,
      getPoiById,
      resetRouteVisualState,
      resolveRoutePathBetweenPoints,
      setRouteMessage,
    ],
  );

  const clearManualRouteOrigin = useCallback(() => {
    setSelectedOriginId('');
    setManualMapOrigin(null);
    setOriginQuery('');
    setShowOriginSuggestions(false);
    resetRouteTimers();
    resetRouteVisualState();
    setRouteMessage('Origem limpa. Escolha novamente onde voce esta para montar outra rota.');
  }, [
    resetRouteTimers,
    resetRouteVisualState,
    setManualMapOrigin,
    setOriginQuery,
    setRouteMessage,
    setSelectedOriginId,
    setShowOriginSuggestions,
  ]);

  const clearRoute = useCallback(() => {
    setSelectedDestinationId('');
    setDestinationQuery('');
    setShowDestinationSuggestions(false);
    resetRouteTimers();
    resetRouteVisualState();
    setRouteMessage('Rota cancelada. Escolha um novo destino quando quiser.');
  }, [
    resetRouteTimers,
    resetRouteVisualState,
    setDestinationQuery,
    setRouteMessage,
    setSelectedDestinationId,
    setShowDestinationSuggestions,
  ]);

  const selectDestinationPoi = useCallback(
    (poi: PointData, options?: { buildInstantly?: boolean }) => {
      setSelectedDestinationId(poi.id);
      setDestinationQuery(poi.nome);
      setShowDestinationSuggestions(false);

      if (options?.buildInstantly === false) return;

      if (selectedOriginId) {
        buildRouteBetweenPois(selectedOriginId, poi.id);
        return;
      }

      if (manualMapOrigin) {
        buildRouteFromManualMapOrigin(manualMapOrigin, poi.id, {
          animateReveal: true,
          announce: true,
          playSound: true,
        });
        return;
      }

      if (requireManualOriginConfirmation) {
        resetRouteVisualState();
        setRouteMessage(getManualOriginRequiredMessage(poi.nome));
        onRequireManualOrigin?.(poi);
        return;
      }

      resetRouteVisualState();
      setRouteMessage(getManualOriginRequiredMessage(poi.nome));
    },
    [
      buildRouteBetweenPois,
      buildRouteFromManualMapOrigin,
      getManualOriginRequiredMessage,
      manualMapOrigin,
      requireManualOriginConfirmation,
      resetRouteVisualState,
      selectedOriginId,
      setDestinationQuery,
      setRouteMessage,
      setSelectedDestinationId,
      setShowDestinationSuggestions,
      onRequireManualOrigin,
    ],
  );

  const selectOriginPoi = useCallback(
    (poi: PointData) => {
      setSelectedOriginId(poi.id);
      setManualMapOrigin(null);
      lastManualRouteKeyRef.current = '';
      setOriginQuery(poi.nome);
      setShowOriginSuggestions(false);
      resetRouteVisualState();

      if (!freeWalkNavigationEnabled && !resolveRoutableNodeId(poi.x, poi.y, poi.nodeId ?? null, 120, 120)) {
        setRouteMessage(`"${poi.nome}" ainda nao esta conectado a malha de rotas.`);
        return;
      }

      if (selectedDestinationId) {
        buildRouteBetweenPois(poi.id, selectedDestinationId);
        return;
      }

      setRouteMessage(`Origem definida em ${poi.nome}. Agora escolha o destino para montar a rota.`);
    },
    [
      buildRouteBetweenPois,
      freeWalkNavigationEnabled,
      resetRouteVisualState,
      resolveRoutableNodeId,
      selectedDestinationId,
      setManualMapOrigin,
      setOriginQuery,
      setRouteMessage,
      setSelectedOriginId,
      setShowOriginSuggestions,
    ],
  );

  const selectManualMapOrigin = useCallback(
    (origin: ManualRouteOrigin) => {
      setSelectedOriginId('');
      setManualMapOrigin(origin);
      lastManualRouteKeyRef.current = '';
      setOriginQuery(origin.label);
      setShowOriginSuggestions(false);
      resetRouteVisualState();

      if (selectedDestinationId) {
        buildRouteFromManualMapOrigin(origin, selectedDestinationId, {
          animateReveal: true,
          announce: true,
          playSound: true,
        });
        return;
      }

      setRouteMessage(`Local confirmado em ${origin.label}. Agora escolha o destino para montar a rota.`);
    },
    [
      buildRouteFromManualMapOrigin,
      resetRouteVisualState,
      selectedDestinationId,
      setManualMapOrigin,
      setOriginQuery,
      setRouteMessage,
      setSelectedOriginId,
      setShowOriginSuggestions,
    ],
  );

  const navigateToPoi = useCallback(
    (poi: PointData) => {
      if (!freeWalkNavigationEnabled && !resolveRoutableNodeId(poi.x, poi.y, poi.nodeId ?? null, 120, 120)) {
        setRouteMessage(`"${poi.nome}" ainda nao esta conectado a malha de rotas.`);
        return;
      }

      onNavigateToPoiStart?.();
      selectDestinationPoi(poi, { buildInstantly: false });

      if (selectedOriginId) {
        buildRouteBetweenPois(selectedOriginId, poi.id);
        return;
      }

      if (manualMapOrigin) {
        buildRouteFromManualMapOrigin(manualMapOrigin, poi.id, {
          animateReveal: true,
          announce: true,
          playSound: true,
        });
        return;
      }

      resetRouteVisualState();
      setRouteMessage(getManualOriginRequiredMessage(poi.nome));
      onRequireManualOrigin?.(poi);
    },
    [
      buildRouteBetweenPois,
      buildRouteFromManualMapOrigin,
      freeWalkNavigationEnabled,
      getManualOriginRequiredMessage,
      manualMapOrigin,
      onNavigateToPoiStart,
      resolveRoutableNodeId,
      resetRouteVisualState,
      selectedOriginId,
      selectDestinationPoi,
      setRouteMessage,
      onRequireManualOrigin,
    ],
  );

  useEffect(() => {
    if (!manualMapOrigin || !selectedDestinationId) return;
    buildRouteFromManualMapOrigin(manualMapOrigin, selectedDestinationId, {
      animateReveal: true,
      announce: true,
      playSound: true,
    });
  }, [buildRouteFromManualMapOrigin, manualMapOrigin, selectedDestinationId]);

  useEffect(() => {
    if (!selectedOriginId || !selectedDestinationId) return;
    buildRouteBetweenPois(selectedOriginId, selectedDestinationId);
  }, [buildRouteBetweenPois, selectedDestinationId, selectedOriginId]);

  useEffect(() => {
    resetRouteTimers();

    if (routeLatLngPoints.length <= 1) return;

    routeAutoExpireTimerRef.current = window.setTimeout(() => {
      resetRouteVisualState();
      setSelectedDestinationId('');
      setDestinationQuery('');
      setShowDestinationSuggestions(false);
      setRouteMessage('Rota encerrada automaticamente apos 5 minutos. Escolha outro destino ou altere seu local.');
    }, config.routeAutoExpireMs);

    return resetRouteTimers;
  }, [
    config.routeAutoExpireMs,
    resetRouteTimers,
    resetRouteVisualState,
    routeLatLngPoints,
    setDestinationQuery,
    setRouteMessage,
    setSelectedDestinationId,
    setShowDestinationSuggestions,
  ]);

  useEffect(() => {
    if (routeRevealFrameRef.current !== null) {
      window.cancelAnimationFrame(routeRevealFrameRef.current);
      routeRevealFrameRef.current = null;
    }

    if (routeLatLngPoints.length === 0) {
      setRouteRevealProgress(0);
      return;
    }

    if (routeLatLngPoints.length === 1 || prefersReducedMotion || !shouldAnimateRouteReveal) {
      setRouteRevealProgress(1);
      return;
    }

    if (!isRouteViewportSettled) {
      setRouteRevealProgress(0);
      return;
    }

    setRouteRevealProgress(0);
    const animationStart = performance.now();
    const animationDurationMs = getAdaptiveAnimationDuration(
      routeDistanceMeters,
      config.routeRevealMinDurationMs,
      config.routeRevealMaxDurationMs,
      config.routeRevealMsPerMeter,
    );

    let lastUpdateTime = 0;
    const THROTTLE_MS = 80;

    const revealStep = () => {
      const now = performance.now();
      const elapsed = now - animationStart;
      const progress = Math.min(1, elapsed / animationDurationMs);

      if (progress >= 1 || now - lastUpdateTime >= THROTTLE_MS) {
        setRouteRevealProgress(easeInOutCubic(progress));
        lastUpdateTime = now;
      }

      if (progress < 1) {
        routeRevealFrameRef.current = window.requestAnimationFrame(revealStep);
        return;
      }

      routeRevealFrameRef.current = null;
    };

    routeRevealFrameRef.current = window.requestAnimationFrame(revealStep);

    return () => {
      if (routeRevealFrameRef.current !== null) {
        window.cancelAnimationFrame(routeRevealFrameRef.current);
        routeRevealFrameRef.current = null;
      }
    };
  }, [
    config.routeRevealMaxDurationMs,
    config.routeRevealMinDurationMs,
    config.routeRevealMsPerMeter,
    easeInOutCubic,
    getAdaptiveAnimationDuration,
    isRouteViewportSettled,
    prefersReducedMotion,
    routeDistanceMeters,
    routeLatLngPoints,
    routeRevealFrameRef,
    setRouteRevealProgress,
    shouldAnimateRouteReveal,
  ]);

  useEffect(() => {
    if (walkerTimerRef.current !== null) {
      window.clearInterval(walkerTimerRef.current);
      walkerTimerRef.current = null;
    }

    setWalkerPosition(null);
    setWalkerProgress(0);

    return () => {
      if (walkerTimerRef.current !== null) {
        window.clearInterval(walkerTimerRef.current);
        walkerTimerRef.current = null;
      }
    };
  }, [
    routeLatLngPoints,
    setWalkerPosition,
    setWalkerProgress,
    walkerTimerRef,
  ]);

  useEffect(() => {
    if (!selectedDestinationId) return;
    const destination = pois.find((poi) => poi.id === selectedDestinationId);
    if (destination) setDestinationQuery(destination.nome);
  }, [pois, selectedDestinationId, setDestinationQuery]);

  useEffect(() => {
    if (!selectedDestinationId) return;
    const missingDestination = !pois.some((poi) => poi.id === selectedDestinationId);
    if (missingDestination) {
      clearRoute();
    }
  }, [clearRoute, pois, selectedDestinationId]);

  useEffect(() => {
    if (!selectedOriginId) return;
    const missingOrigin = !pois.some((poi) => poi.id === selectedOriginId);
    if (missingOrigin) {
      clearManualRouteOrigin();
    }
  }, [clearManualRouteOrigin, pois, selectedOriginId]);

  useEffect(() => resetRouteTimers, [resetRouteTimers]);

  return {
    clearManualRouteOrigin,
    clearRoute,
    selectDestinationPoi,
    selectOriginPoi,
    selectManualMapOrigin,
    buildRouteBetweenPois,
    buildRouteFromManualMapOrigin,
    navigateToPoi,
  };
};
