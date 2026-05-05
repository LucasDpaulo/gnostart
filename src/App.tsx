import { VenueMap } from './components/VenueMap/VenueMap';

const DEFAULT_VENUE = import.meta.env.VITE_DEFAULT_VENUE ?? 'gnostart-2026';

function getVenueId(): string {
  const match = window.location.pathname.match(/^\/venue\/([a-z0-9_-]+)/i);
  return match?.[1] ?? DEFAULT_VENUE;
}

function App() {
  return <VenueMap venueId={getVenueId()} />;
}

export default App;
