import React, { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import ProfilePlots from "./ProfilePlots";
import Legend from "./Legend";

// ==========================================
// FIX DEFAULT MARKER ICON ISSUE
// ==========================================
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const MARKER_COLORS = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
    "#00bcd4", "#8bc34a", "#ff5722", "#607d8b",
    "#795548", "#ffc107", "#673ab7", "#009688",
];

function generateShipColorMap(stations) {
    const ships = [...new Set(stations.map(s => s.ship || "Unknown"))];
    const colorMap = {};
    ships.forEach((ship, i) => {
        colorMap[ship] = MARKER_COLORS[i % MARKER_COLORS.length];
    });
    return colorMap;
}

// ==========================================
// MAPVIEW COMPONENT
// ==========================================
export default function MapView({
    stations = [],
    onSelectStation,
    profileFile,
    onCloseProfile,
}) {
    const [activeShip, setActiveShip] = useState("all");

    const shipColorMap = generateShipColorMap(stations);
    const ships = Object.keys(shipColorMap);

    const filteredStations =
        activeShip === "all"
            ? stations
            : stations.filter(s => s.ship === activeShip);

    return (
        <div style={{ height: "100%", position: "relative" }}>

            <MapContainer
                center={[12, 85]}
                zoom={4}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='Tiles &copy; Esri'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />

                {filteredStations.map((station, index) => {
                    const lat = Number(station.latitude);
                    const lon = Number(station.longitude);
                    if (isNaN(lat) || isNaN(lon)) return null;

                    const color = shipColorMap[station.ship] || "#3498db";

                    return (
                        <CircleMarker
                            key={index}
                            center={[lat, lon]}
                            radius={6}
                            pathOptions={{
                                color,
                                fillColor: color,
                                fillOpacity: 0.85,
                                weight: 1,
                            }}
                            eventHandlers={{
                                click: () => onSelectStation(station),
                            }}
                        >
                            <Popup>
                                <div className="popup-content">
                                    <p><b>Ship:</b> {station.ship}</p>
                                    <p><b>Cruise:</b> {station.cruise}</p>
                                    <p><b>Station:</b> {station.station}</p>
                                    <p><b>Datetime:</b> {station.datetime}</p>
                                    <p><b>Depth:</b> {station.depth}</p>
                                    <p><b>Lat:</b> {lat.toFixed(4)}</p>
                                    <p><b>Lon:</b> {lon.toFixed(4)}</p>
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
                <ProfilePlots
                    stationFile={profileFile}
                    onClose={onCloseProfile}
                />
            )}

        </div>
    );
}