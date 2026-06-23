import Plot from "react-plotly.js";

const QC_COLORS = {
    1: "#2ecc71",
    2: "#f1c40f",
    3: "#ff8c00",
    4: "#e74c3c",
    9: "#95a5a6",
};

const QC_LABELS = {
    1: "1 - Good",
    2: "2 - Probably Good",
    3: "3 - Probably Bad",
    4: "4 - Bad",
    9: "9 - Missing",
};

// ==========================================
// SIGMA-T (UNESCO/EOS-80) DENSITY HELPER
// ==========================================
function sigmaT(S, T) {
    const rho0 =
        999.842594 +
        6.793952e-2 * T -
        9.09529e-3 * T ** 2 +
        1.001685e-4 * T ** 3 -
        1.120083e-6 * T ** 4 +
        6.536332e-9 * T ** 5;

    const A =
        8.24493e-1 -
        4.0899e-3 * T +
        7.6438e-5 * T ** 2 -
        8.2467e-7 * T ** 3 +
        5.3875e-9 * T ** 4;

    const B = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * T ** 2;

    const C = 4.8314e-4;

    return rho0 + A * S + B * S ** 1.5 + C * S ** 2 - 1000;
}

function buildSigmaTContours(salinityRange, tempRange) {
    const [sMin, sMax] = salinityRange;
    const [tMin, tMax] = tempRange;

    const n = 40;
    const sStep = (sMax - sMin) / n;
    const tStep = (tMax - tMin) / n;

    const sVals = Array.from({ length: n + 1 }, (_, i) => sMin + i * sStep);
    const tVals = Array.from({ length: n + 1 }, (_, j) => tMin + j * tStep);
    const grid = tVals.map(t => sVals.map(s => sigmaT(s, t)));

    const corners = [grid[0][0], grid[0][n], grid[n][0], grid[n][n]];
    const sigmaMin = Math.floor(Math.min(...corners));
    const sigmaMax = Math.ceil(Math.max(...corners));

    const traces = [];

    for (let level = sigmaMin; level <= sigmaMax; level++) {
        const points = [];

        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const v00 = grid[j][i];
                const v10 = grid[j][i + 1];
                const v01 = grid[j + 1][i];

                if ((v00 - level) * (v10 - level) < 0) {
                    const frac = (level - v00) / (v10 - v00);
                    points.push({ x: sVals[i] + frac * sStep, y: tVals[j] });
                }
                if ((v00 - level) * (v01 - level) < 0) {
                    const frac = (level - v00) / (v01 - v00);
                    points.push({ x: sVals[i], y: tVals[j] + frac * tStep });
                }
            }
        }

        if (points.length === 0) continue;
        points.sort((a, b) => a.x - b.x);

        traces.push({
            x: points.map(p => p.x),
            y: points.map(p => p.y),
            mode: "lines",
            type: "scatter",
            line: { color: "rgba(150,150,170,0.6)", width: 2 },
            hoverinfo: "skip",
            showlegend: false,
        });

        const lp = points[points.length - 1];
        traces.push({
            x: [lp.x],
            y: [lp.y],
            mode: "text",
            type: "scatter",
            text: [`${level}`],
            textposition: "top right",
            textfont: { color: "#7f8c9a", size: 11 },
            hoverinfo: "skip",
            showlegend: false,
        });
    }

    return traces;
}

// ==========================================
// QC SUMMARY PANEL
// ==========================================
function QCSummary({ data }) {
    const total = data.length;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 9: 0 };

    data.forEach(d => {
        const qc = Number(d.ALL_TESTS_QC);
        if (counts[qc] !== undefined) counts[qc]++;
    });

    return (
        <div className="qc-summary-panel">
            <h4 className="qc-summary-title">QC Summary</h4>
            <table className="qc-summary-table">
                <tbody>
                    {[1, 2, 3, 4, 9].map(qc => {
                        const count = counts[qc];
                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
                        return (
                            <tr key={qc}>
                                <td className="qc-summary-label">{QC_LABELS[qc]}</td>
                                <td className="qc-summary-value" style={{ color: QC_COLORS[qc] }}>
                                    {count.toLocaleString()} ({pct}%)
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ==========================================
// MAIN TS DIAGRAM
// ==========================================
export default function TSDiagram({ data }) {
    if (!data?.length) return null;

    const qcGroups = [1, 2, 3, 4, 9].map(qc => {
        const filtered = data.filter(
            d =>
                d.SAL_QC_VAR != null &&
                d.TEMP_QC_VAR != null &&
                Number(d.ALL_TESTS_QC) === qc
        );

        return {
            x: filtered.map(d => d.SAL_QC_VAR),
            y: filtered.map(d => d.TEMP_QC_VAR),
            mode: "markers",
            type: "scatter",
            name: QC_LABELS[qc],
            marker: {
                color: QC_COLORS[qc],
                size: 11,
                opacity: 0.9,
                line: { width: 0 },
            },
            customdata: filtered.map(d => [d.depSM, d.ALL_TESTS_QC]),
            hovertemplate:
                "Salinity: %{x:.3f}<br>" +
                "Temperature: %{y:.3f} °C<br>" +
                "Depth: %{customdata[0]} m<br>" +
                "QC: %{customdata[1]}" +
                "<extra></extra>",
        };
    });

    const validPoints = data.filter(d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null);
    const salinities = validPoints.map(d => d.SAL_QC_VAR);
    const temps = validPoints.map(d => d.TEMP_QC_VAR);

    const sMin = Math.min(...salinities);
    const sMax = Math.max(...salinities);
    const tMin = Math.min(...temps);
    const tMax = Math.max(...temps);

    const sPad = (sMax - sMin) * 0.05 || 0.1;
    const tPad = (tMax - tMin) * 0.05 || 0.1;

    const contourTraces = buildSigmaTContours(
        [sMin - sPad, sMax + sPad],
        [tMin - tPad, tMax + tPad]
    );

    const plotData = [...contourTraces, ...qcGroups];

    const axisStyle = {
        gridcolor: "#3a3a4a",
        gridwidth: 1.5,
        zerolinecolor: "#3a3a4a",
        zerolinewidth: 1.5,
        tickfont: { size: 14, color: "#aaa" },
        titlefont: { size: 18, color: "#aaa" },
        linecolor: "#444",
        linewidth: 2,
    };

    return (
        <div className="ts-diagram-container">
            <div className="ts-diagram-plot">
                <Plot
                    data={plotData}
                    layout={{
                        title: {
                            text: "Temperature–Salinity Diagram (QC Colored)",
                            font: { size: 24, color: "#eaeaea" },
                        },
                        autosize: true,
                        paper_bgcolor: "#1e1e2e",
                        plot_bgcolor: "#1e1e2e",
                        font: { color: "#aaa" },
                        xaxis: { title: "Salinity (psu)", ...axisStyle },
                        yaxis: { title: "Potential Temperature (°C)", ...axisStyle },
                        legend: {
                            x: 1.02,
                            y: 1,
                            bgcolor: "#1e1e2e",
                            bordercolor: "#444",
                            borderwidth: 1,
                            font: { color: "#aaa" },
                        },
                        margin: { l: 80, r: 220, t: 80, b: 80 },
                    }}
                    style={{ width: "100%", height: "900px" }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
            <QCSummary data={data} />
        </div>
    );
}