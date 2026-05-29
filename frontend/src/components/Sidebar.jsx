// ==========================================
// Sidebar.jsx
// ==========================================

// ==========================================
// STATION DETAILS
// ==========================================
function StationDetails({ station, onOpenProfile }) {
    if (!station) {
        return (
            <div className="details-card empty">
                <h3>Details</h3>
                <p>Select a station marker to view metadata and open its vertical profile.</p>
            </div>
        );
    }

    const hasProfile =
        station.file_name &&
        station.file_name !== "N/A" &&
        station.file_name !== "nan";

    return (
        <div className="details-card">
            <h3>Details</h3>
            <dl>
                <div><dt>Station</dt><dd>{station.station || "N/A"}</dd></div>
                <div><dt>Ship</dt><dd>{station.ship || "N/A"}</dd></div>
                <div><dt>Cruise</dt><dd>{station.cruise || "N/A"}</dd></div>
                <div><dt>Datetime</dt><dd>{station.datetime || "N/A"}</dd></div>
                <div><dt>Depth</dt><dd>{station.depth || "N/A"}</dd></div>
                <div><dt>Latitude</dt><dd>{Number(station.latitude).toFixed(4)}</dd></div>
                <div><dt>Longitude</dt><dd>{Number(station.longitude).toFixed(4)}</dd></div>
                <div><dt>File</dt><dd>{station.file_name || "N/A"}</dd></div>
            </dl>
            <button
                type="button"
                onClick={() => onOpenProfile(station.file_name)}
                disabled={!hasProfile}
            >
                View Profile
            </button>
        </div>
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
    onOpenProfile,
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
                {/* STATION DETAILS                    */}
                {/* ---------------------------------- */}
                <StationDetails
                    station={selectedStation}
                    onOpenProfile={onOpenProfile}
                />

            </div>
        </aside>
    );
}

export default Sidebar;