export type PoiType = 'atividade' | 'servico' | 'banheiro' | 'entrada';

export interface VenuePoi {
  id: string;
  name: string;
  type: PoiType;
  x: number;
  y: number;
  waypointId: string;
  description?: string;
  photo?: string;
  icon?: string;
  accent?: string;
}

export interface VenueWaypoint {
  id: string;
  x: number;
  y: number;
  connections: string[];
}

export interface VenueTheme {
  primary: string;
  accent: string;
  surface: string;
}

export interface VenueConfig {
  version: number;
  meta: {
    id: string;
    name: string;
    locale?: string;
  };
  map: {
    image: string;
    width: number;
    height: number;
    metersPerPixel?: number;
  };
  theme?: VenueTheme;
  pois: VenuePoi[];
  waypoints: VenueWaypoint[];
}
