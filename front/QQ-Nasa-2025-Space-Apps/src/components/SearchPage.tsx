import { useState } from 'react'
import ClickableMap, { type Selection } from '../components/ClickableMap'
import SearchBar from '../components/SearchBar'

/**
 * Full-screen map page with an overlay search bar.
 * - Search a place -> geocode via Nominatim -> drop a pin and open a popup with a date-time picker.
 * - Clicking the map also drops a pin and opens the same popup.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Selection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geocode = async (q: string) => {
    if (!q.trim()) return
    try {
      setLoading(true)
      setError(null)
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`
      const res = await fetch(url, {
        headers: {
          // Browser sends Referer automatically; keep requests modest to respect rate limits.
        },
      })
      if (!res.ok) throw new Error('Geocoder request failed')
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) {
        setError('No results. Try a more specific place.')
        return
      }
      const hit = data[0]
      const lat = parseFloat(hit.lat)
      const lng = parseFloat(hit.lon)
      setSelected({
        lat,
        lng,
        label: hit.display_name,
        when: selected?.when, // preserve user-chosen time if any
      })
    } catch (e: any) {
      setError(e?.message ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = () => geocode(query)

  return (
    <div className="relative h-screen w-screen">
      {/* Overlay: search bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xl px-4 pointer-events-none">
        <div className="rounded-2xl bg-white/90 shadow-xl backdrop-blur px-4 py-3 pointer-events-auto">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={onSubmit}
            placeholder="Search a location (e.g., Vancouver, Beacon Hill Park)…"
            disabled={loading}
          />
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </div>
      </div>

      {/* Full-screen map */}
      <ClickableMap
        selected={selected}
        onChange={(sel) => {
          // sel: { lat, lng, when?: string, label?: string }
          setSelected(sel)
        }}
        liveUpdate={true}
      />
    </div>
  )
}
