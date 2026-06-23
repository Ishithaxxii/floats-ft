import Plot from "react-plotly.js";

const QC_COLORS = {
    1: "#2ecc71", 2: "#f1c40f", 3: "#ff8c00", 4: "#e74c3c", 9: "#95a5a6",
};
const QC_LABELS = {
    1: "1 - Good", 2: "2 - Probably Good", 3: "3 - Probably Bad",
    4: "4 - Bad",  9: "9 - Missing",
};

// ==========================================
// SIGMA-T (UNESCO/EOS-80)
// ==========================================
function sigmaT(S, T) {
    const rho0 =
        999.842594 + 6.793952e-2 * T - 9.09529e-3 * T ** 2 +
        1.001685e-4 * T ** 3 - 1.120083e-6 * T ** 4 + 6.536332e-9 * T ** 5;
    const A =
        8.24493e-1 - 4.0899e-3 * T + 7.6438e-5 * T ** 2 -
        8.2467e-7 * T ** 3 + 5.3875e-9 * T ** 4;
    const B = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * T ** 2;
    const C = 4.8314e-4;
    return rho0 + A * S + B * S ** 1.5 + C * S ** 2 - 1000;
}

// ==========================================
// MARCHING SQUARES — all 4 cell edges
// Returns points in traversal order so lines
// don't zigzag when sorted by x.
// ==========================================
function marchingSquareContour(grid, sVals, tVals, level) {
    const nS = sVals.length - 1;   // columns
    const nT = tVals.length - 1;   // rows
    const sStep = sVals[1] - sVals[0];
    const tStep = tVals[1] - tVals[0];

    // Collect all crossing segments as pairs of points
    const segments = [];

    for (let j = 0; j < nT; j++) {
        for (let i = 0; i < nS; i++) {
            const v00 = grid[j][i];
            const v10 = grid[j][i + 1];
            const v01 = grid[j + 1][i];
            const v11 = grid[j + 1][i + 1];

            const crossings = [];

            // Bottom edge (j, i→i+1)
            if ((v00 - level) * (v10 - level) < 0) {
                const frac = (level - v00) / (v10 - v00);
                crossings.push({ x: sVals[i] + frac * sStep, y: tVals[j] });
            }
            // Top edge (j+1, i→i+1)
            if ((v01 - level) * (v11 - level) < 0) {
                const frac = (level - v01) / (v11 - v01);
                crossings.push({ x: sVals[i] + frac * sStep, y: tVals[j + 1] });
            }
            // Left edge (i, j→j+1)
            if ((v00 - level) * (v01 - level) < 0) {
                const frac = (level - v00) / (v01 - v00);
                crossings.push({ x: sVals[i], y: tVals[j] + frac * tStep });
            }
            // Right edge (i+1, j→j+1)
            if ((v10 - level) * (v11 - level) < 0) {
                const frac = (level - v10) / (v11 - v10);
                crossings.push({ x: sVals[i + 1], y: tVals[j] + frac * tStep });
            }

            // Each cell contributes exactly 0 or 2 crossings for a clean isoline
            if (crossings.length === 2) {
                segments.push(crossings);
            }
        }
    }

    if (segments.length === 0) return [];

    // Chain segments into a polyline by nearest-endpoint matching
    // (avoids the zigzag from sorting all points by x)
    const used = new Array(segments.length).fill(false);
    const chain = [segments[0][0], segments[0][1]];
    used[0] = true;

    for (let iter = 0; iter < segments.length; iter++) {
        const tail = chain[chain.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        let flip = false;

        for (let k = 0; k < segments.length; k++) {
            if (used[k]) continue;
            const d0 = Math.hypot(segments[k][0].x - tail.x, segments[k][0].y - tail.y);
            const d1 = Math.hypot(segments[k][1].x - tail.x, segments[k][1].y - tail.y);
            if (d0 < bestDist) { bestDist = d0; bestIdx = k; flip = false; }
            if (d1 < bestDist) { bestDist = d1; bestIdx = k; flip = true;  }
        }

        // Stop chaining if the nearest unvisited segment is far away
        // (means we've finished this connected component)
        const threshold = Math.max(sStep, tStep) * 2.5;
        if (bestIdx === -1 || bestDist > threshold) break;

        used[bestIdx] = true;
        chain.push(flip ? segments[bestIdx][0] : segments[bestIdx][1]);
    }

    return chain;
}

// ==========================================
// BUILD ALL SIGMA-T CONTOUR TRACES + LABELS
// ==========================================
function buildSigmaTContours(salinityRange, tempRange) {
    const [sMin, sMax] = salinityRange;
    const [tMin, tMax] = tempRange;

    const n     = 50;   // finer grid than before
    const sStep = (sMax - sMin) / n;
    const tStep = (tMax - tMin) / n;

    const sVals = Array.from({ length: n + 1 }, (_, i) => sMin + i * sStep);
    const tVals = Array.from({ length: n + 1 }, (_, j) => tMin + j * tStep);
    const grid  = tVals.map(t => sVals.map(s => sigmaT(s, t)));

    const allValues = grid.flat();
    const sigmaMin  = Math.ceil(Math.min(...allValues));
    const sigmaMax  = Math.floor(Math.max(...allValues));

    const traces = [];

    for (let level = sigmaMin; level <= sigmaMax; level++) {
        const chain = marchingSquareContour(grid, sVals, tVals, level);
        if (chain.length < 2) continue;

        // Contour line
        traces.push({
            x:          chain.map(p => p.x),
            y:          chain.map(p => p.y),
            mode:       "lines",
            type:       "scatter",
            line:       { color: "rgba(150,150,170,0.55)", width: 1.5 },
            hoverinfo:  "skip",
            showlegend: false,
        });

        // Label at rightmost point (right-side label)
        const rightmost = chain.reduce((best, p) => p.x > best.x ? p : best, chain[0]);

        // Label at leftmost point (left-side label) — only if contour is wide enough
        const leftmost  = chain.reduce((best, p) => p.x < best.x ? p : best, chain[0]);
        const spanS     = rightmost.x - leftmost.x;

        traces.push({
            x:            [rightmost.x],
            y:            [rightmost.y],
            mode:         "text",
            type:         "scatter",
            text:         [`σt ${level}`],
            textposition: "middle right",
            textfont:     { color: "#8899aa", size: 10, family: "monospace" },
            hoverinfo:    "skip",
            showlegend:   false,
        });

        // Add left-side label only when the contour spans >30% of the salinity range
        // — avoids cluttering short contours near the corners
        if (spanS > (sMax - sMin) * 0.3) {
            traces.push({
                x:            [leftmost.x],
                y:            [leftmost.y],
                mode:         "text",
                type:         "scatter",
                text:         [`σt ${level}`],
                textposition: "middle left",
                textfont:     { color: "#8899aa", size: 10, family: "monospace" },
                hoverinfo:    "skip",
                showlegend:   false,
            });
        }
    }

    return traces;
}

// ==========================================
// QC SUMMARY PANEL
// ==========================================
function QCSummary({ data }) {
    const total  = data.length;
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
                        const pct   = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
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
// MAIN T-S DIAGRAM
// ==========================================
export default function TSDiagram({ data }) {
    if (!data?.length) return null;

    // XBT has no salinity — show a clear message instead of a blank diagram
    const hasSalinity = data.some(d => d.SAL_QC_VAR != null);
    const hasTemp     = data.some(d => d.TEMP_QC_VAR != null);

    if (!hasSalinity || !hasTemp) {
        return (
            <div className="ts-diagram-container" style={{ padding: "1.5rem" }}>
                <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>
                    T-S diagram not available for this instrument type
                    {!hasSalinity ? " (no salinity data)" : " (no temperature data)"}.
                </p>
                <QCSummary data={data} />
            </div>
        );
    }

    const validPoints = data.filter(d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null);
    const salinities  = validPoints.map(d => d.SAL_QC_VAR);
    const temps       = validPoints.map(d => d.TEMP_QC_VAR);

    const sMin = Math.min(...salinities);
    const sMax = Math.max(...salinities);
    const tMin = Math.min(...temps);
    const tMax = Math.max(...temps);

    // Padding so contour labels aren't clipped at the axis edge
    const sPad = (sMax - sMin) * 0.08 || 0.2;
    const tPad = (tMax - tMin) * 0.08 || 0.2;

    const contourTraces = buildSigmaTContours(
        [sMin - sPad, sMax + sPad],
        [tMin - tPad, tMax + tPad]
    );

    const qcGroups = [1, 2, 3, 4, 9].map(qc => {
        const filtered = data.filter(
            d => d.SAL_QC_VAR != null && d.TEMP_QC_VAR != null && Number(d.ALL_TESTS_QC) === qc
        );
        return {
            x:    filtered.map(d => d.SAL_QC_VAR),
            y:    filtered.map(d => d.TEMP_QC_VAR),
            mode: "markers",
            type: "scatter",
            name: QC_LABELS[qc],
            marker: {
                color:   QC_COLORS[qc],
                size:    11,
                opacity: 0.9,
                line:    { width: 0 },
            },
            customdata:    filtered.map(d => [d.depSM, d.ALL_TESTS_QC]),
            hovertemplate:
                "Salinity: %{x:.3f}<br>" +
                "Temperature: %{y:.3f} °C<br>" +
                "Depth: %{customdata[0]} m<br>" +
                "QC: %{customdata[1]}<extra></extra>",
        };
    });

    const axisStyle = {
        gridcolor:     "#3a3a4a",
        gridwidth:     1.5,
        zerolinecolor: "#3a3a4a",
        zerolinewidth: 1.5,
        tickfont:      { size: 14, color: "#aaa" },
        titlefont:     { size: 18, color: "#aaa" },
        linecolor:     "#444",
        linewidth:     2,
    };

    return (
        <div className="ts-diagram-container">
            <div className="ts-diagram-plot">
                <Plot
                    data={[...contourTraces, ...qcGroups]}
                    layout={{
                        title: {
                            text: "Temperature–Salinity Diagram (QC Colored)",
                            font: { size: 24, color: "#eaeaea" },
                        },
                        autosize:      true,
                        paper_bgcolor: "#1e1e2e",
                        plot_bgcolor:  "#1e1e2e",
                        font:          { color: "#aaa" },
                        xaxis: {
                            title: "Salinity (psu)",
                            // widen axis range slightly so right-side labels aren't clipped
                            range: [sMin - sPad, sMax + sPad * 2.5],
                            ...axisStyle,
                        },
                        yaxis: {
                            title: "Potential Temperature (°C)",
                            range: [tMin - tPad, tMax + tPad],
                            ...axisStyle,
                        },
                        legend: {
                            x:           1.02,
                            y:           1,
                            bgcolor:     "#1e1e2e",
                            bordercolor: "#444",
                            borderwidth: 1,
                            font:        { color: "#aaa" },
                        },
                        margin: { l: 80, r: 160, t: 80, b: 80 },
                    }}
                    style={{ width: "100%", height: "900px" }}
                    config={{ responsive: true, displaylogo: false }}
                />
            </div>
            <QCSummary data={data} />
        </div>
    );
}