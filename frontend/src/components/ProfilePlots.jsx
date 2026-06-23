import { useEffect, useState } from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label
} from "recharts";
import TSDiagram from "./TSDiagram";

// ==========================================
// PLOT CONFIGS
// ==========================================
const PLOT_CONFIGS = [
    {
        key: "TEMP_QC_VAR",
        qcKey: "Temp_QC",
        label: "Temperature (°C)",
        color: "#e74c3c",
        title: "Temperature Profile"
    },
    {
        key: "SAL_QC_VAR",
        qcKey: "Sal_QC",
        label: "Salinity (PSU)",
        color: "#3498db",
        title: "Salinity Profile"
    },
    {
        key: "c0S/m",
        label: "Conductivity (S/m)",
        color: "#2ecc71",
        title: "Conductivity Profile"
    },
    {
        key: "sbeox0ML/L",
        label: "Dissolved Oxygen (mL/L)",
        color: "#f39c12",
        title: "Dissolved Oxygen Profile"
    },
    {
        key: "sigma-t00",
        label: "Density (kg/m³)",
        color: "#9b59b6",
        title: "Density Profile"
    }
];


const QC_COLORS = {
1: "#2ecc71",
2: "#f1c40f",
3: "#e67e22",
4: "#e74c3c",
9: "#95a5a6"
};

