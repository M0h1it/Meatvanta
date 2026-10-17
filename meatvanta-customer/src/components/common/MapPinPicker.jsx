import { useEffect, useRef, useState } from "react";
import { loadLeaflet } from "../../lib/externalScripts";

// Gurugram - where the map opens when there is no pin yet.
const DEFAULT_CENTER = [28.4595, 77.0266];

/**
 * Lets the customer drop (or drag) a pin on the exact spot, so the delivery
 * boy lands at the door instead of guessing from the written address.
 *
 *  value    : { latitude, longitude } or null
 *  onChange : ({ latitude, longitude } | null) => void
 */
export default function MapPinPicker({ value, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState("loading"); // loading | ready | failed
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const L = window.L;
        const hasPin = value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
        const start = hasPin ? [Number(value.latitude), Number(value.longitude)] : DEFAULT_CENTER;

        const map = L.map(containerRef.current, { zoomControl: true }).setView(start, hasPin ? 17 : 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);

        function place(lat, lng) {
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
            marker.on("dragend", () => {
              const p = marker.getLatLng();
              onChangeRef.current({ latitude: +p.lat.toFixed(7), longitude: +p.lng.toFixed(7) });
            });
            markerRef.current = marker;
          }
        }
        map._placePin = place;

        if (hasPin) place(start[0], start[1]);

        map.on("click", (e) => {
          place(e.latlng.lat, e.latlng.lng);
          onChangeRef.current({ latitude: +e.latlng.lat.toFixed(7), longitude: +e.latlng.lng.toFixed(7) });
        });

        mapRef.current = map;
        setStatus("ready");
        // The map sits inside a modal that has just opened - let it measure itself again.
        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => !cancelled && setStatus("failed"));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin removed from outside -> take the marker off the map.
  useEffect(() => {
    if (!value && markerRef.current && mapRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [value]);

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Your browser can't share its location. Tap on the map instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(7);
        const lng = +pos.coords.longitude.toFixed(7);
        if (mapRef.current) {
          mapRef.current._placePin(lat, lng);
          mapRef.current.setView([lat, lng], 17);
        }
        onChange({ latitude: lat, longitude: lng });
        setLocating(false);
      },
      () => {
        setGeoError("Couldn't get your location. Allow location access, or tap on the map instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const hasPin = value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-sm font-semibold text-ink">
          Pin your exact location <span className="font-normal text-ink/40">(recommended)</span>
        </label>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating || status === "failed"}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-dark disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-base">my_location</span>
          {locating ? "Finding..." : "Use my location"}
        </button>
      </div>

      {status === "failed" ? (
        <p className="text-xs text-ink/50 rounded-sm border border-ink/15 bg-white px-3 py-4">
          The map couldn't load right now. You can still save the address - the pin is optional.
        </p>
      ) : (
        <div className="relative z-0 rounded-sm border border-ink/15 overflow-hidden bg-white">
          <div ref={containerRef} style={{ height: 220 }} />
          {status === "loading" && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-ink/50">Loading map...</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-ink/50">
          {hasPin ? "Pin set - drag it or tap the map to adjust." : "Tap the map where your door is."}
        </p>
        {hasPin && (
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-ink/50 underline">
            Remove pin
          </button>
        )}
      </div>
      {geoError && <p className="text-xs text-brand mt-1">{geoError}</p>}
    </div>
  );
}
