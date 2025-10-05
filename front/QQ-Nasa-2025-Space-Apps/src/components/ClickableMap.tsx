import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const defaultIcon = new L.Icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type LatLng = { lat: number; lng: number };
export type Selection = LatLng & { when?: string; label?: string };

type Props = {
  center?: [number, number]; // initial center
  zoom?: number; // initial zoom
  selected?: Selection | null;
  onChange?: (sel: Selection) => void;
  liveUpdate?: boolean;
};

function ClickCatcher({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onPick({ lat, lng });
    },
  });
  return null;
}

function FlyTo({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) {
      map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 12), { duration: 0.8 });
    }
  }, [to, map]);
  return null;
}

export default function ClickableMap({
  center = [48.4284, -123.3656], // Victoria by default
  zoom = 12,
  selected = null,
  onChange,
  liveUpdate = false,
}: Props) {
  // Internal selection when not controlled by parent
  const [internalSel, setInternalSel] = useState<Selection | null>(null);

  const controlled = selected !== null && selected !== undefined;
  const shown: Selection | null = useMemo(
    () => (controlled ? selected! : internalSel),
    [controlled, selected, internalSel]
  );

  const markerRef = useRef<L.Marker | null>(null);

  // When selection changes (e.g., from a search), open popup automatically
  useEffect(() => {
    if (shown && markerRef.current) {
      // open after mount
      setTimeout(() => {
        try {
          markerRef.current?.openPopup();
        } catch {}
      }, 0);
    }
  }, [shown]);

  const updateSelection = (next: Selection, intent: 'click' | 'when' | 'confirm') => {
    if (!controlled) setInternalSel(next);
    if (onChange && (liveUpdate || intent === 'confirm')) onChange(next);
  };

  const handleMapPick = (pos: LatLng) => {
    const next: Selection = {
      lat: pos.lat,
      lng: pos.lng,
      when: shown?.when, // preserve chosen time if any
      label: undefined,
    };
    updateSelection(next, 'click');
  };

  const handleWhenChange = (value: string) => {
    if (!shown) return;
    const next: Selection = { ...shown, when: value };
    updateSelection(next, 'when');
  };

  const confirm = () => {
    if (!shown) return;
    updateSelection(shown, 'confirm');
  };

  return (
    <div>
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-screen w-screen"
        scrollWheelZoom
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <ClickCatcher onPick={handleMapPick} />
        <FlyTo to={shown ? { lat: shown.lat, lng: shown.lng } : null} />

        {shown && (
          <Marker
            position={[shown.lat, shown.lng]}
            icon={defaultIcon}
            ref={(m: any) => {
              // react-leaflet v4 forwards the Leaflet marker instance
              markerRef.current = m ?? null;
            }}
          >
            <Popup autoPan keepInView>
              <div
                onWheel={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="space-y-2"
              >
                <div className="text-sm font-medium">
                  {shown.label ?? 'Selected'} — {shown.lat.toFixed(5)}, {shown.lng.toFixed(5)}
                </div>

                <label className="block text-sm">
                  <span className="mr-2">When:</span>
                  <input
                    type="datetime-local"
                    value={shown.when ?? ''}
                    onChange={(e) => handleWhenChange(e.target.value)}
                    className="rounded border px-2 py-1"
                  />
                </label>

                {!liveUpdate && (
                  <button
                    type="button"
                    onClick={confirm}
                    className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
                  >
                    Use this location &amp; time
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
