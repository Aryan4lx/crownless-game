import { useState } from 'react';
import Login from './Login';
import WorldMap from './WorldMap';
import ErrorBoundary from './ErrorBoundary';

export default function App() {
  const [room, setRoom] = useState(null);

  return (
    <ErrorBoundary>
      {room ? (
        <WorldMap room={room} />
      ) : (
        <Login onJoin={setRoom} />
      )}
    </ErrorBoundary>
  );
}
