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

export default function TSDiagram({ data }) {
    if (!data?.length) return null;

    const qcGroups = [1, 2, 3, 4, 9].map(qc => {
        const filtered = data.filter(
            d =>
                d.SAL_QC_VAR != null &&        // ← was Sal00
                d.TEMP_QC_VAR != null &&        // ← was t090C
                Number(d.ALL_TESTS_QC) === qc
        );

        return {
            x: filtered.map(d => d.SAL_QC_VAR),   // ← was Sal00
            y: filtered.map(d => d.TEMP_QC_VAR),   // ← was t090C
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

    return (
        <Plot
            data={qcGroups}
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
                    title: "Temperature (°C)",
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
    );
}