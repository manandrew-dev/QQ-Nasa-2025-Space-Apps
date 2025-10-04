import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinalUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function ClickCatcher({ onSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onSelect?.({ lat, lng });
    },
  });
  return null;
}

export default function ClickableMap({
  center = [48.4284, -123.3656], // defaults to Victoria
  zoom = 12,
  onSelect,
}) {
  const [pin, setPin] = useState(null);

  const handleSelect = (pos) => {
    setPin(pos);
    onSelect?.(pos);
  };

  return (
    <div>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100vh', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          // tiles from OSM
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCatcher onSelect={handleSelect} />
        {pin && (
          <Marker position={[pin.lat, pin.lng]}>
            <Popup>
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
