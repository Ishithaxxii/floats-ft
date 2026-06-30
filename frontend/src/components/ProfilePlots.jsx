import { useEffect, useState, Component } from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label
} from "recharts";
import TSDiagram from "./TSDiagram";

const API = "http://localhost:8000";

// ==========================================
// PLOT CONFIGS
// ==========================================
const PLOT_CONFIGS = [
    { key: "TEMP_QC_VAR", qcKey: "Temp_QC",  label: "Temperature (°C)",       color: "#e74c3c", title: "Temperature Profile"      },
    { key: "SAL_QC_VAR",  qcKey: "Sal_QC",   label: "Salinity (PSU)",          color: "#3498db", title: "Salinity Profile"          },
    { key: "c0S/m",                           label: "Conductivity (S/m)",      color: "#2ecc71", title: "Conductivity Profile"      },
    { key: "sbeox0ML/L",                      label: "Dissolved Oxygen (mL/L)", color: "#f39c12", title: "Dissolved Oxygen Profile"  },
    { key: "sigma-t00",                       label: "Density (kg/m³)",         color: "#9b59b6", title: "Density Profile"           },
];

const QC_COLORS = { 1: "#2ecc71", 2: "#f1c40f", 3: "#e67e22", 4: "#e74c3c", 9: "#95a5a6" };

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
    const sorted  = [...data]
        .filter(d => d[config.key] != null)
        .sort((a, b) => b.depSM - a.depSM);

    if (sorted.length === 0) return null;

    const maxDepth = Math.max(...sorted.map(d => d.depSM));
    const tickStep =
        maxDepth <= 100  ? 10  :
        maxDepth <= 500  ? 50  :
        maxDepth <= 2000 ? 100 : 500;

    const yTicks = [];
    for (let d = 0; d <= maxDepth; d += tickStep) yTicks.push(d);

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
                    <label key={qc} className="qc-checkbox" style={{ borderColor: QC_COLORS[qc] }}>
                        <input
                            type="checkbox"
                            checked={selectedQC[qc]}
                            onChange={() => setSelectedQC(prev => ({ ...prev, [qc]: !prev[qc] }))}
                        />
                        <span className="qc-color" style={{ background: QC_COLORS[qc] }} />
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
                        type="number" dataKey="depSM" domain={[0, maxDepth]} reversed
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
                        dot={(props) => {
                            if (!qcField) return null;
                            const qc = Number(props.payload[qcField]);
                            if (!selectedQC[qc]) return null;
                            return (
                                <circle
                                    key={`dot-${props.index}`}
                                    cx={props.cx} cy={props.cy} r={5}
                                    fill={QC_COLORS[qc]} stroke="#fff" strokeWidth={1}
                                />
                            );
                        }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

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
    const [profileResult, setProfileResult] = useState({ stationFile: null, data: [], error: null });
    const [isLoading,     setIsLoading]     = useState(false);

    useEffect(() => {

    if (isSpatial) {

        setProfileResult({
            stationFile: "spatial",
            data: spatialData?.data || [],
            error: null,
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

    fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (!cancelled) {
                    setProfileResult({ stationFile, data: Array.isArray(data) ? data : [], error: null });
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setProfileResult({ stationFile, data: [], error: err.message });
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

                {/* Error state */}
                {!isLoading && error && (
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
                            </div>
                            )}
                            <TSDiagram data={profileData} />
                        </div>

                        <div className="profile-charts-grid">
                            {availablePlots.length === 0
                                ? <p className="profile-status">No plottable data found.</p>
                                : availablePlots.map(cfg => (
                                    <DepthProfile key={cfg.key} data={profileData} config={cfg} />
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

export default ProfilePlots;
