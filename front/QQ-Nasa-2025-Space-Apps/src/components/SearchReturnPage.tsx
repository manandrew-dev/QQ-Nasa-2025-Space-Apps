import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MapIcon from '@mui/icons-material/Map';

type BackendResponse = {
  average_precipitation_mm_per_hr?: number;
  rain_probability_percent?: number;
  rain_intensity_category?: string;
  chart_image_base64?: string; // may be a raw base64 string or a data URL
};

type LocationTimeData = {
  lat: number;
  lng: number;
  when: string; // from <input type="datetime-local"> e.g. "2025-10-01T12:00"
};

export default function SearchReturnPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: Partial<LocationTimeData> };

  // Validate incoming state
  const lat = typeof state?.lat === 'number' ? state.lat : undefined;
  const lng = typeof state?.lng === 'number' ? state.lng : undefined;
  const when = typeof state?.when === 'string' ? state.when : undefined;

  // Derived date/time/tzone for backend
  const payload = useMemo(() => {
    if (!when || lat === undefined || lng === undefined) return null;
    // Extract date & time from "YYYY-MM-DDTHH:MM"
    const [datePart, timePartFull] = when.split('T');
    const timePart = (timePartFull ?? '').slice(0, 5); // HH:MM
    // Compute numeric timezone offset in hours, as string
    // JS: getTimezoneOffset() returns minutes behind UTC (e.g., 420 for PDT)
    // Backend example expects "10" style; send signed hours (e.g., "-7" for PDT)
    const tzHours = -new Date().getTimezoneOffset() / 60;
    const tzone = String(tzHours);
    return {
      coords: [lat, lng],
      date: datePart,
      time: timePart,
      tzone,
    };
  }, [lat, lng, when]);

  const [result, setResult] = useState<BackendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('http://localhost:3000/api/calculate_prob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        const data: BackendResponse = await res.json();
        setResult(data);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    })();
  }, [payload]);

  // Build img src safely (support raw base64 or full data URL)
  const chartSrc = useMemo(() => {
    const b64 = result?.chart_image_base64;
    if (!b64) return null;
    if (b64.startsWith('data:image')) return b64;
    return `data:image/png;base64,${b64}`;
  }, [result]);

  if (lat === undefined || lng === undefined || !when) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-bold">Location Data</h1>
        <p className="text-gray-700">
          No location/time was provided. Please go back to the map and pick a location and date/time.
        </p>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          onClick={() => navigate(-1)}
        >
          ← Back to Map
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapIcon />
          Weather Outlook
        </h1>
        <button
          className="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
          onClick={() => navigate(-1)}
        >
          ← Pick another location
        </button>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Latitude</div>
          <div className="text-lg font-semibold">{lat.toFixed(5)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Longitude</div>
          <div className="text-lg font-semibold">{lng.toFixed(5)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-gray-500">Date &amp; Time</div>
          <div className="text-lg font-semibold">{when}</div>
        </div>
      </div>

      {/* Main content: probability + chart */}
      <div className="rounded-2xl border p-4">
        {loading && (
          <div className="text-gray-600">Fetching forecast…</div>
        )}
        {error && (
          <div className="text-red-600">Error: {error}</div>
        )}
        {!loading && !error && result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-4">
              <div className="text-3xl font-bold">
                {Math.round(result.rain_probability_percent ?? 0)}%
                <span className="ml-2 text-base font-medium text-gray-600">chance of rain</span>
              </div>
              {typeof result.average_precipitation_mm_per_hr === 'number' && (
                <div className="text-gray-700">
                  Avg precip: <span className="font-semibold">{result.average_precipitation_mm_per_hr.toFixed(2)}</span> mm/hr
                </div>
              )}
              {result.rain_intensity_category && (
                <div className="inline-block rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 border border-blue-200">
                  {result.rain_intensity_category}
                </div>
              )}
            </div>

            {chartSrc ? (
              <img
                src={chartSrc}
                alt="Precipitation chart"
                className="mx-auto max-w-full rounded-xl border"
              />
            ) : (
              <div className="text-gray-500">No chart available.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
