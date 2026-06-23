// ==========================================
// Sidebar.jsx
// ==========================================

// ==========================================
// STATION DETAILS
// ==========================================
// function StationDetails({ station }) {
//     if (!station) {
//         return (
//             <div className="details-card empty">
//                 <h3>Details</h3>
//                 <p>Select a station marker to view metadata and open its vertical profile.</p>
//             </div>
//         );
//     }

//     const rows = [
//         ["Ship",     station.ship],
//         ["Cruise",   station.cruise],
//         ["Station",  station.station],
//         ["Datetime", station.datetime],
//         ["Depth",    station.depth],
//         ["Lat",      typeof station.latitude  === "number" ? station.latitude.toFixed(4)  : station.latitude],
//         ["Lon",      typeof station.longitude === "number" ? station.longitude.toFixed(4) : station.longitude],
//         ["Type",     station.type],
//         ["File",     station.file_name],
//     ];

//     return (
//         <div className="details-card">
//             <h3>Station Details</h3>
//             <table className="details-table">
//                 <tbody>
//                     {rows.map(([label, value]) => (
//                         <tr key={label}>
//                             <td className="detail-label">{label}</td>
//                             <td className="detail-value">{value ?? "N/A"}</td>
//                         </tr>
//                     ))}
//                 </tbody>
//             </table>
//         </div>
//     );
// }

// ==========================================
// TEMPORAL FILTER
// ==========================================
function TemporalFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange, onReset }) {
    return (
        <section className="filter-card">
            <div className="filter-header">
                <h3>Time Range</h3>
                <button type="button" className="reset-btn" onClick={onReset}>
                    Reset
                </button>
            </div>

            <label className="filter-label">
                <span>From</span>
                <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                />
            </label>

            <label className="filter-label">
                <span>To</span>
                <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                />
            </label>
        </section>
    );
}

// ==========================================
// SPATIAL BOUNDS DISPLAY
// ==========================================
function SpatialBounds({ bounds, onClear }) {
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
                <button type="button" className="reset-btn" onClick={onClear}>
                    Clear
                </button>
            </div>
            <table className="bounds-table">
                <tbody>
                    <tr>
                        <td>Lat min</td>
                        <td>{bounds.latMin.toFixed(4)}°</td>
                    </tr>
                    <tr>
                        <td>Lat max</td>
                        <td>{bounds.latMax.toFixed(4)}°</td>
                    </tr>
                    <tr>
                        <td>Lon min</td>
                        <td>{bounds.lonMin.toFixed(4)}°</td>
                    </tr>
                    <tr>
                        <td>Lon max</td>
                        <td>{bounds.lonMax.toFixed(4)}°</td>
                    </tr>
                </tbody>
            </table>
        </section>
    );
}

// ==========================================
// SIDEBAR
// ==========================================
function Sidebar({
    // station counts
    stationCount,
    filteredCount,
    // search
    query,
    setQuery,
    // load state
    loading,
    error,
    onRefresh,
    // selected station
    selectedStation,
    // temporal filter
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    onDateReset,
    // spatial filter
    spatialBounds,
    onSpatialClear,
}) {
    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-panel">

                <h2>SeaSnap</h2>

                {/* ---------------------------------- */}
                {/* SEARCH                             */}
                {/* ---------------------------------- */}
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

                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Refresh Stations"}
                    </button>
                </section>

                {/* ---------------------------------- */}
                {/* STATUS                             */}
                {/* ---------------------------------- */}
                {error && (
                    <p className="sidebar-status error">{error}</p>
                )}

                {/* ---------------------------------- */}
                {/* TEMPORAL FILTER                    */}
                {/* ---------------------------------- */}
                <TemporalFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={onDateFromChange}
                    onDateToChange={onDateToChange}
                    onReset={onDateReset}
                />

                {/* ---------------------------------- */}
                {/* SPATIAL FILTER                     */}
                {/* ---------------------------------- */}
                <SpatialBounds
                    bounds={spatialBounds}
                    onClear={onSpatialClear}
                />

                {/* ---------------------------------- */}
                {/* STATION DETAILS                    */}
                {/* ---------------------------------- */}
                {/* <StationDetails station={selectedStation} /> */}

            </div>
        </aside>
    );
}

export default Sidebar;