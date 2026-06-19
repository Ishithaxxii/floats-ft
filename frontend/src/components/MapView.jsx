import { useState, useEffect, useRef, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    CircleMarker,
    Popup,
    Polyline,
    Rectangle,
    useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import ProfilePlots from "./ProfilePlots";
import Legend from "./Legend";

// ==========================================
// FIX DEFAULT MARKER ICON
// ==========================================
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const MARKER_COLORS = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
    "#00bcd4", "#8bc34a", "#ff5722", "#607d8b",
    "#795548", "#ffc107", "#673ab7", "#009688",
];

const EEZ_STYLE = {
    color: "#ffff00",
    weight: 2,
    opacity: 0.7,
    dashArray: "6 4",
};

const BOX_STYLE = {
    color: "#00cfff",
    weight: 2,
    opacity: 0.9,
    fillColor: "#00cfff",
    fillOpacity: 0.08,
    dashArray: "5 4",
};

// ==========================================
// HELPERS
// ==========================================
function generateShipColorMap(stations) {
    const ships = [...new Set(stations.map(s => s.ship || "Unknown"))];
    return Object.fromEntries(
        ships.map((ship, i) => [ship, MARKER_COLORS[i % MARKER_COLORS.length]])
    );
}

/**
 * Splits flat Point features into separate closed loops so no
 * diagonal artifact line is drawn between disconnected EEZ regions.
 */
function extractEEZLoops(geojson) {
    const points = geojson.features
        .filter(f => f.geometry?.type === "Point")
        .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);

    const loops = [];
    let loop = [points[0]];

    for (let i = 1; i < points.length; i++) {
        const pt    = points[i];
        const start = loop[0];
        loop.push(pt);

        const closes =
            Math.abs(pt[0] - start[0]) < 0.0001 &&
            Math.abs(pt[1] - start[1]) < 0.0001;

        if (closes && loop.length > 2) {
            loops.push(loop);
            if (i + 1 < points.length) {
                loop = [points[i + 1]];
                i++;
            } else {
                loop = [];
            }
        }
    }

    if (loop.length > 1) loops.push(loop);
    return loops;
}

// ==========================================
// BOX SELECT HANDLER (Shift + drag)
// ==========================================
function BoxSelectHandler({ onBoundsChange }) {
    const dragStart  = useRef(null);
    const isDragging = useRef(false);

    useMapEvents({
        mousedown(e) {
            if (!e.originalEvent.shiftKey) return;
            e.target.dragging.disable();
            isDragging.current = true;
            dragStart.current  = e.latlng;
            onBoundsChange(null, "drawing");
        },

        mousemove(e) {
            if (!isDragging.current || !dragStart.current) return;
            const start = dragStart.current;
            const end   = e.latlng;
            onBoundsChange({
                latMin: Math.min(start.lat, end.lat),
                latMax: Math.max(start.lat, end.lat),
                lonMin: Math.min(start.lng, end.lng),
                lonMax: Math.max(start.lng, end.lng),
            }, "drawing");
        },

        mouseup(e) {
            if (!isDragging.current || !dragStart.current) return;
            e.target.dragging.enable();
            isDragging.current = false;

            const start = dragStart.current;
            const end   = e.latlng;
            dragStart.current = null;

            const latMin = Math.min(start.lat, end.lat);
            const latMax = Math.max(start.lat, end.lat);
            const lonMin = Math.min(start.lng, end.lng);
            const lonMax = Math.max(start.lng, end.lng);

            // Ignore tiny accidental clicks
            if (Math.abs(latMax - latMin) < 0.01 && Math.abs(lonMax - lonMin) < 0.01) {
                onBoundsChange(null, "done");
                return;
            }

            onBoundsChange({ latMin, latMax, lonMin, lonMax }, "done");
        },
    });

    return null;
}

