import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Position } from './parties';

// The venue on a map (Leaflet, free OpenStreetMap tiles): click to put the pin; the circle shows who will be close
// enough to vote
export function VenueMap({ pin, radius, onPin }: { pin: Position | null; radius: number; onPin: (pin: Position) => void }) {
  return <MapContainer className="rooms-map" center={pin ? [pin.latitude, pin.longitude] : [20, 0]} zoom={pin ? 16 : 2} scrollWheelZoom>
    {/* OpenStreetMap refuses tiles asked without a referrer, and index.html sends none: the tiles alone send the
        site's address, never a page's path (a reset link's token stays private) */}
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} referrerPolicy="strict-origin"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
    <Clicks onPin={onPin} />
    {pin ? <>
      <Circle center={[pin.latitude, pin.longitude]} radius={radius} pathOptions={{ color: '#b7f576' }} />
      <CircleMarker center={[pin.latitude, pin.longitude]} radius={7} pathOptions={{ color: '#08090d', fillColor: '#b7f576', fillOpacity: 1 }} />
      <Follow pin={pin} />
    </> : null}
  </MapContainer>;
}

function Clicks({ onPin }: { onPin: (pin: Position) => void }) {
  useMapEvents({ click: event => onPin({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

// The first pin zooms in on it; later ones only move the map there
function Follow({ pin }: { pin: Position }) {
  const map = useMap();
  useEffect(() => {
    const at: [number, number] = [pin.latitude, pin.longitude];
    if (map.getZoom() < 14) map.setView(at, 16);
    else map.panTo(at);
  }, [map, pin]);
  return null;
}
