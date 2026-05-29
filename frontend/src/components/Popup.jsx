function Popup({ station, onOpenProfile }) {
    return (
        <div className="station-popup">
            <h3>{station.station}</h3>

            <div className="popup-content">
                <p><b>Ship:</b> {station.ship}</p>
                <p><b>Cruise:</b> {station.cruise}</p>
                <p><b>Station:</b> {station.station}</p>
                <p><b>Datetime:</b> {station.datetime}</p>
                <p><b>Depth:</b> {station.depth}</p>

                <p>
                    <b>Lat:</b>{" "}
                    {Number(station.latitude).toFixed(4)}
                </p>

                <p>
                    <b>Lon:</b>{" "}
                    {Number(station.longitude).toFixed(4)}
                </p>
            </div>

            <button
                type="button"
                className="profile-button"
                onClick={() => {
                    console.log("BUTTON CLICKED");
                    console.log("FILE:", station.file_name);

                    onOpenProfile(station.file_name);
                }}
            >
                View Profile
            </button>
        </div>
    );
}

export default Popup;