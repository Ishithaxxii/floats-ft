import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import MapView, { Navbar, Sidebar } from "./components/MapView";

const API = "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY;

function apiFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            "X-API-Key": API_KEY,
        },
    });
}

const INSTRUMENT_TYPES = ["ctd", "xbt", "xctd"];

function getTwoYearsAgo() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split("T")[0];
}

const TODAY = new Date().toISOString().split("T")[0];

function parseDateMs(raw) {
    if (!raw || raw === "N/A") return NaN;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw).getTime();
    const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`).getTime();
    const mdy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mdy) return new Date(`${mdy[3]}-${mdy[1]}-${mdy[2]}`).getTime();
    return new Date(raw).getTime();
}

function App() {
    const [stations,           setStations]           = useState([]);
    const [loadingTypes,       setLoadingTypes]       = useState({});
    const [errors,             setErrors]             = useState({});
    const [query,              setQuery]              = useState("");
    const [selectedStation,    setSelectedStation]    = useState(null);
    const [profileFile,        setProfileFile]        = useState(null);
    const [dateFrom,           setDateFrom]           = useState(getTwoYearsAgo);
    const [dateTo,             setDateTo]             = useState(TODAY);
    const [spatialBounds,      setSpatialBounds]      = useState(null);
    const [spatialProfileData, setSpatialProfileData] = useState(null);
    const [showSpatialProfile, setShowSpatialProfile] = useState(false);
    const [spatialLoading, setSpatialLoading] = useState(false);

    // ----------------------------------------
    // Load one instrument type and merge into stations
    // ----------------------------------------
    const loadType = useCallback(async (instrType) => {
        setLoadingTypes(prev => ({ ...prev, [instrType]: true }));
        setErrors(prev => ({ ...prev, [instrType]: null }));
        try {
            await apiFetch(`${API}/load-meta?type=${instrType}`, { method: "POST" });
            const res  = await apiFetch(`${API}/stations?type=${instrType}`);
            const data = await res.json();
            const incoming = data.stations || [];
            setStations(prev => [
                ...prev.filter(s => s.type !== instrType),
                ...incoming,
            ]);
        } catch {
            setErrors(prev => ({
                ...prev,
                [instrType]: `Failed to load ${instrType.toUpperCase()} stations.`,
            }));
        } finally {
            setLoadingTypes(prev => ({ ...prev, [instrType]: false }));
        }
    }, []);

    // Load all three on mount
    useEffect(() => {
        let cancelled = false;
        INSTRUMENT_TYPES.forEach(t => {
            if (!cancelled) loadType(t);
        });
        return () => { cancelled = true; };
    }, [loadType]);

    // ----------------------------------------
    // Derived loading + error state
    // ----------------------------------------
    const loading  = Object.values(loadingTypes).some(Boolean);
    const errorMsg = Object.entries(errors)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ") || null;

    // ----------------------------------------
    // FILTERING
    // ----------------------------------------
    const dateFromMs = useMemo(
        () => (dateFrom ? new Date(dateFrom).getTime() : -Infinity),
        [dateFrom]
    );
    const dateToMs = useMemo(
        () => (dateTo ? new Date(dateTo).getTime() + 86_400_000 : Infinity),
        [dateTo]
    );
    const queryLower = useMemo(() => query.trim().toLowerCase(), [query]);

    const [activeInstruments, setActiveInstruments] = useState(["ctd", "xbt", "xctd"]);

    // ----------------------------------------
    // INSTRUMENT FILTERING TOGGLE
    // ----------------------------------------
    const handleInstrumentToggle = useCallback((type) => {
        setActiveInstruments(prev => {
            // Don't allow deselecting all — keep at least one active
            if (prev.includes(type) && prev.length === 1) return prev;
            return prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type];
        });
    }, []);
    const filteredStations = useMemo(() => {
        const { latMin, latMax, lonMin, lonMax } = spatialBounds ?? {};
        const hasSpatial  = spatialBounds !== null;
        const hasTemporal = dateFrom || dateTo;
        const hasQuery    = queryLower.length > 0;

        return stations.filter(s => {
            // 0. Instrument type toggle (cheapest — single Set lookup)
            if (!activeInstruments.includes(s.type)) return false;

            // 1. Spatial
            if (hasSpatial) {
                if (s.latitude  < latMin || s.latitude  > latMax) return false;
                if (s.longitude < lonMin || s.longitude > lonMax) return false;
            }
            // 2. Temporal
            if (hasTemporal && s.datetime && s.datetime !== "N/A") {
                const t = parseDateMs(s.datetime);
                if (!isNaN(t) && (t < dateFromMs || t > dateToMs)) return false;
            }
            // 3. Text
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
    }, [stations, spatialBounds, dateFromMs, dateToMs, queryLower, activeInstruments]);

    
    const [pendingDateFrom, setPendingDateFrom] = useState(getTwoYearsAgo);
    const [pendingDateTo,   setPendingDateTo]   = useState(TODAY);

    const applyDateFilter = useCallback(() => {
        setDateFrom(pendingDateFrom);
        setDateTo(pendingDateTo);
    }, [pendingDateFrom, pendingDateTo]);

    const handleDateReset = useCallback(() => {
        const from = getTwoYearsAgo();
        setPendingDateFrom(from);
        setPendingDateTo(TODAY);
        setDateFrom(from);
        setDateTo(TODAY);
    }, []);

    // ------------------------
    // SPATIAL PROFILE — fires when box is committed
    // ----------------------------------------
    const fetchSpatialProfile = useCallback(() => {
        if (!spatialBounds) return;

        setSpatialLoading(true);
        setShowSpatialProfile(false);

        apiFetch(`${API}/spatial-profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...spatialBounds,
                dateFrom: dateFrom || null,
                dateTo:   dateTo   || null,
            }),
        })
            .then(res => res.json())
            .then(data => {
                setSpatialProfileData(data);
                setShowSpatialProfile(true);
                setProfileFile(null);
                setSpatialLoading(false);
            })
            .catch(err => {
                console.error("spatial-profile error:", err);
                setSpatialLoading(false);
            });
    }, [spatialBounds, dateFrom, dateTo]);
    // Only reset when box is cleared — no auto-fetch on draw
    useEffect(() => {
        if (!spatialBounds) {
            setSpatialProfileData(null);
            setShowSpatialProfile(false);
            setSpatialLoading(false);
        }
    }, [spatialBounds]);

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
                    error={errorMsg}
                    onRefresh={() => INSTRUMENT_TYPES.forEach(t => loadType(t))}
                    selectedStation={selectedStation}
                    dateFrom={pendingDateFrom}
                    dateTo={pendingDateTo}
                    onDateFromChange={setPendingDateFrom}
                    onDateToChange={setPendingDateTo}
                    onDateReset={handleDateReset}
                    onApplyDateFilter={applyDateFilter}
                    spatialBounds={spatialBounds}
                    onSpatialClear={() => setSpatialBounds(null)}
                    onApplyBounds={setSpatialBounds}
                    loadingTypes={loadingTypes}
                    spatialLoading={spatialLoading}
                    spatialProfileData={spatialProfileData}
                    onViewSpatialProfile={() => setShowSpatialProfile(true)}
                    activeInstruments={activeInstruments}
                    onInstrumentToggle={handleInstrumentToggle}
                    onFetchSpatialProfile={fetchSpatialProfile}
                />
                <div className="map-container">
                    <MapView
                        stations={filteredStations}
                        onSelectStation={setSelectedStation}
                        onOpenProfile={(file) => {
                            setShowSpatialProfile(false);   // dismiss spatial view
                            setProfileFile(file);
                        }}
                        profileFile={profileFile}
                        onCloseProfile={() => setProfileFile(null)}
                        spatialBounds={spatialBounds}
                        onSpatialBoundsChange={setSpatialBounds}
                        spatialProfileData={spatialProfileData}
                        showSpatialProfile={showSpatialProfile}
                        onCloseSpatialProfile={() => setShowSpatialProfile(false)}
                    />
                </div>
            </div>
        </div>
    );
}

export default App;
