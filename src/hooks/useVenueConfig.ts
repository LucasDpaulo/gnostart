import { useEffect, useState } from 'react';
import type { VenueConfig } from '../types/venue';

interface VenueConfigState {
  config: VenueConfig | null;
  isLoading: boolean;
  error: string | null;
}

export function useVenueConfig(venueId: string): VenueConfigState {
  const [state, setState] = useState<VenueConfigState>({
    config: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ config: null, isLoading: true, error: null });
      try {
        const res = await fetch(`/venues/${venueId}/venue.json`);
        if (!res.ok) throw new Error(`Venue "${venueId}" não encontrado`);
        const config: VenueConfig = await res.json();

        if (!cancelled) {
          setState({ config, isLoading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ config: null, isLoading: false, error: (err as Error).message });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [venueId]);

  return state;
}