// ==========================================
// MAPVIEW COMPONENT
// ==========================================
export default function MapView({
    stations = [],
    onSelectStation,
    onOpenProfile,
    profileFile,
    onCloseProfile,
    spatialBounds,
    onSpatialBoundsChange,
}) {
    const [activeShip, setActiveShip] = useState("all");
    const [eezLoops,   setEezLoops]   = useState([]);
    const [previewBox, setPreviewBox] = useState(null);

    useEffect(() => {
        fetch("/data/india_eez.geojson")
            .then(res => res.json())
            .then(data => setEezLoops(extractEEZLoops(data)))
            .catch(err => console.error("Failed to load EEZ GeoJSON:", err));
    }, []);

    const shipColorMap = generateShipColorMap(stations);
    const ships        = Object.keys(shipColorMap);

    const filteredStations = activeShip === "all"
        ? stations
        : stations.filter(s => s.ship === activeShip);

    const handleBoxChange = useCallback((bounds, phase) => {
        if (phase === "drawing") {
            setPreviewBox(bounds);
        } else {
            setPreviewBox(null);
            onSpatialBoundsChange(bounds);
        }
    }, [onSpatialBoundsChange]);

    const toPositions = (b) =>
        b ? [[b.latMin, b.lonMin], [b.latMax, b.lonMax]] : null;

    return (
        <div style={{ height: "100%", position: "relative" }}>
            <MapContainer
                center={[12, 85]}
                zoom={4}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution="Tiles &copy; Esri"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />

                {/* Shift+drag box select */}
                <BoxSelectHandler onBoundsChange={handleBoxChange} />

                {/* EEZ boundary loops */}
                {eezLoops.map((loop, idx) => (
                    <Polyline key={`eez-${idx}`} positions={loop} pathOptions={EEZ_STYLE} />
                ))}

                {/* Committed spatial bounding box */}
                {toPositions(spatialBounds) && (
                    <Rectangle bounds={toPositions(spatialBounds)} pathOptions={BOX_STYLE} />
                )}

                {/* Live preview while dragging */}
                {toPositions(previewBox) && (
                    <Rectangle
                        bounds={toPositions(previewBox)}
                        pathOptions={{ ...BOX_STYLE, opacity: 0.4, fillOpacity: 0.04 }}
                    />
                )}

                {/* Station markers */}
                {filteredStations.map((station, index) => {
                    const lat = Number(station.latitude);
                    const lon = Number(station.longitude);
                    if (isNaN(lat) || isNaN(lon)) return null;

                    const color      = shipColorMap[station.ship] || "#3498db";
                    const hasProfile = (
                        station.file_name &&
                        !["n/a", "nan"].includes(station.file_name.trim().toLowerCase())
                    );

                    return (
                        <CircleMarker
                            key={index}
                            center={[lat, lon]}
                            radius={6}
                            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
                            eventHandlers={{ click: () => onSelectStation(station) }}
                        >
                            <Popup>
                                <div className="popup-content">
                                    <p><b>Ship:</b>     {station.ship}</p>
                                    <p><b>Cruise:</b>   {station.cruise}</p>
                                    <p><b>Station:</b>  {station.station}</p>
                                    <p><b>Datetime:</b> {station.datetime}</p>
                                    <p><b>Depth:</b>    {station.depth}</p>
                                    <p><b>Lat:</b>      {lat.toFixed(4)}</p>
                                    <p><b>Lon:</b>      {lon.toFixed(4)}</p>
                                    <button
                                        className="popup-profile-btn"
                                        type="button"
                                        onClick={() => onOpenProfile(station.file_name)}
                                        disabled={!hasProfile}
                                    >
                                        View Profile
                                    </button>
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            <Legend
                activeShip={activeShip}
                shipColorMap={shipColorMap}
                ships={ships}
                onSelectShip={setActiveShip}
            />

            {profileFile && (
                <ProfilePlots stationFile={profileFile} onClose={onCloseProfile} />
            )}
        </div>
    );
}