// ==========================================
// SINGLE DEPTH PROFILE CHART
// ==========================================
function DepthProfile({ data, config }) {

    const sorted = [...data]
        .filter(d => d[config.key] != null)
        .sort((a, b) => b.depSM - a.depSM);

    const qcField = config.qcKey;
    
    const [selectedQC, setSelectedQC] = useState({
        1: true,
        2: true,
        3: true,
        4: true,
        9: true,
        all: true
    });
    // const sorted = [...data]
    // .filter(d => d[config.key] != null)
    // .sort((a, b) => a.depSM - b.depSM);

    if (sorted.length === 0) return null;

    const maxDepth = Math.max(...sorted.map(d => d.depSM));

    const tickStep =
    maxDepth <= 100 ? 10 :
    maxDepth <= 500 ? 50 :
    maxDepth <= 2000 ? 100 :
    500;

    const yTicks = [];

    for (let d = 0; d <= maxDepth; d += tickStep) {
        yTicks.push(d);
    }

    return (
        <div className="profile-chart-card">
            <div className="qc-panel">
                <h4> QC </h4>
                <label
                    className="qc-checkbox"
                    style={{
                        borderColor: "#aaa",
                        fontWeight: "bold"
                    }}
                >
                    <input
                        type="checkbox"
                        checked={selectedQC.all}
                        onChange={() => {
                            const newState = !selectedQC.all;
                            setSelectedQC({
                                1: newState,
                                2: newState,
                                3: newState,
                                4: newState,
                                9: newState,
                                all: newState
                            });
                        }}
                    />
                    <span
                        className="qc-color"
                        style={{
                            background: "#aaa"
                        }}
                    />
                    All
                </label>
                {[1,2,3,4,9].map(qc => (
                    <label
                        key={qc}
                        className="qc-checkbox"
                        style={{
                            borderColor: QC_COLORS[qc]
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={selectedQC[qc]}
                            onChange={() =>
                                setSelectedQC(prev => ({
                                    ...prev,
                                    [qc]: !prev[qc]
                                }))
                            }
                        />

                        <span
                            className="qc-color"
                            style={{
                                background: QC_COLORS[qc]
                            }}
                        />
                        {qc}


                    </label>
                ))}

            </div>
            <h4 className="chart-title">{config.title}</h4>
            <ResponsiveContainer width="100%" height={400}>
                <LineChart
                    data={sorted}
                    layout="vertical"
                    margin={{ top: 10, right: 20, bottom: 30, left: 60 }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#444"
                        vertical={false}
                    />

                    <XAxis
                        type="number"
                        dataKey={config.key}
                        stroke="#aaa"
                        tick={{ fill: "#aaa", fontSize: 14 }}
                        domain={["auto", "auto"]}
                        //reversed = {true}
                    >
                        <Label
                            value={config.label}
                            position="insideBottom"
                            offset={-15}
                            fill="#aaa"
                            fontSize={16}
                        />
                    </XAxis>

                    <YAxis
                        type="number"
                        dataKey="depSM"
                        domain={[0, maxDepth]}
                        reversed
                        ticks={yTicks}
                        stroke="#aaa"
                        tick={{ fill: "#aaa", fontSize: 14 }}
                        width={75}
                        padding={{ top: 10, bottom: 10 }}
                    >
                        <Label
                            value="Depth (m)"
                            angle={-90}
                            position="insideLeft"
                            offset={-10}
                            fill="#aaa"
                            fontSize={16}
                        />
                    </YAxis>

                    <Tooltip
                        contentStyle={{
                            background: "#1e1e2e",
                            border: "1px solid #444",
                            borderRadius: 6,
                            fontSize: "14px"
                        }}
                        labelFormatter={(val) => `Depth: ${val} m`}
                         formatter={(value, name, props) => [
                            value,
                            `${config.label} (QC ${props.payload[qcField]})`
                        ]}
                    />

                    <Line
                        type="monotone"
                        dataKey={config.key}
                        stroke={config.color}
                        strokeWidth={2}
                        dot={(props) => {

                            if (!qcField) return null;

                            const point = props.payload;

                            const qc = Number(point[qcField]);

                            if (!selectedQC[qc]) {
                                return null;
                            }

                            return (
                                <circle
                                    cx={props.cx}
                                    cy={props.cy}
                                    r={5}
                                    fill={QC_COLORS[qc]}
                                    stroke="#fff"
                                    strokeWidth={1}
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
// MAIN PROFILE PLOTS COMPONENT
// ==========================================
function ProfilePlots({ stationFile, onClose }) {

    const [profileResult, setProfileResult] = useState({
        stationFile: null,
        data: [],
        error: null
    });

    useEffect(() => {
        if (!stationFile) return;
        let cancelled = false;

        fetch(`http://localhost:8000/profile/${encodeURIComponent(stationFile)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                if (!cancelled) {
                    setProfileResult({
                        stationFile,
                        data,
                        error: null
                    });
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setProfileResult({
                        stationFile,
                        data: [],
                        error: err.message
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [stationFile]);

    const isCurrentProfile = profileResult.stationFile === stationFile;
    const loading = Boolean(stationFile) && !isCurrentProfile;
    const error = isCurrentProfile ? profileResult.error : null;
    const profileData = isCurrentProfile ? profileResult.data : [];

    const availablePlots = PLOT_CONFIGS.filter(cfg =>
        profileData.some(d => d[cfg.key] != null)
    );

    return (
        <div className="profile-overlay">
            <div className="profile-panel">

                <div className="profile-header">
                    <div>
                        <h2 className="profile-title">Vertical Profiles</h2>
                        <p className="profile-subtitle">{stationFile}</p>
                    </div>
                    <button
                        className="profile-close-btn"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                {loading && (
                    <p className="profile-status">Loading profile data...</p>
                )}
                {error && (
                    <p className="profile-status error">Error: {error}</p>
                )}
                
                {!loading && !error && (
                   <>
                   <div className="profile-ts-section">
                        <TSDiagram data={profileData} />
                    </div>
                    <div className="profile-charts-grid">
                        {availablePlots.length === 0
                            ? <p className="profile-status">No plottable data found.</p>
                            : availablePlots.map(cfg => (
                                <DepthProfile
                                    key={cfg.key}
                                    data={profileData}
                                    config={cfg}
                                />
                            ))
                        }
                    </div>
                    </>
                )}

            </div>
        </div>
    );
}

export default ProfilePlots;
