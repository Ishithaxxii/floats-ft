function Legend({ activeShip, shipColorMap, ships, onSelectShip }) {
    return (
        <aside className="map-legend">
            <h3>Ships</h3>
            <button
                className={`legend-filter ${activeShip === "all" ? "active" : ""}`}
                type="button"
                onClick={() => onSelectShip("all")}
            >
                Show All
            </button>

            <div className="legend-items">
                {ships.length === 0 ? (
                    <p>No ships loaded</p>
                ) : (
                    ships.map((ship) => (
                        <button
                            className={`legend-item ${activeShip === ship ? "active" : ""}`}
                            key={ship}
                            type="button"
                            onClick={() => onSelectShip(ship)}
                        >
                            <span style={{ background: shipColorMap[ship] }} />
                            {ship}
                        </button>
                    ))
                )}
            </div>
        </aside>
    );
}

export default Legend;