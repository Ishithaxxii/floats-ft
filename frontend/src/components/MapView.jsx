import { useState, useEffect, useRef, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Rectangle,
    Polyline,
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
    opacity: 0.8,
    fillColor: "#ffff00",
    fillOpacity: 0.05,
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
// INSTRUMENT SHAPE SVG ICONS
// circle = CTD, triangle = XBT, diamond = XCTD
// ==========================================
function makeInstrumentIcon(instrumentType, color) {
    const size = 14;
    let shapeSvg;

    if (instrumentType === "ctd") {
        // Filled circle
        shapeSvg = `<circle cx="7" cy="7" r="5.5" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    } else if (instrumentType === "xbt") {
        // Upward triangle
        shapeSvg = `<polygon points="7,1.5 13,12.5 1,12.5" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    } else {
        // Diamond (XCTD)
        shapeSvg = `<polygon points="7,1 13,7 7,13 1,7" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    }

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14">
            ${shapeSvg}
        </svg>`;

    return L.divIcon({
        html: svg,
        className: "",          // suppress Leaflet's default white box
        iconSize:   [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor:[0, -size / 2],
    });
}

// ==========================================
// HELPERS
// ==========================================
function generateShipColorMap(stations) {
    const ships = [...new Set(stations.map(s => s.ship || "Unknown"))];
    return Object.fromEntries(
        ships.map((ship, i) => [ship, MARKER_COLORS[i % MARKER_COLORS.length]])
    );
}

function extractEEZLoops(geojson) {
    const points = geojson.features
        .filter(f => f.geometry?.type === "Point")
        .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);

    if (points.length === 0) return [];

    const loops = [];
    let currentLoop = [points[0]];
    const BREAK_THRESHOLD = 3.0;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const distance = Math.sqrt(
            Math.pow(curr[0] - prev[0], 2) +
            Math.pow(curr[1] - prev[1], 2)
        );
        if (distance > BREAK_THRESHOLD) {
            if (currentLoop.length > 1) loops.push(currentLoop);
            currentLoop = [curr];
        } else {
            currentLoop.push(curr);
        }
    }
    if (currentLoop.length > 1) loops.push(currentLoop);
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
// SHIFT+DRAG HINT OVERLAY
// ==========================================
function ShiftDragHint({ spatialBounds }) {
    if (spatialBounds) return null;       // hide once a box is drawn
    return (
        <div style={{
            position:     "absolute",
            bottom:       "24px",
            left:         "50%",
            transform:    "translateX(-50%)",
            zIndex:       1000,
            background:   "rgba(0,0,0,0.55)",
            color:        "#fff",
            fontSize:     "12px",
            padding:      "5px 10px",
            borderRadius: "4px",
            pointerEvents:"none",
            whiteSpace:   "nowrap",
            userSelect:   "none",
        }}>
            ⇧ Shift + drag to select a region
        </div>
    );
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

    // Track the full selected station so ProfilePlots gets type too
    const [profileStation, setProfileStation] = useState(null);

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

    // Open profile — store full station object, not just file_name
    const handleOpenProfile = useCallback((station) => {
        setProfileStation(station);
        onOpenProfile(station.file_name);   // keeps parent profileFile in sync
    }, [onOpenProfile]);

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

                <BoxSelectHandler onBoundsChange={handleBoxChange} />

                {eezLoops.map((loop, idx) => (
                    <Polyline key={idx} positions={loop} pathOptions={EEZ_STYLE} />
                ))}

                {toPositions(spatialBounds) && (
                    <Rectangle bounds={toPositions(spatialBounds)} pathOptions={BOX_STYLE} />
                )}
                {toPositions(previewBox) && (
                    <Rectangle
                        bounds={toPositions(previewBox)}
                        pathOptions={{ ...BOX_STYLE, opacity: 0.4, fillOpacity: 0.04 }}
                    />
                )}

                {/* Station markers — shape by instrument, color by ship */}
                {filteredStations.map((station, index) => {
                    const lat = Number(station.latitude);
                    const lon = Number(station.longitude);
                    if (isNaN(lat) || isNaN(lon)) return null;

                    const color      = shipColorMap[station.ship] || "#3498db";
                    const icon       = makeInstrumentIcon(station.type, color);
                    const hasProfile = (
                        station.file_name &&
                        !["n/a", "nan"].includes(station.file_name.trim().toLowerCase())
                    );

                    return (
                        <Marker
                            key={`${station.type}-${index}`}
                            position={[lat, lon]}
                            icon={icon}
                            eventHandlers={{ click: () => onSelectStation(station) }}
                        >
                            <Popup>
                                <div className="popup-content">
                                    <p><b>Instrument:</b> {station.type?.toUpperCase()}</p>
                                    <p><b>Ship:</b>       {station.ship}</p>
                                    <p><b>Cruise:</b>     {station.cruise}</p>
                                    <p><b>Station:</b>    {station.station}</p>
                                    <p><b>Datetime:</b>   {station.datetime}</p>
                                    <p><b>Depth:</b>      {station.depth}</p>
                                    <p><b>Lat:</b>        {lat.toFixed(4)}</p>
                                    <p><b>Lon:</b>        {lon.toFixed(4)}</p>
                                    <button
                                        className="popup-profile-btn"
                                        type="button"
                                        onClick={() => handleOpenProfile(station)}
                                        disabled={!hasProfile}
                                    >
                                        View Profile
                                    </button>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Shift+drag hint — bottom-center of map, hides after box drawn */}
            <ShiftDragHint spatialBounds={spatialBounds} />

            <Legend
                activeShip={activeShip}
                shipColorMap={shipColorMap}
                ships={ships}
                onSelectShip={setActiveShip}
            />

            {/* Pass full station to ProfilePlots so it can include ?type= */}
            {profileFile && (
                <ProfilePlots
                    stationFile={profileFile}
                    stationType={profileStation?.type}
                    onClose={onCloseProfile}
                />
            )}
        </div>
    );
}