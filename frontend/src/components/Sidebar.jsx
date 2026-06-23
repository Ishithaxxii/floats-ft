// ==========================================
// Sidebar.jsx
// ==========================================

// ==========================================
// INSTRUMENT KEY (shape legend)
// ==========================================
function InstrumentKey() {
    const items = [
        {
            type: "CTD",
            shape: (
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <circle cx="7" cy="7" r="5.5" fill="#7ec8e3" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
                </svg>
            ),
        },
        {
            type: "XBT",
            shape: (
                <svg width="14" height="14" viewBox="0 0 14 14">
                    <polygon points="7,1.5 13,12.5 1,12.5" fill="#7ec8e3" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
                </svg>
            ),
        },
        {
            type: "XCTD",
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
                {items.map(({ type, shape }) => (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#ccc" }}>
                        {shape}
                        <span>{type}</span>
                    </div>
                ))}
            </div>
            <p style={{ fontSize: "11px", color: "#666", marginTop: "8px", marginBottom: 0 }}>
                Marker color indicates ship
            </p>
        </section>
    );
}

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
function TemporalFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange, onReset }) {
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
        </section>
    );
}

// ==========================================
// SPATIAL BOUNDS DISPLAY
// ==========================================
function SpatialBounds({ bounds, onClear, spatialLoading, spatialProfileData, onViewSpatialProfile }) {
    if (!bounds) {
        return (
            <section className="filter-card">
                <h3>Spatial Filter</h3>
                <p className="hint-text">
                    Hold <kbd>Shift</kbd> and drag on the map to draw a bounding box.
                </p>
            </section>
        );
    }

    return (
        <section className="filter-card active-bounds">
            <div className="filter-header">
                <h3>Spatial Filter</h3>
                <button type="button" className="reset-btn" onClick={onClear}>Clear</button>
            </div>
            <table className="bounds-table">
                <tbody>
                    <tr><td>Lat min</td><td>{bounds.latMin.toFixed(4)}°</td></tr>
                    <tr><td>Lat max</td><td>{bounds.latMax.toFixed(4)}°</td></tr>
                    <tr><td>Lon min</td><td>{bounds.lonMin.toFixed(4)}°</td></tr>
                    <tr><td>Lon max</td><td>{bounds.lonMax.toFixed(4)}°</td></tr>
                </tbody>
            </table>

            {/* Loading indicator while spatial fetch is in progress */}
            {spatialLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "12px", color: "#aaa" }}>
                    <div style={{
                        width: "10px", height: "10px", flexShrink: 0,
                        border: "2px solid #444", borderTop: "2px solid #3498db",
                        borderRadius: "50%", animation: "seasnap-spin 0.75s linear infinite",
                    }}/>
                    Fetching profiles for this region… this may take a moment.
                    <style>{`@keyframes seasnap-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Button to (re)open spatial profile panel once data is ready */}
            {!spatialLoading && spatialProfileData && spatialProfileData.station_count > 0 && (
                <button
                    type="button"
                    onClick={onViewSpatialProfile}
                    style={{
                        marginTop:    "10px",
                        width:        "100%",
                        padding:      "7px 0",
                        background:   "#1a6fa8",
                        color:        "#fff",
                        border:       "none",
                        borderRadius: "5px",
                        fontSize:     "13px",
                        cursor:       "pointer",
                    }}
                >
                    View Region Profiles ({spatialProfileData.station_count} stations,{" "}
                    {spatialProfileData.row_count?.toLocaleString()} obs)
                </button>
            )}

            {!spatialLoading && spatialProfileData && spatialProfileData.station_count === 0 && (
                <p style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
                    No stations found in this region.
                </p>
            )}
        </section>
    );
}

// ==========================================
// SIDEBAR
// ==========================================
function Sidebar({
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
    spatialBounds,
    onSpatialClear,
    loadingTypes,
    spatialLoading,
    spatialProfileData,
    onViewSpatialProfile,
}) {
    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-panel">

                <h2>SeaSnap</h2>

                {/* SEARCH */}
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

                {/* PER-TYPE LOADING + ERROR */}
                <LoadingStatus loadingTypes={loadingTypes} error={error} />

                {/* INSTRUMENT KEY */}
                <InstrumentKey />

                {/* TEMPORAL FILTER */}
                <TemporalFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={onDateFromChange}
                    onDateToChange={onDateToChange}
                    onReset={onDateReset}
                />

                {/* SPATIAL FILTER */}
                <SpatialBounds
                    bounds={spatialBounds}
                    onClear={onSpatialClear}
                    spatialLoading={spatialLoading}
                    spatialProfileData={spatialProfileData}
                    onViewSpatialProfile={onViewSpatialProfile}
                />

            </div>
        </aside>
    );
}

export default Sidebar;