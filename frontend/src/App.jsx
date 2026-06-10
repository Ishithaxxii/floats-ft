import { useState, useEffect, useCallback } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import MapView from "./components/MapView";

function App() {

    const [stations, setStations]           = useState([]);
    const [query, setQuery]                 = useState("");
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);
    const [selectedStation, setSelectedStation] = useState(null);
    const [profileFile, setProfileFile]     = useState(null);

    // ----------------------------------------
    // LOAD STATIONS
    // ----------------------------------------
    const fetchStations = useCallback(() => (
        fetch("http://localhost:8000/load-meta", { method: "POST" })
            .then(res => res.json())
            .then(() => fetch("http://localhost:8000/stations"))
            .then(res => res.json())
    ), []);

    const loadStations = useCallback(() => {
        setLoading(true);
        setError(null);

        fetchStations()
            .then(data => setStations(data.stations || []))
            .catch(() => setError("Failed to load stations. Is the server running?"))
            .finally(() => setLoading(false));
    }, [fetchStations]);

    useEffect(() => {
        let cancelled = false;

        fetchStations()
            .then(data => {
                if (!cancelled) setStations(data.stations || []);
            })
            .catch(() => {
                if (!cancelled) setError("Failed to load stations. Is the server running?");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [fetchStations]);

    // ----------------------------------------
    // SEARCH FILTER
    // ----------------------------------------
    const filteredStations = stations.filter(s => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
            (s.ship     || "").toLowerCase().includes(q) ||
            (s.station  || "").toLowerCase().includes(q) ||
            (s.cruise   || "").toLowerCase().includes(q) ||
            (s.file_name|| "").toLowerCase().includes(q)
        );
    });

    return (
        <div className="app-container">

            <Navbar />

            <div className="main-layout">

                <Sidebar
                    stationCount={stations.length}
                    filteredCount={filteredStations.length}
                    query={query}
                    setQuery={setQuery}
                    loading={loading}
                    error={error}
                    onRefresh={loadStations}
                    selectedStation={selectedStation}
                />

                <div className="map-container">
                    <MapView
                        stations={filteredStations}
                        onSelectStation={setSelectedStation}
                        onOpenProfile={setProfileFile}
                        profileFile={profileFile}
                        onCloseProfile={() => setProfileFile(null)}
                    />
                </div>

            </div>

        </div>
    );
}

export default App;
