import { useEffect, useState } from "react";
import {
    LineChart, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Label
} from "recharts";

// ==========================================
// PLOT CONFIGS
// ==========================================
const PLOT_CONFIGS = [
    {
        key: "t090C",
        label: "Temperature (°C)",
        color: "#e74c3c",
        title: "Temperature Profile"
    },
    {
        key: "Sal00",
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

// ==========================================
// SINGLE DEPTH PROFILE CHART
// ==========================================
function DepthProfile({ data, config }) {

    const sorted = [...data]
        .filter(d => d[config.key] != null)
        .sort((a, b) => b.depSM - a.depSM);

    if (sorted.length === 0) return null;

    const maxDepth = Math.max(...sorted.map(d => d.depSM));

    return (
        <div className="profile-chart-card">
            <h4 className="chart-title">{config.title}</h4>
            <ResponsiveContainer width="100%" height={350}>
                <LineChart
                    data={sorted}
                    layout="vertical"
                    margin={{ top: 10, right: 20, bottom: 30, left: 60 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />

                    <XAxis
                        type="number"
                        dataKey={config.key}
                        stroke="#aaa"
                        tick={{ fill: "#aaa", fontSize: 11 }}
                        domain={["auto", "auto"]}
                    >
                        <Label
                            value={config.label}
                            position="insideBottom"
                            offset={-15}
                            fill="#aaa"
                            fontSize={12}
                        />
                    </XAxis>

                    <YAxis
                        type="number"
                        dataKey="depSM"
                        domain={[0, maxDepth]}
                        reversed={true}
                        stroke="#aaa"
                        tick={{ fill: "#aaa", fontSize: 11 }}
                        width={55}
                    >
                        <Label
                            value="Depth (m)"
                            angle={-90}
                            position="insideLeft"
                            offset={-10}
                            fill="#aaa"
                            fontSize={12}
                        />
                    </YAxis>

                    <Tooltip
                        contentStyle={{
                            background: "#1e1e2e",
                            border: "1px solid #444",
                            borderRadius: 6
                        }}
                        labelFormatter={(val) => `Depth: ${val} m`}
                        formatter={(val) => [`${val}`, config.label]}
                    />

                    <Line
                        type="monotone"
                        dataKey={config.key}
                        stroke={config.color}
                        dot={false}
                        strokeWidth={2}
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

    const [profileData, setProfileData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!stationFile) return;
        setLoading(true);
        setError(null);

        fetch(`http://localhost:8000/profile/${encodeURIComponent(stationFile)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setProfileData(data);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [stationFile]);

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
                )}

            </div>
        </div>
    );
}

export default ProfilePlots;
