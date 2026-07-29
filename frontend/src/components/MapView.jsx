import { useState, useEffect, useRef, useCallback, Component, useMemo, memo } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Rectangle,
    Polyline,
    useMapEvents,
} from "react-leaflet";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label
} from "recharts";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const Plot = createPlotlyComponent(Plotly);

export function Navbar() {
    return (
        <div className="navbar">
            <div className="navbar-logo">
                🌊 SeaSnap
            </div>
            <div className="navbar-title">
                CTD Data Visualization
            </div>
        </div>
    );
}
// ==========================================
// Sidebar.jsx
// ==========================================

// ==========================================
// PER-TYPE LOADING INDICATORS
// ==========================================
function LoadingStatus({ loadingTypes, error }) {
    const types = ["ctd", "xbt", "xctd"];
    const anyLoading = loadingTypes && Object.values(loadingTypes).some(Boolean);

    if (!anyLoading && !error) return null;

    return (
        <div style={{ padding: "6px 0" }}>
            {types.map(t => {
                const isLoading = loadingTypes?.[t];
                if (!isLoading) return null;
                return (
                    <div key={t} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        fontSize: "12px", color: "#aaa", padding: "2px 0"
                    }}>
                        <div style={{
                            width: "10px", height: "10px",
                            border: "2px solid #444", borderTop: "2px solid #3498db",
                            borderRadius: "50%",
                            animation: "seasnap-spin 0.75s linear infinite",
                            flexShrink: 0,
                        }}/>
                        Loading {t.toUpperCase()}…
                    </div>
                );
            })}
            {error && <p className="sidebar-status error" style={{ marginTop: "4px" }}>{error}</p>}
            <style>{`@keyframes seasnap-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ==========================================
// TEMPORAL FILTER
// ==========================================
function TemporalFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange, onReset, onApply }) {
    return (
        <section className="filter-card">
            <div className="filter-header">
                <h3>Time Range</h3>
                <button type="button" className="reset-btn" onClick={onReset}>Reset</button>
            </div>
            <label className="filter-label">
                <span>From</span>
                <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
            </label>
            <label className="filter-label">
                <span>To</span>
                <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
            </label>
            <button
                type="button"
                onClick={onApply}
                style={{
                    marginTop: "8px", width: "100%", padding: "6px 0",
                    background: "#1a6fa8", color: "#fff", border: "none",
                    borderRadius: "5px", fontSize: "13px", cursor: "pointer",
                }}
            >
                Go
            </button>
        </section>
    );
}

// ==========================================
// SPATIAL BOUNDS DISPLAY
// ==========================================
function SpatialBounds({
    bounds, onClear,
    spatialLoading, spatialProfileData,
    onViewSpatialProfile, onFetchSpatialProfile,
    onApplyBounds
}) {
    const [local, setLocal] = useState({ latMin: "", latMax: "", lonMin: "", lonMax: "" });

    useEffect(() => {
        if (bounds) {
            setLocal({
                latMin: bounds.latMin?.toFixed(6) ?? "",
                latMax: bounds.latMax?.toFixed(6) ?? "",
                lonMin: bounds.lonMin?.toFixed(6) ?? "",
                lonMax: bounds.lonMax?.toFixed(6) ?? "",
            });
        } else {
            setLocal({ latMin: "", latMax: "", lonMin: "", lonMax: "" });
        }
    }, [bounds]);

    const onChange = (field, value) => setLocal(prev => ({ ...prev, [field]: value }));

    const applyManual = () => {
        const parsed = {
            latMin: parseFloat(local.latMin),
            latMax: parseFloat(local.latMax),
            lonMin: parseFloat(local.lonMin),
            lonMax: parseFloat(local.lonMax),
        };
        if ([parsed.latMin, parsed.latMax, parsed.lonMin, parsed.lonMax].some(v => Number.isNaN(v))) return;
        onApplyBounds(parsed);
    };

    if (!bounds) {
        return (
            <section className="filter-card">
                <h3>Spatial Filter</h3>
                <p className="hint-text">
                    Hold <kbd>Shift</kbd> and drag on the map to draw a bounding box, or use the draw toggle.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <input placeholder="Lat min" value={local.latMin} onChange={(e) => onChange("latMin", e.target.value)} />
                    <input placeholder="Lat max" value={local.latMax} onChange={(e) => onChange("latMax", e.target.value)} />
                    <input placeholder="Lon min" value={local.lonMin} onChange={(e) => onChange("lonMin", e.target.value)} />
                    <input placeholder="Lon max" value={local.lonMax} onChange={(e) => onChange("lonMax", e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={applyManual} style={{ flex: 1 }}>Apply</button>
                    <button type="button" onClick={onClear} style={{ flex: 1 }}>Clear</button>
                </div>
            </section>
        );
    }

    return (
        <section className="filter-card active-bounds">
            <div className="filter-header">
                <h3>Spatial Filter</h3>
                <button type="button" className="reset-btn" onClick={onClear}>Clear</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 12 }}>Lat min
                    <input value={local.latMin} onChange={(e) => onChange("latMin", e.target.value)} />
                </label>
                <label style={{ fontSize: 12 }}>Lat max
                    <input value={local.latMax} onChange={(e) => onChange("latMax", e.target.value)} />
                </label>
                <label style={{ fontSize: 12 }}>Lon min
                    <input value={local.lonMin} onChange={(e) => onChange("lonMin", e.target.value)} />
                </label>
                <label style={{ fontSize: 12 }}>Lon max
                    <input value={local.lonMax} onChange={(e) => onChange("lonMax", e.target.value)} />
                </label>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                    type="button"
                    onClick={applyManual}
                    style={{ flex: 1, padding: "7px 0", background: "#2c5f2e", color: "#fff", border: "none", borderRadius: "5px", fontSize: "13px", cursor: "pointer" }}
                >
                    Apply Coordinates
                </button>

                {!spatialLoading && (
                    <button
                        type="button"
                        onClick={onFetchSpatialProfile}
                        style={{ flex: 1, padding: "7px 0", background: "#1a6fa8", color: "#fff", border: "none", borderRadius: "5px", fontSize: "13px", cursor: "pointer" }}
                    >
                        {spatialProfileData ? "↻ Reload Profiles" : "⬇ Load Profiles"}
                    </button>
                )}
            </div>

            {/* Spinner while loading */}
            {spatialLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "12px", color: "#aaa" }}>
                    <div style={{
                        width: "10px", height: "10px", flexShrink: 0,
                        border: "2px solid #444", borderTop: "2px solid #3498db",
                        borderRadius: "50%", animation: "seasnap-spin 0.75s linear infinite",
                    }}/>
                    Fetching profiles… this may take a moment.
                    <style>{`@keyframes seasnap-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* View button after data is ready */}
            {!spatialLoading && spatialProfileData && spatialProfileData.station_count > 0 && (
                <button
                    type="button"
                    onClick={onViewSpatialProfile}
                    style={{
                        marginTop: "6px", width: "100%", padding: "7px 0",
                        background: "#1a6fa8", color: "#fff", border: "none",
                        borderRadius: "5px", fontSize: "13px", cursor: "pointer",
                    }}
                >
                    View Profiles ({spatialProfileData.station_count} stations,{" "}
                    {spatialProfileData.row_count?.toLocaleString()} obs)
                </button>
            )}

            {!spatialLoading && spatialProfileData && spatialProfileData.station_count === 0 && (
                <p style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
                    No stations found in this region.
                </p>
            )}

            {/* Restricted stations note — backend excludes these from the results entirely */}
            {!spatialLoading && spatialProfileData && spatialProfileData.restricted_count > 0 && (
                <p style={{ fontSize: "12px", color: "#e6a23c", marginTop: "8px" }}>
                    {spatialProfileData.restricted_count} station
                    {spatialProfileData.restricted_count === 1 ? "" : "s"} in this region are inside
                    the EEZ and require a data requisition — not included above.
                </p>
            )}
        </section>
    );
}
// ==========================================
// INSTRUMENT KEY TOGGLE
// ==========================================
function InstrumentKey({ activeInstruments, onToggle }) {
    const items = [
        {
            type: "ctd",
            label: "CTD",
            shape: (
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="5.5" fill="#7ec8e3" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
                </svg>
            ),
        },
        {
            type: "xbt",
            label: "XBT",
            shape: (
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <polygon points="7,1.5 13,12.5 1,12.5" fill="#7ec8e3" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
                </svg>
            ),
        },
        {
            type: "xctd",
            label: "XCTD",
            shape: (
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <polygon points="7,1 13,7 7,13 1,7" fill="#7ec8e3" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
                </svg>
            ),
        },
    ];

    return (
        <section className="filter-card">
            <h3>Instrument Types</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                {items.map(({ type, label, shape }) => {
                    const isActive = activeInstruments.includes(type);
                    return (
                        <div
                            key={type}
                            onClick={() => onToggle(type)}
                            style={{
                                display:       "flex",
                                alignItems:    "center",
                                gap:           "10px",
                                fontSize:      "13px",
                                color:         isActive ? "#fff" : "#555",
                                cursor:        "pointer",
                                padding:       "4px 6px",
                                borderRadius:  "4px",
                                background:    isActive ? "#1e3a50" : "transparent",
                                border:        `1px solid ${isActive ? "#1a6fa8" : "transparent"}`,
                                userSelect:    "none",
                                transition:    "all 0.15s",
                                opacity:       isActive ? 1 : 0.45,
                            }}
                        >
                            {shape}
                            <span>{label}</span>
                            <span style={{ marginLeft: "auto", fontSize: "10px", color: "#666" }}>
                                {isActive ? "●" : "○"}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p style={{ fontSize: "11px", color: "#555", marginTop: "8px", marginBottom: 0 }}>
                Click to show/hide · Marker color = ship
            </p>
        </section>
    );
}

// ==========================================
// SIDEBAR
// ==========================================
export function Sidebar({
    stationCount,
    filteredCount,
    query,
    setQuery,
    loading,
    error,
    onRefresh,
    selectedStation,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    onDateReset,
    onApplyDateFilter,
    spatialBounds,
    onSpatialClear,
    loadingTypes,
    spatialLoading,
    spatialProfileData,
    onViewSpatialProfile,
    activeInstruments,
    onInstrumentToggle,
    onFetchSpatialProfile,
    onApplyBounds,
}) {
    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-panel">
                <h2>OceanGrid</h2>

                <section className="search-card">
                    <label>
                        <span>Search stations</span>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ship, station, cruise, file..."
                        />
                    </label>
                    <div className="count-row">
                        <strong>{filteredCount}</strong>
                        <span>shown of {stationCount}</span>
                    </div>
                    <button type="button" onClick={onRefresh} disabled={loading}>
                        {loading ? "Loading..." : "Refresh Stations"}
                    </button>
                </section>

                <LoadingStatus loadingTypes={loadingTypes} error={error} />

                <TemporalFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={onDateFromChange}
                    onDateToChange={onDateToChange}
                    onReset={onDateReset}
                    onApply={onApplyDateFilter}
                />

                <SpatialBounds
                    bounds={spatialBounds}
                    onClear={onSpatialClear}
                    spatialLoading={spatialLoading}
                    spatialProfileData={spatialProfileData}
                    onViewSpatialProfile={onViewSpatialProfile}
                    onFetchSpatialProfile={onFetchSpatialProfile}
                    onApplyBounds={onApplyBounds}
                />

                <InstrumentKey
                    activeInstruments={activeInstruments}
                    onToggle={onInstrumentToggle}
                />
            </div>
        </aside>
    );
}

function Legend({
    activeShip, shipColorMap, ships, onSelectShip, drawMode, onToggleDraw,
    showOutsideEEZ, setShowOutsideEEZ, showInsideEEZ, setShowInsideEEZ,
}) {
    return (
        <aside className="map-legend">
            <h3>Ships</h3>
            <button
                className={`legend-filter ${activeShip === "all" ? "active" : ""}`}
                type="button"
                onClick={() => onSelectShip("all")}
            >
                Show All
            </button>

            <div className="legend-items">
                {ships.length === 0 ? (
                    <p>No ships loaded</p>
                ) : (
                    ships.map((ship) => (
                        <button
                            className={`legend-item ${activeShip === ship ? "active" : ""}`}
                            key={ship}
                            type="button"
                            onClick={() => onSelectShip(ship)}
                        >
                            <span style={{ background: shipColorMap[ship] }} />
                            {ship}
                        </button>
                    ))
                )}
            </div>
            <div style={{ marginTop: 10 }}>
                <button
                    type="button"
                    onClick={() => onToggleDraw && onToggleDraw(!drawMode)}
                    className={`legend-draw-toggle ${drawMode ? "active" : ""}`}
                    style={{
                        width: "100%",
                        padding: "8px 0",
                        borderRadius: 6,
                        border: "none",
                        background: drawMode ? "#2c5f2e" : "#1a6fa8",
                        color: "#fff",
                        cursor: "pointer",
                    }}
                >
                    {drawMode ? "Drawing: Mouse" : "Draw Bounding Box"}
                </button>
            </div>

            {/* Inside/Outside EEZ visibility toggle */}
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd" }}>
                    <input
                        type="checkbox"
                        checked={showOutsideEEZ}
                        onChange={() => setShowOutsideEEZ(v => !v)}
                    />
                    Outside EEZ
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd" }}>
                    <input
                        type="checkbox"
                        checked={showInsideEEZ}
                        onChange={() => setShowInsideEEZ(v => !v)}
                    />
                    Inside EEZ
                </label>
            </div>
        </aside>
    );
}



const TS_QC_COLORS = {
    1: "#2ecc71", 2: "#f1c40f", 3: "#ff8c00", 4: "#e74c3c", 9: "#95a5a6",
};
const TS_QC_LABELS = {
    1: "1 - Good", 2: "2 - Probably Good", 3: "3 - Probably Bad",
    4: "4 - Bad",  9: "9 - Missing",
};

// ==========================================
// SIGMA-T (UNESCO/EOS-80)
// ==========================================
function sigmaT(S, T) {
    const rho0 =
        999.842594 + 6.793952e-2 * T - 9.09529e-3 * T ** 2 +
        1.001685e-4 * T ** 3 - 1.120083e-6 * T ** 4 + 6.536332e-9 * T ** 5;
    const A =
        8.24493e-1 - 4.0899e-3 * T + 7.6438e-5 * T ** 2 -
        8.2467e-7 * T ** 3 + 5.3875e-9 * T ** 4;
    const B = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * T ** 2;
    const C = 4.8314e-4;
    return rho0 + A * S + B * S ** 1.5 + C * S ** 2 - 1000;
}

// ==========================================
// MARCHING SQUARES — all 4 cell edges
// Returns points in traversal order so lines
// don't zigzag when sorted by x.
// ==========================================
function marchingSquareContour(grid, sVals, tVals, level) {
    const nS = sVals.length - 1;   // columns
    const nT = tVals.length - 1;   // rows
    const sStep = sVals[1] - sVals[0];
    const tStep = tVals[1] - tVals[0];

    // Collect all crossing segments as pairs of points
    const segments = [];

    for (let j = 0; j < nT; j++) {
        for (let i = 0; i < nS; i++) {
            const v00 = grid[j][i];
            const v10 = grid[j][i + 1];
            const v01 = grid[j + 1][i];
            const v11 = grid[j + 1][i + 1];

            const crossings = [];

            // Bottom edge (j, i→i+1)
            if ((v00 - level) * (v10 - level) < 0) {
                const frac = (level - v00) / (v10 - v00);
                crossings.push({ x: sVals[i] + frac * sStep, y: tVals[j] });
            }
            // Top edge (j+1, i→i+1)
            if ((v01 - level) * (v11 - level) < 0) {
                const frac = (level - v01) / (v11 - v01);
                crossings.push({ x: sVals[i] + frac * sStep, y: tVals[j + 1] });
            }
            // Left edge (i, j→j+1)
            if ((v00 - level) * (v01 - level) < 0) {
                const frac = (level - v00) / (v01 - v00);
                crossings.push({ x: sVals[i], y: tVals[j] + frac * tStep });
            }
            // Right edge (i+1, j→j+1)
            if ((v10 - level) * (v11 - level) < 0) {
                const frac = (level - v10) / (v11 - v10);
                crossings.push({ x: sVals[i + 1], y: tVals[j] + frac * tStep });
            }

            // Each cell contributes exactly 0 or 2 crossings for a clean isoline
            if (crossings.length === 2) {
                segments.push(crossings);
            }
        }
    }

    if (segments.length === 0) return [];

    // Chain segments into a polyline by nearest-endpoint matching
    // (avoids the zigzag from sorting all points by x)
    const used = new Array(segments.length).fill(false);
    const chain = [segments[0][0], segments[0][1]];
    used[0] = true;

    for (let iter = 0; iter < segments.length; iter++) {
        const tail = chain[chain.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        let flip = false;

        for (let k = 0; k < segments.length; k++) {
            if (used[k]) continue;
            const d0 = Math.hypot(segments[k][0].x - tail.x, segments[k][0].y - tail.y);
            const d1 = Math.hypot(segments[k][1].x - tail.x, segments[k][1].y - tail.y);
            if (d0 < bestDist) { bestDist = d0; bestIdx = k; flip = false; }
            if (d1 < bestDist) { bestDist = d1; bestIdx = k; flip = true;  }
        }

        // Stop chaining if the nearest unvisited segment is far away
        // (means we've finished this connected component)
        const threshold = Math.max(sStep, tStep) * 2.5;
        if (bestIdx === -1 || bestDist > threshold) break;

        used[bestIdx] = true;
        chain.push(flip ? segments[bestIdx][0] : segments[bestIdx][1]);
    }

    return chain;
}

// ==========================================
// BUILD ALL SIGMA-T CONTOUR TRACES + LABELS
// ==========================================
function buildSigmaTContours(salinityRange, tempRange) {
    const [sMin, sMax] = salinityRange;
    const [tMin, tMax] = tempRange;

    const n     = 50;   // finer grid than before
    const sStep = (sMax - sMin) / n;
    const tStep = (tMax - tMin) / n;

    const sVals = Array.from({ length: n + 1 }, (_, i) => sMin + i * sStep);
    const tVals = Array.from({ length: n + 1 }, (_, j) => tMin + j * tStep);
    const grid  = tVals.map(t => sVals.map(s => sigmaT(s, t)));

    const allValues = grid.flat();
    const sigmaMin  = Math.ceil(Math.min(...allValues));
    const sigmaMax  = Math.floor(Math.max(...allValues));

    const traces = [];

    for (let level = sigmaMin; level <= sigmaMax; level++) {
        const chain = marchingSquareContour(grid, sVals, tVals, level);
        if (chain.length < 2) continue;

        // Contour line
        traces.push({
            x:          chain.map(p => p.x),
            y:          chain.map(p => p.y),
            mode:       "lines",
            type:       "scatter",
            line:       { color: "rgba(150,150,170,0.55)", width: 1.5 },
            hoverinfo:  "skip",
            showlegend: false,
        });

        // Label at rightmost point (right-side label)
        const rightmost = chain.reduce((best, p) => p.x > best.x ? p : best, chain[0]);

        // Label at leftmost point (left-side label) — only if contour is wide enough
        const leftmost  = chain.reduce((best, p) => p.x < best.x ? p : best, chain[0]);
        const spanS     = rightmost.x - leftmost.x;

        traces.push({
            x:            [rightmost.x],
            y:            [rightmost.y],
            mode:         "text",
            type:         "scatter",
            text:         [`σt ${level}`],
            textposition: "middle right",
            textfont:     { color: "#8899aa", size: 10, family: "monospace" },
            hoverinfo:    "skip",
            showlegend:   false,
        });

        // Add left-side label only when the contour spans >30% of the salinity range
        // — avoids cluttering short contours near the corners
        if (spanS > (sMax - sMin) * 0.3) {
            traces.push({
                x:            [leftmost.x],
                y:            [leftmost.y],
                mode:         "text",
                type:         "scatter",
                text:         [`σt ${level}`],
                textposition: "middle left",
                textfont:     { color: "#8899aa", size: 10, family: "monospace" },
                hoverinfo:    "skip",
                showlegend:   false,
            });
        }
    }

    return traces;
}

// ==========================================
// QC SUMMARY PANEL
// ==========================================
function QCSummary({ data }) {
    const total  = data.length;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 9: 0 };
    data.forEach(d => {
        const qc = Number(d.ALL_TESTS_QC);
        if (counts[qc] !== undefined) counts[qc]++;
    });

    return (
        <div className="qc-summary-panel">
            <h4 className="qc-summary-title">QC Summary</h4>
            <table className="qc-summary-table">
                <tbody>
                    {[1, 2, 3, 4, 9].map(qc => {
                        const count = counts[qc];
                        const pct   = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
                        return (
                            <tr key={qc}>
                                <td className="qc-summary-label">{TS_QC_LABELS[qc]}</td>
                                <td className="qc-summary-value" style={{ color: TS_QC_COLORS[qc] }}>
                                    {count.toLocaleString()} ({pct}%)
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ==========================================
// MAIN T-S DIAGRAM
// ==========================================
function minMax(arr) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return [min, max];
}

function TSDiagram({ data }) {
    if (!data?.length) return null;

    // XBT has no salinity — show a clear message instead of a blank diagram
    const hasSalinity = data.some(d => d.SAL_QC_VAR != null);
    const hasTemp     = data.some(d => d.TEMP_QC_VAR != null);

    if (!hasSalinity || !hasTemp) {
        return (
            <div className="ts-diagram-container" style={{ padding: "1.5rem" }}>
                <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>
                    T-S diagram not available for this instrument type
                    {!hasSalinity ? " (no salinity data)" : " (no temperature data)"}.
                </p>
                <QCSummary data={data} />
            </div>
        );
    }

    const validPoints = data.filter(d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null);
    const salinities  = validPoints.map(d => d.SAL_QC_VAR);
    const temps       = validPoints.map(d => d.TEMP_QC_VAR);

    const [sMin, sMax] = minMax(salinities);
    const [tMin, tMax] = minMax(temps);

    // Padding so contour labels aren't clipped at the axis edge
    const sPad = (sMax - sMin) * 0.08 || 0.2;
    const tPad = (tMax - tMin) * 0.08 || 0.2;

    const contourTraces = buildSigmaTContours(
        [sMin - sPad, sMax + sPad],
        [tMin - tPad, tMax + tPad]
    );

    const qcGroups = [1, 2, 3, 4, 9].map(qc => {
        const filtered = data.filter(
            d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null && Number(d.ALL_TESTS_QC) === qc
        );
        return {
            x:    filtered.map(d => d.SAL_QC_VAR),
            y:    filtered.map(d => d.TEMP_QC_VAR),
            mode: "markers",
            type: "scatter",
            name: TS_QC_LABELS[qc],
            marker: {
                color:   TS_QC_COLORS[qc],
                size:    11,
                opacity: 0.9,
                line:    { width: 0 },
            },
            customdata:    filtered.map(d => [d.depSM, d.ALL_TESTS_QC]),
            hovertemplate:
                "Salinity: %{x:.3f}<br>" +
                "Temperature: %{y:.3f} °C<br>" +
                "Depth: %{customdata[0]} m<br>" +
                "QC: %{customdata[1]}<extra></extra>",
        };
    });

    const axisStyle = {
        gridcolor:     "#3a3a4a",
        gridwidth:     1.5,
        zerolinecolor: "#3a3a4a",
        zerolinewidth: 1.5,
        tickfont:      { size: 14, color: "#aaa" },
        titlefont:     { size: 18, color: "#aaa" },
        linecolor:     "#444",
        linewidth:     2,
    };

    return (
        <div className="ts-diagram-container">
            <div className="ts-diagram-plot">
                <Plot
                    data={[...contourTraces, ...qcGroups]}
                    layout={{
                        title: {
                            text: "Temperature–Salinity Diagram (QC Colored)",
                            font: { size: 24, color: "#eaeaea" },
                        },
                        autosize:      true,
                        paper_bgcolor: "#1e1e2e",
                        plot_bgcolor:  "#1e1e2e",
                        font:          { color: "#aaa" },
                        xaxis: {
                            title: "Salinity (psu)",
                            // widen axis range slightly so right-side labels aren't clipped
                            range: [sMin - sPad, sMax + sPad * 2.5],
                            ...axisStyle,
                        },
                        yaxis: {
                            title: "Potential Temperature (°C)",
                            range: [tMin - tPad, tMax + tPad],
                            ...axisStyle,
                        },
                        legend: {
                            x:           1.02,
                            y:           1,
                            bgcolor:     "#1e1e2e",
                            bordercolor: "#444",
                            borderwidth: 1,
                            font:        { color: "#aaa" },
                        },
                        margin: { l: 80, r: 160, t: 80, b: 80 },
                    }}
                    style={{ width: "100%", height: "900px" }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
            <QCSummary data={data} />
        </div>
    );
}

const API = "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY;

// Shared fetch helper — attaches the API key to every backend call.
// Use this instead of the raw fetch() for anything hitting `API`.
// Static/local assets (e.g. /data/*.geojson) don't need this.
function apiFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            "X-API-Key": API_KEY,
        },
    });
}

// ==========================================
// PLOT CONFIGS
// ==========================================
const PLOT_CONFIGS = [
    { key: "TEMP_QC_VAR", qcKey: "Temp_QC",  label: "Temperature (°C)",       color: "#e74c3c", title: "Temperature Profile"      },
    { key: "SAL_QC_VAR",  qcKey: "Sal_QC",   label: "Salinity (PSU)",          color: "#3498db", title: "Salinity Profile"          },
    { key: "c0S/m",                           label: "Conductivity (S/m)",      color: "#2ecc71", title: "Conductivity Profile"      },
    { key: "sbeox0ML/L",                      label: "Dissolved Oxygen (mL/L)", color: "#f39c12", title: "Dissolved Oxygen Profile"  },
    { key: "sigma-t00",                       label: "Density (kg/m³)",         color: "#9b59b6", title: "Density Profile"           },
    { key: "SoundVelocity (m/s)",             label: "SoundVelocity (m/s)",     color: "#1abc9c", title: "Sound Velocity Profile"},
];

const PROFILE_QC_COLORS = { 1: "#2ecc71", 2: "#f1c40f", 3: "#e67e22", 4: "#e74c3c", 9: "#95a5a6" };

// ==========================================
// ERROR BOUNDARY
// Catches render errors in ProfilePlots or TSDiagram
// so the rest of the app doesn't crash.
// ==========================================
class ProfileErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: "" };
    }

    static getDerivedStateFromError(err) {
        return { hasError: true, message: err?.message || "Unknown error" };
    }

    componentDidCatch(err, info) {
        console.error("[ProfileErrorBoundary]", err, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="profile-overlay">
                    <div className="profile-panel">
                        <div className="profile-header">
                            <h2 className="profile-title">Something went wrong</h2>
                            <button className="profile-close-btn" onClick={this.props.onClose}>✕</button>
                        </div>
                        <p className="profile-status error" style={{ padding: "1rem" }}>
                            {this.state.message}
                        </p>
                        <p style={{ padding: "0 1rem 1rem", color: "#aaa", fontSize: 13 }}>
                            This profile may contain unexpected data. Try another station.
                        </p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// ==========================================
// LOADING SPINNER
// ==========================================
function Spinner() {
    return (
        <div style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            padding:        "3rem 1rem",
            gap:            "1rem",
        }}>
            <div style={{
                width:           "36px",
                height:          "36px",
                border:          "3px solid #444",
                borderTop:       "3px solid #3498db",
                borderRadius:    "50%",
                animation:       "seasnap-spin 0.75s linear infinite",
            }} />
            <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>Loading profile…</p>
            <style>{`@keyframes seasnap-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ==========================================
// SINGLE DEPTH PROFILE CHART
// ==========================================
function DepthProfile({ data, config }) {
    const [selectedQC, setSelectedQC] = useState({ 1: true, 2: true, 3: true, 4: true, 9: true, all: true });

    const qcField = config.qcKey;

    const sorted = useMemo(() => {
        return [...data]
            .filter(d => d[config.key] != null)
            .sort((a, b) => b.depSM - a.depSM);
    }, [data, config.key]);

    const maxDepth = useMemo(() => {
        let max = 0;
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].depSM > max) max = sorted[i].depSM;
        }
        return max;
    }, [sorted]);

    const tickStep =
        maxDepth <= 100  ? 10  :
        maxDepth <= 500  ? 50  :
        maxDepth <= 2000 ? 100 : 500;

    const yTicks = useMemo(() => {
        const ticks = [];
        for (let d = 0; d <= maxDepth; d += tickStep) ticks.push(d);
        return ticks;
    }, [maxDepth, tickStep]);

    const renderDot = useCallback((props) => {
        if (!qcField) return null;
        const qc = Number(props.payload[qcField]);
        if (!selectedQC[qc]) return null;
        return (
            <circle
                key={`dot-${props.index}`}
                cx={props.cx} cy={props.cy} r={5}
                fill={PROFILE_QC_COLORS[qc]} stroke="#fff" strokeWidth={1}
            />
        );
    }, [qcField, selectedQC]);

    if (sorted.length === 0) return null;

    return (
        <div className="profile-chart-card">
            <div className="qc-panel">
                <h4>QC</h4>
                <label className="qc-checkbox" style={{ borderColor: "#aaa", fontWeight: "bold" }}>
                    <input
                        type="checkbox"
                        checked={selectedQC.all}
                        onChange={() => {
                            const next = !selectedQC.all;
                            setSelectedQC({ 1: next, 2: next, 3: next, 4: next, 9: next, all: next });
                        }}
                    />
                    <span className="qc-color" style={{ background: "#aaa" }} />
                    All
                </label>
                {[1, 2, 3, 4, 9].map(qc => (
                    <label key={qc} className="qc-checkbox" style={{ borderColor: PROFILE_QC_COLORS[qc] }}>
                        <input
                            type="checkbox"
                            checked={selectedQC[qc]}
                            onChange={() => setSelectedQC(prev => ({ ...prev, [qc]: !prev[qc] }))}
                        />
                        <span className="qc-color" style={{ background: PROFILE_QC_COLORS[qc] }} />
                        {qc}
                    </label>
                ))}
            </div>

            <h4 className="chart-title">{config.title}</h4>
            <ResponsiveContainer width="100%" height={400}>
                <LineChart data={sorted} layout="vertical" margin={{ top: 10, right: 20, bottom: 30, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                    <XAxis
                        type="number" dataKey={config.key} stroke="#aaa"
                        tick={{ fill: "#aaa", fontSize: 14 }} domain={["auto", "auto"]}
                    >
                        <Label value={config.label} position="insideBottom" offset={-15} fill="#aaa" fontSize={16} />
                    </XAxis>
                    <YAxis
                        type="number" dataKey="depSM" domain={[maxDepth, 0]}
                        ticks={yTicks} stroke="#aaa" tick={{ fill: "#aaa", fontSize: 14 }}
                        width={75} padding={{ top: 10, bottom: 10 }}
                    >
                        <Label value="Depth (m)" angle={-90} position="insideLeft" offset={-10} fill="#aaa" fontSize={16} />
                    </YAxis>
                    <Tooltip
                        contentStyle={{ background: "#1e1e2e", border: "1px solid #444", borderRadius: 6, fontSize: "14px" }}
                        labelFormatter={(val) => `Depth: ${val} m`}
                        formatter={(value, name, props) => [value, `${config.label} (QC ${props.payload[qcField]})`]}
                    />
                    <Line
                        type="monotone" dataKey={config.key}
                        stroke={config.color} strokeWidth={2}
                        isAnimationActive={false}
                        dot={renderDot}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

const MemoizedDepthProfile = memo(DepthProfile);


// ==========================================
// INNER PROFILE PANEL (wrapped by error boundary)
// ==========================================
function ProfilePanel({
    stationFile,
    stationType,

    isSpatial = false,
    spatialData = null,

    onClose
}) {
    const [profileResult, setProfileResult] = useState({ stationFile: null, data: [], error: null, restricted: false });
    const [isLoading,     setIsLoading]     = useState(false);

    useEffect(() => {

    if (isSpatial) {

        setProfileResult({
            stationFile: "spatial",
            data: spatialData?.data || [],
            error: null,
            restricted: false,
        });

        setIsLoading(false);

        return;
    }

    if (!stationFile) return;

    let cancelled = false;

    setIsLoading(true);

    const typeParam =
        stationType
            ? `&type=${stationType}`
            : "";

    const url =
        `${API}/profile/${encodeURIComponent(
            stationFile
        )}?_=${Date.now()}${typeParam}`;

    apiFetch(url)
            .then(res => {
                if (res.status === 403) {
                    // Server-side EEZ restriction — this is the real
                    // enforcement point, independent of any frontend gating.
                    return res.json().then(body => {
                        throw Object.assign(
                            new Error(body?.detail || "This station requires an approved data requisition."),
                            { restricted: true }
                        );
                    });
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (!cancelled) {
                    setProfileResult({ stationFile, data: Array.isArray(data) ? data : [], error: null, restricted: false });
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setProfileResult({ stationFile, data: [], error: err.message, restricted: !!err.restricted });
                    setIsLoading(false);
                }
            });

        return () => { cancelled = true; };
    },[
        stationFile,
        stationType,
        isSpatial,
        spatialData
    ]);


    const isCurrentProfile = profileResult.stationFile === stationFile;
    const error      = isSpatial ? null : (isCurrentProfile ? profileResult.error : null);
    const isRestricted = isSpatial ? false : (isCurrentProfile ? profileResult.restricted : false);
    const profileData = isSpatial
        ? (spatialData?.data || [])
        : (isCurrentProfile ? profileResult.data : []);
        
    const availablePlots    = PLOT_CONFIGS.filter(cfg => profileData.some(d => d[cfg.key] != null));
    const unavailablePlots  = PLOT_CONFIGS.filter(cfg => !profileData.some(d => d[cfg.key] != null));

    return (
        <div className="profile-overlay">
            <div className="profile-panel">
                <div className="profile-header">
                    <div>
                        <h2 className="profile-title">Vertical Profiles</h2>
                        <p className="profile-subtitle">
                            {isSpatial ? (
                                <span>Spatial Region — {spatialData?.station_count} stations across{" "}
                                    {[
                                        spatialData?.ctd_count  > 0 && "CTD",
                                        spatialData?.xbt_count  > 0 && "XBT",
                                        spatialData?.xctd_count > 0 && "XCTD",
                                    ].filter(Boolean).join(", ")}
                                </span>
                            ) : (
                                <>
                                    {stationFile}
                                    {stationType && (
                                        <span style={{
                                            marginLeft: "8px", fontSize: "11px",
                                            background: "#2a2a3e", color: "#7ec8e3",
                                            padding: "2px 7px", borderRadius: "3px",
                                            textTransform: "uppercase", letterSpacing: "0.05em",
                                        }}>
                                            {stationType}
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                    </div>
                    <button className="profile-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Spinner while fetching */}
                {isLoading && <Spinner />}

                {/* Restricted state — server-enforced, separate from generic errors */}
                {!isLoading && isRestricted && (
                    <div style={{
                        margin: "1rem", padding: "12px 14px",
                        background: "#2a2410", border: "1px solid #6b5a1e",
                        borderRadius: "6px", color: "#e6c65c", fontSize: "13px",
                    }}>
                        🔒 This station is inside the EEZ and requires an approved data
                        requisition. Submit a request from the marker popup on the map;
                        the team will email the authorized data once reviewed.
                    </div>
                )}

                {/* Generic error state */}
                {!isLoading && error && !isRestricted && (
                    <p className="profile-status error">Error: {error}</p>
                )}

                {/* Data */}
                {!isLoading && !error && (
                    <>
                    <div className="profile-ts-section">
                        {isSpatial && spatialData && (
                            <div style={{
                                marginBottom: "15px", padding: "10px",
                                background: "#1f2330", borderRadius: "6px",
                                fontSize: "13px", color: "#ddd",
                                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px",
                            }}>
                                <div>Stations: <b>{spatialData.station_count}</b></div>
                                <div>Observations: <b>{spatialData.row_count?.toLocaleString()}</b></div>
                                <div style={{ color: "#7ec8e3" }}>● CTD: {spatialData.ctd_count}</div>
                                <div style={{ color: "#f39c12" }}>▲ XBT: {spatialData.xbt_count}</div>
                                <div style={{ color: "#2ecc71" }}>◆ XCTD: {spatialData.xctd_count}</div>
                                {spatialData.restricted_count > 0 && (
                                    <div style={{ color: "#e6a23c", gridColumn: "1 / -1" }}>
                                        🔒 {spatialData.restricted_count} station
                                        {spatialData.restricted_count === 1 ? "" : "s"} in this
                                        region require a data requisition and are excluded.
                                    </div>
                                )}
                            </div>
                            )}
                            <TSDiagram data={profileData} />
                        </div>

                        <div className="profile-charts-grid">
                            {availablePlots.length === 0
                                ? <p className="profile-status">No plottable data found.</p>
                                : availablePlots.map(cfg => (
                                    <MemoizedDepthProfile key={cfg.key} data={profileData} config={cfg} />
                                ))
                            }
                        </div>

                        {/* Show which variables aren't available and why */}
                        {unavailablePlots.length > 0 && (
                            <div style={{
                                padding: "10px 16px 16px",
                                fontSize: "12px", color: "#555",
                            }}>
                                <span>Not available for this instrument: </span>
                                {unavailablePlots.map(cfg => (
                                    <span key={cfg.key} style={{
                                        marginLeft: "6px", padding: "2px 6px",
                                        background: "#1a1a2a", borderRadius: "3px", color: "#666",
                                    }}>
                                        {cfg.title.replace(" Profile", "")}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ==========================================
// EXPORTED COMPONENT — error boundary wraps everything
// ==========================================
function ProfilePlots({
    stationFile,
    stationType,

    isSpatial = false,
    spatialData = null,

    onClose
}){
    return (
        <ProfileErrorBoundary onClose={onClose}>
            <ProfilePanel
            stationFile={stationFile}
            stationType={stationType}

            isSpatial={isSpatial}
            spatialData={spatialData}

            onClose={onClose}
        />
        </ProfileErrorBoundary>
    );
}


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
const iconCache = new Map();

function makeInstrumentIcon(instrumentType, color) {
    const key = `${instrumentType}-${color}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const size = 10;
    let shapeSvg;
    if (instrumentType === "ctd") {
        shapeSvg = `<circle cx="7" cy="7" r="5.5" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    } else if (instrumentType === "xbt") {
        shapeSvg = `<polygon points="7,1.5 13,12.5 1,12.5" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    } else {
        shapeSvg = `<polygon points="7,1 13,7 7,13 1,7" fill="${color}" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14">${shapeSvg}</svg>`;

    const icon = L.divIcon({
        html: svg,
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
    });

    iconCache.set(key, icon);
    return icon;
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
// POINT-IN-EEZ CHECK (ray casting)
// ==========================================
function rayCastPointInPolygon(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const yi = polygon[i][0], xi = polygon[i][1];
        const yj = polygon[j][0], xj = polygon[j][1];
        const intersect =
            (yi > lat) !== (yj > lat) &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInEEZ(lat, lon, loops) {
    return loops.some(loop => rayCastPointInPolygon(lat, lon, loop));
}

// ==========================================
// CSV HELPERS
// ==========================================
function jsonToCSV(rows) {
    if (!rows || rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const escape = (val) => {
        if (val == null) return "";
        const str = String(val);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers.join(",")];
    rows.forEach(row => lines.push(headers.map(h => escape(row[h])).join(",")));
    return lines.join("\n");
}

function triggerCSVDownload(filename, csvString) {
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// ==========================================
// BOX SELECT HANDLER (Shift + drag)
// ==========================================
function BoxSelectHandler({ onBoundsChange, drawMode = false }) {
    const dragStart  = useRef(null);
    const isDragging = useRef(false);

    useMapEvents({
        mousedown(e) {
            if (!drawMode && !e.originalEvent.shiftKey) return;
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
// DATA REQUISITION FORM (for markers inside EEZ)
// ==========================================
function RequisitionForm({ station, onSubmitted, onSubmittedPdfUrl }) {
    const [form, setForm] = useState({
        name: "",
        email: "",
        organization: "",
        purpose: "",
        institutionAddress: "",
        officerDesignation: "",
        parameters: "",
        period: "",
        projectCost: "",
        requestType: "own_research",   // "own_research" | "consultancy"
        govtApprovalDetails: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const canSubmit = form.name.trim() && form.email.trim() && form.purpose.trim();

    const setField = (field) => (e) => setForm({ ...form, [field]: e.target.value });

    const submit = async () => {
        if (!canSubmit) {
            setError("Please fill in name, email, and purpose.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await apiFetch(`${API}/requisition/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    email: form.email,
                    organization: form.organization,
                    purpose: form.purpose,
                    station_file: station.file_name,
                    instrument_type: station.type,
                    institution_address: form.institutionAddress,
                    officer_designation: form.officerDesignation,
                    parameters: form.parameters,
                    period: form.period,
                    project_cost: form.projectCost || null,
                    request_type: form.requestType,
                    govt_approval_details: form.requestType === "consultancy"
                        ? form.govtApprovalDetails
                        : null,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            onSubmitted();
            if (data.request_pdf_url && onSubmittedPdfUrl) {
                onSubmittedPdfUrl(data.request_pdf_url);
            }
        } catch (err) {
            setError("Submission failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const inputStyle = { padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid #444", width: "100%" };
    const labelStyle = { fontSize: 11, color: "#aaa", marginBottom: 2, display: "block" };

    return (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
                <span style={labelStyle}>Name *</span>
                <input value={form.name} onChange={setField("name")} style={inputStyle} />
            </div>

            <div>
                <span style={labelStyle}>Email *</span>
                <input type="email" value={form.email} onChange={setField("email")} style={inputStyle} />
            </div>

            <div>
                <span style={labelStyle}>Organization</span>
                <input value={form.organization} onChange={setField("organization")} style={inputStyle} />
            </div>

            <div>
                <span style={labelStyle}>Institution / Dept. Address</span>
                <input value={form.institutionAddress} onChange={setField("institutionAddress")} style={inputStyle} />
            </div>

            <div>
                <span style={labelStyle}>Officer Designation</span>
                <input value={form.officerDesignation} onChange={setField("officerDesignation")} style={inputStyle} placeholder="e.g. Research Intern" />
            </div>

            <div>
                <span style={labelStyle}>Parameters Needed</span>
                <input value={form.parameters} onChange={setField("parameters")} style={inputStyle} placeholder="e.g. Temperature, Salinity, Depth" />
            </div>

            <div>
                <span style={labelStyle}>Period</span>
                <input value={form.period} onChange={setField("period")} style={inputStyle} placeholder="e.g. Jan 2023 - Mar 2023" />
            </div>

            <div>
                <span style={labelStyle}>Purpose of request *</span>
                <textarea
                    value={form.purpose}
                    onChange={setField("purpose")}
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Project this data is required for"
                />
            </div>

            <div>
                <span style={labelStyle}>Estimated project cost (optional)</span>
                <input value={form.projectCost} onChange={setField("projectCost")} style={inputStyle} />
            </div>

            {/* The data is required for — maps to the official form's own-research vs consultancy question */}
            <div>
                <span style={labelStyle}>This data is required for</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd" }}>
                        <input
                            type="radio"
                            name="requestType"
                            value="own_research"
                            checked={form.requestType === "own_research"}
                            onChange={setField("requestType")}
                        />
                        Own research
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ddd" }}>
                        <input
                            type="radio"
                            name="requestType"
                            value="consultancy"
                            checked={form.requestType === "consultancy"}
                            onChange={setField("requestType")}
                        />
                        Sponsored & consultancy projects*
                    </label>
                </div>
            </div>

            {/* Only shown for consultancy — mirrors the official form's conditional question */}
            {form.requestType === "consultancy" && (
                <div>
                    <span style={labelStyle}>
                        Government approval details (Central/State), if obtained
                    </span>
                    <textarea
                        value={form.govtApprovalDetails}
                        onChange={setField("govtApprovalDetails")}
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical" }}
                    />
                </div>
            )}

            {error && (
                <p style={{ color: "#e74c3c", fontSize: 11, margin: 0 }}>{error}</p>
            )}

            <button
                type="button"
                onClick={submit}
                disabled={submitting}
                style={{
                    padding: "6px 0", background: "#1a6fa8", color: "#fff",
                    border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer",
                }}
            >
                {submitting ? "Submitting…" : "Submit Request"}
            </button>
        </div>
    );
}

function MarkerPopupContent({ station, lat, lon, hasProfile, eezLoops, onOpenProfile }) {
    const insideEEZ = useMemo(
        () => isPointInEEZ(lat, lon, eezLoops),
        [lat, lon, eezLoops]
    );

    const [csvState, setCsvState] = useState({
        loading: false, error: null, showRequisition: false, requisitionSubmitted: false,
    });

    // Holds the backend's request_pdf_url once a requisition has been
    // submitted, plus loading/error state for the download click itself.
    const [requisitionPdf, setRequisitionPdf] = useState({
        url: null, downloading: false, error: null,
    });

    const handleViewProfileClick = () => {
        if (insideEEZ) {
            setCsvState(prev => ({ ...prev, showRequisition: true, error: null }));
            return;
        }
        onOpenProfile();
    };

    const handleDownloadClick = async () => {
        if (insideEEZ) {
            setCsvState(prev => ({ ...prev, showRequisition: true, error: null }));
            return;
        }
        setCsvState({ loading: true, error: null, showRequisition: false, requisitionSubmitted: false });
        try {
            const typeParam = station.type ? `&type=${station.type}` : "";
            const url = `${API}/profile/${encodeURIComponent(station.file_name)}?_=${Date.now()}${typeParam}`;
            const res = await apiFetch(url);
            if (res.status === 403) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || "This station requires an approved data requisition.");
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const rows = Array.isArray(data) ? data : [];
            if (rows.length === 0) throw new Error("No data available for this marker.");

            const csv = jsonToCSV(rows);
            const safeName = (station.file_name)
                .replace(/[^a-z0-9_-]/gi, "_");
            triggerCSVDownload(`${safeName}_${station.type || "data"}.csv`, csv);

            setCsvState({ loading: false, error: null, showRequisition: false, requisitionSubmitted: false });
        } catch (err) {
            setCsvState({ loading: false, error: err.message, showRequisition: false, requisitionSubmitted: false });
        }
    };

    // Downloads the autofilled requisition PDF via apiFetch (needs the
    // X-API-Key header, so a plain <a href> won't work) and triggers a
    // browser download, same pattern as the CSV download above.
    const handleDownloadRequisitionPdf = async () => {
        if (!requisitionPdf.url) return;
        setRequisitionPdf(prev => ({ ...prev, downloading: true, error: null }));
        try {
            const res = await apiFetch(`${API}${requisitionPdf.url}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = `${station.file_name || "requisition"}_form.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            setRequisitionPdf(prev => ({ ...prev, downloading: false }));
        } catch (err) {
            setRequisitionPdf(prev => ({ ...prev, downloading: false, error: "Download failed. Please try again." }));
        }
    };

    return (
        <div className="popup-content">
            <p><b>Instrument:</b> {station.type?.toUpperCase()}</p>
            <p><b>Ship:</b>       {station.ship}</p>
            <p><b>Cruise:</b>     {station.cruise}</p>
            <p><b>Station:</b>    {station.station}</p>
            <p><b>Datetime:</b>   {station.datetime}</p>
            <p><b>Depth:</b>      {station.depth}</p>
            <p><b>Lat:</b>        {lat.toFixed(4)}</p>
            <p><b>Lon:</b>        {lon.toFixed(4)}</p>

            <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                <button
                    className="popup-profile-btn"
                    type="button"
                    onClick={handleViewProfileClick}
                    disabled={!hasProfile}
                    title={insideEEZ ? "Inside EEZ — requisition required" : "View this marker's profile"}
                >
                    View Profile
                </button>

                <button
                    className="popup-csv-btn"
                    type="button"
                    onClick={handleDownloadClick}
                    disabled={csvState.loading || !hasProfile}
                    title={insideEEZ ? "Inside EEZ — requisition required" : "Download this marker's data"}
                >
                    {csvState.loading ? "Preparing…" : "⬇ Download CSV"}
                </button>
            </div>

            {csvState.error && (
                <p style={{ color: "#e74c3c", fontSize: "11px", marginTop: "6px" }}>
                    {csvState.error}
                </p>
            )}

            {csvState.showRequisition && !csvState.requisitionSubmitted && (
                <div style={{
                    marginTop: "8px", padding: "8px", background: "#1f2330",
                    borderRadius: "5px", fontSize: "12px", color: "#ddd",
                }}>
                    <p style={{ margin: "0 0 6px" }}>
                        This marker lies inside the Indian EEZ. Please fill out this
                        request form — our team will review it and, once approved and
                        signed, send the authorized data directly to your email.
                    </p>
                    <RequisitionForm
                        station={station}
                        onSubmitted={() =>
                            setCsvState(prev => ({ ...prev, requisitionSubmitted: true }))
                        }
                        onSubmittedPdfUrl={(url) =>
                            setRequisitionPdf({ url, downloading: false, error: null })
                        }
                    />
                </div>
            )}

            {csvState.requisitionSubmitted && (
                <div style={{
                    marginTop: "8px", padding: "8px", background: "#1f3320",
                    borderRadius: "5px", fontSize: "12px", color: "#a8e6a1",
                }}>
                    <p style={{ margin: "0 0 8px" }}>
                        ✓ Request submitted. Our team has been notified and will email
                        you the signed authorization once reviewed. We've also emailed
                        you a copy of your filled request form.
                    </p>

                    {requisitionPdf.url && (
                        <button
                            type="button"
                            onClick={handleDownloadRequisitionPdf}
                            disabled={requisitionPdf.downloading}
                            style={{
                                padding: "6px 10px", background: "#1a6fa8", color: "#fff",
                                border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer",
                            }}
                        >
                            {requisitionPdf.downloading ? "Preparing…" : "⬇ Download your filled form (PDF)"}
                        </button>
                    )}

                    {requisitionPdf.error && (
                        <p style={{ color: "#e74c3c", fontSize: "11px", marginTop: "6px" }}>
                            {requisitionPdf.error}
                        </p>
                    )}
                </div>
            )}
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

    spatialProfileData,
    showSpatialProfile,
    onCloseSpatialProfile,
}) {
    const [activeShip, setActiveShip] = useState("all");
    const [eezLoops,   setEezLoops]   = useState([]);
    const [previewBox, setPreviewBox] = useState(null);
    const [drawMode, setDrawMode] = useState(false);
    const [profileStation, setProfileStation] = useState(null);

    // EEZ visibility toggle — outside EEZ visible by default (directly downloadable);
    // inside EEZ also visible by default, but its markers require the requisition flow.
    const [showOutsideEEZ, setShowOutsideEEZ] = useState(true);
    const [showInsideEEZ, setShowInsideEEZ] = useState(true);

    useEffect(() => {
        fetch("/data/india_eez.geojson")
            .then(res => res.json())
            .then(data => setEezLoops(extractEEZLoops(data)))
            .catch(err => console.error("Failed to load EEZ GeoJSON:", err));
    }, []);

    const shipColorMap = generateShipColorMap(stations);
    const ships        = Object.keys(shipColorMap);

    // Ship filter first (existing behavior)
    const shipFilteredStations = activeShip === "all"
        ? stations
        : stations.filter(s => s.ship === activeShip);

    // Then EEZ inside/outside visibility toggle
    const eezFilteredStations = useMemo(() => {
        if (!eezLoops.length) return shipFilteredStations;
        return shipFilteredStations.filter(s => {
            const lat = Number(s.latitude);
            const lon = Number(s.longitude);
            if (isNaN(lat) || isNaN(lon)) return false;
            const inside = isPointInEEZ(lat, lon, eezLoops);
            return inside ? showInsideEEZ : showOutsideEEZ;
        });
    }, [shipFilteredStations, eezLoops, showInsideEEZ, showOutsideEEZ]);

    const handleBoxChange = useCallback((bounds, phase) => {
        if (phase === "drawing") {
            setPreviewBox(bounds);
        } else {
            setPreviewBox(null);
            onSpatialBoundsChange(bounds);
        }
    }, [onSpatialBoundsChange]);

    const toggleDrawMode = (next) => {
        const val = typeof next === "boolean" ? next : !drawMode;
        setDrawMode(val);
        if (!val) setPreviewBox(null);
    };

    const applyBoundsFromSidebar = (b) => {
        setPreviewBox(null);
        onSpatialBoundsChange(b);
    };

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

                <BoxSelectHandler onBoundsChange={handleBoxChange} drawMode={drawMode} />

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
                <>
                    {eezFilteredStations.map((station, index) => {
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
                                    <MarkerPopupContent
                                        station={station}
                                        lat={lat}
                                        lon={lon}
                                        hasProfile={hasProfile}
                                        eezLoops={eezLoops}
                                        onOpenProfile={() => handleOpenProfile(station)}
                                    />

                                </Popup>
                            </Marker>
                        );
                    })}
                </>
            </MapContainer>

            {/* Shift+drag hint — bottom-center of map, hides after box drawn */}
            <ShiftDragHint spatialBounds={spatialBounds} />

            <Legend
                activeShip={activeShip}
                shipColorMap={shipColorMap}
                ships={ships}
                onSelectShip={setActiveShip}
                drawMode={drawMode}
                onToggleDraw={toggleDrawMode}
                showOutsideEEZ={showOutsideEEZ}
                setShowOutsideEEZ={setShowOutsideEEZ}
                showInsideEEZ={showInsideEEZ}
                setShowInsideEEZ={setShowInsideEEZ}
            />

            {/* Floating draw-mode toggle (right side) */}
            <div style={{ position: "absolute", right: 14, top: "48%", zIndex: 1100 }}>
                <button
                    onClick={() => toggleDrawMode()}
                    style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: drawMode ? "#37a73b" : "#faf605",
                        color: "#13043b",
                        cursor: "pointer",
                        boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
                    }}
                    title={drawMode ? "Disable draw mode" : "Enable draw mode (mouse draw)"}
                >
                    {drawMode ? "Drawing — Mouse" : "Enable Draw"}
                </button>
            </div>

            {/* Pass full station to ProfilePlots so it can include ?type= */}
            {/* Single station profile */}
            {profileFile && !showSpatialProfile && (
                <ProfilePlots
                    stationFile={profileFile}
                    stationType={profileStation?.type}
                    onClose={onCloseProfile}
                />
            )}

            {/* Spatial merged profile */}
            {showSpatialProfile && spatialProfileData && (
                <ProfilePlots
                    isSpatial={true}
                    spatialData={spatialProfileData}
                    onClose={onCloseSpatialProfile}
                />
            )}
        </div>
    );
}