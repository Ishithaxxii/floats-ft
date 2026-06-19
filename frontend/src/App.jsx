import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";

// ==========================================
// CONSTANTS
// ==========================================

const API = "http://localhost:8000";

function getTwoYearsAgo() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split("T")[0];
}

const TODAY = new Date().toISOString().split("T")[0];

// ==========================================
// APP
// ==========================================

function App() {
    const [stations,        setStations]        = useState([]);
    const [loading,         setLoading]         = useState(true);
    const [error,           setError]           = useState(null);
    const [query,           setQuery]           = useState("");
    const [selectedStation, setSelectedStation] = useState(null);
    const [profileFile,     setProfileFile]     = useState(null);

    // Temporal filter — default: last 2 years → today
    const [dateFrom, setDateFrom] = useState(getTwoYearsAgo);
    const [dateTo,   setDateTo]   = useState(TODAY);

    // Spatial filter — null means no box drawn
    const [spatialBounds, setSpatialBounds] = useState(null);

    // ----------------------------------------
    // DATA LOADING
    // ----------------------------------------

    const loadStations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            await fetch(`${API}/load-meta`, { method: "POST" });
            const res  = await fetch(`${API}/stations`);
            const data = await res.json();
            setStations(data.stations || []);
        } catch {
            setError("Failed to load stations. Is the server running?");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                await fetch(`${API}/load-meta`, { method: "POST" });
                const res  = await fetch(`${API}/stations`);
                const data = await res.json();
                if (!cancelled) setStations(data.stations || []);
            } catch {
                if (!cancelled) setError("Failed to load stations. Is the server running?");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    // ----------------------------------------
    // FILTERING  (all client-side — O(n) single pass)
    // ----------------------------------------
    //
    // Order of checks is cheapest-first so we short-circuit early:
    //   1. spatial bounds  (4 numeric comparisons)
    //   2. temporal range  (date parse + 2 comparisons)
    //   3. text search     (4 string lowercases + includes)

    const dateFromMs = useMemo(
        () => (dateFrom ? new Date(dateFrom).getTime() : -Infinity),
        [dateFrom]
    );
    const dateToMs = useMemo(
        () => (dateTo ? new Date(dateTo).getTime() + 86_400_000 : Infinity), // inclusive end
        [dateTo]
    );

    const queryLower = useMemo(() => query.trim().toLowerCase(), [query]);

    const filteredStations = useMemo(() => {
        const { latMin, latMax, lonMin, lonMax } = spatialBounds ?? {};
        const hasSpatial  = spatialBounds !== null;
        const hasTemporal = dateFrom || dateTo;
        const hasQuery    = queryLower.length > 0;

        return stations.filter(s => {
            // 1. Spatial
            if (hasSpatial) {
                if (s.latitude  < latMin || s.latitude  > latMax) return false;
                if (s.longitude < lonMin || s.longitude > lonMax) return false;
            }

            // 2. Temporal
            if (hasTemporal && s.datetime && s.datetime !== "N/A") {
                const t = new Date(s.datetime).getTime();
                if (!isNaN(t) && (t < dateFromMs || t > dateToMs)) return false;
            }

            // 3. Text search
            if (hasQuery) {
                return (
                    (s.ship      || "").toLowerCase().includes(queryLower) ||
                    (s.station   || "").toLowerCase().includes(queryLower) ||
                    (s.cruise    || "").toLowerCase().includes(queryLower) ||
                    (s.file_name || "").toLowerCase().includes(queryLower)
                );
            }

            return true;
        });
    }, [stations, spatialBounds, dateFromMs, dateToMs, queryLower]);

    // ----------------------------------------
    // HANDLERS
    // ----------------------------------------

    const handleDateReset = useCallback(() => {
        setDateFrom(getTwoYearsAgo());
        setDateTo(TODAY);
    }, []);

    return (
        <div className="app-container">

            <Navbar />

            <div className="main-layout">

                <Sidebar
                    // counts
                    stationCount={stations.length}
                    filteredCount={filteredStations.length}
                    // search
                    query={query}
                    setQuery={setQuery}
                    // load state
                    loading={loading}
                    error={error}
                    onRefresh={loadStations}
                    // selected station
                    selectedStation={selectedStation}
                    // temporal filter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={setDateFrom}
                    onDateToChange={setDateTo}
                    onDateReset={handleDateReset}
                    // spatial filter
                    spatialBounds={spatialBounds}
                    onSpatialClear={() => setSpatialBounds(null)}
                />

                <div className="map-container">
                    <MapView
                        stations={filteredStations}
                        onSelectStation={setSelectedStation}
                        onOpenProfile={setProfileFile}
                        profileFile={profileFile}
                        onCloseProfile={() => setProfileFile(null)}
                        // spatial filter (box draw lives in MapView, state lifted here)
                        spatialBounds={spatialBounds}
                        onSpatialBoundsChange={setSpatialBounds}
                    />
                </div>

            </div>

        </div>
    );
}

export default App;