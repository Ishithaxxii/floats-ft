// ==========================================
// Sidebar.jsx
// ==========================================

// ==========================================
// STATION DETAILS
// ==========================================
function StationDetails({ station}) {
    if (!station) {
        return (
            <div className="details-card empty">
                <h3>Details</h3>
                <p>Select a station marker to view metadata and open its vertical profile.</p>
            </div>
        );
    }


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
                />

            </div>
        </aside>
    );
}

export default Sidebar;