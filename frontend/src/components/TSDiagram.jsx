import PlotModule from "react-plotly.js";
const Plot = PlotModule.default;

const QC_COLORS = {
    1: "#2ca02c",
    2: "#f1c40f",
    3: "#ff8c00",
    4: "#ff0000",
    9: "#808080",
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
// Computes sigma-t = rho(S, T, 0) - 1000 at atmospheric pressure
function sigmaT(S, T) {
    // Density of pure water (kg/m^3)
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

    const B =
        -5.72466e-3 +
        1.0227e-4 * T -
        1.6546e-6 * T ** 2;

    const C = 4.8314e-4;

    const rho = rho0 + A * S + B * S ** 1.5 + C * S ** 2;

    return rho - 1000;
}

// Build contour line traces for a set of sigma-t levels over a S/T grid
function buildSigmaTContours(salinityRange, tempRange) {
    const [sMin, sMax] = salinityRange;
    const [tMin, tMax] = tempRange;

    const nS = 60;
    const nT = 60;

    const sStep = (sMax - sMin) / nS;
    const tStep = (tMax - tMin) / nT;

    // Determine sigma-t range across the grid corners to pick sensible levels
    const corners = [
        sigmaT(sMin, tMin),
        sigmaT(sMin, tMax),
        sigmaT(sMax, tMin),
        sigmaT(sMax, tMax),
    ];
    const sigmaMin = Math.floor(Math.min(...corners));
    const sigmaMax = Math.ceil(Math.max(...corners));

    const levels = [];
    for (let lvl = sigmaMin; lvl <= sigmaMax; lvl++) {
        levels.push(lvl);
    }

    // Precompute grid of sigma-t values
    const sVals = [];
    for (let i = 0; i <= nS; i++) sVals.push(sMin + i * sStep);
    const tVals = [];
    for (let j = 0; j <= nT; j++) tVals.push(tMin + j * tStep);

    const grid = tVals.map(t => sVals.map(s => sigmaT(s, t)));

    const traces = [];

    levels.forEach(level => {
        // March through grid cells, find segments where grid crosses `level`
        const xs = [];
        const ys = [];

        for (let j = 0; j < nT; j++) {
            for (let i = 0; i < nS; i++) {
                const v00 = grid[j][i];
                const v10 = grid[j][i + 1];
                const v01 = grid[j + 1][i];

                // horizontal edge crossing (between i and i+1 at row j)
                if ((v00 - level) * (v10 - level) < 0) {
                    const frac = (level - v00) / (v10 - v00);
                    xs.push(sVals[i] + frac * sStep);
                    ys.push(tVals[j]);
                }
                // vertical edge crossing (between j and j+1 at col i)
                if ((v00 - level) * (v01 - level) < 0) {
                    const frac = (level - v00) / (v01 - v00);
                    xs.push(sVals[i]);
                    ys.push(tVals[j] + frac * tStep);
                }
            }
        }

        if (xs.length === 0) return;

        // Sort points along salinity so the line draws left-to-right cleanly
        const points = xs.map((x, idx) => ({ x, y: ys[idx] }));
        points.sort((a, b) => a.x - b.x);

        traces.push({
            x: points.map(p => p.x),
            y: points.map(p => p.y),
            mode: "lines",
            type: "scatter",
            line: { color: "rgba(150,150,150,0.6)", width: 1, dash: "solid" },
            hoverinfo: "skip",
            showlegend: false,
            name: `σt = ${level}`,
        });

        // Label near the rightmost (or topmost) point of the contour
        const labelPoint = points[points.length - 1];
        traces.push({
            x: [labelPoint.x],
            y: [labelPoint.y],
            mode: "text",
            type: "scatter",
            text: [`${level}`],
            textposition: "top right",
            textfont: { color: "#999999", size: 11 },
            hoverinfo: "skip",
            showlegend: false,
        });
    });

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
                                <td
                                    className="qc-summary-value"
                                    style={{ color: QC_COLORS[qc] }}
                                >
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
                size: 7,
                opacity: 0.8,
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

    // Compute axis ranges from valid points for contour generation
    const validPoints = data.filter(
        d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null
    );
    const salinities = validPoints.map(d => d.SAL_QC_VAR);
    const temps = validPoints.map(d => d.TEMP_QC_VAR);

    const sMin = Math.min(...salinities);
    const sMax = Math.max(...salinities);
    const tMin = Math.min(...temps);
    const tMax = Math.max(...temps);

    // Pad ranges slightly so contours cover the full plot area
    const sPad = (sMax - sMin) * 0.05 || 0.1;
    const tPad = (tMax - tMin) * 0.05 || 0.1;

    const contourTraces = buildSigmaTContours(
        [sMin - sPad, sMax + sPad],
        [tMin - tPad, tMax + tPad]
    );

    const plotData = [...contourTraces, ...qcGroups];

    return (
        <div className="ts-diagram-container">
            <div className="ts-diagram-plot">
                <Plot
                    data={plotData}
                    layout={{
                        title: {
                            text: "Temperature–Salinity Diagram Colored by ALL_TESTS_QC",
                            font: { size: 24 }
                        },
                        autosize: true,
                        paper_bgcolor: "#ffffff",
                        plot_bgcolor: "#ffffff",
                        xaxis: {
                            title: "Salinity (psu)",
                            tickfont: { size: 14 },
                            titlefont: { size: 18 }
                        },
                        yaxis: {
                            title: "Potential Temperature (°C)",
                            tickfont: { size: 14 },
                            titlefont: { size: 18 }
                        },
                        legend: {
                            x: 1.02,
                            y: 1,
                            borderwidth: 1,
                        },
                        margin: { l: 80, r: 250, t: 80, b: 80 }
                    }}
                    style={{ width: "100%", height: "800px" }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
            <QCSummary data={data} />
        </div>
    );
}