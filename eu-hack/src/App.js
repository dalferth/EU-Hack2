import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Beispiel-Endpoint, bitte ggf. anpassen, wenn die API-URL anders ist
        // Die API-Doku: https://data.europarl.europa.eu/en/developer-corner/opendata-api
        // Annahme: Es gibt einen /meetings Endpoint, der Meetings der letzten Tage liefert
        const fetchMeetings = async () => {
            setLoading(true);
            setError(null);
            try {
                const today = new Date().toISOString().slice(0, 10);
                console.log("Fetching meetings for date:", today);

                const res = await fetch(`/api/meetings?dateFrom=${today}&dateTo=${today}`);
                console.log("Response status:", res.status);
                console.log("Response headers:", res.headers);

                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }

                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    console.error("Non-JSON response:", text.substring(0, 200));
                    throw new Error("Response is not JSON");
                }

                const data = await res.json();
                console.log("API response:", data);
                setMeetings(data.data || data || []);
            } catch (e) {
                console.error("Fetch error:", e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchMeetings();
    }, []);

    return (
        <div className="App">
            <header
                className="App-header"
                style={{ background: "#003399", color: "white", padding: "2rem" }}
            >
                <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
                    EU Parliament – Events & Votes Today
                </h1>
                <p style={{ fontSize: "1.2rem" }}>
                    Letzte Sitzungen und Abstimmungen des Europäischen Parlaments
                </p>
            </header>
            <main
                style={{
                    maxWidth: 900,
                    margin: "2rem auto",
                    background: "white",
                    color: "#222",
                    borderRadius: 12,
                    boxShadow: "0 2px 16px #00339922",
                    padding: "2rem",
                }}
            >
                {loading && <p>Lade Events...</p>}
                {error && <p style={{ color: "red" }}>Fehler: {error}</p>}
                {!loading && !error && meetings.length === 0 && (
                    <p>Keine Events für heute gefunden.</p>
                )}
                {!loading && !error && meetings.length > 0 && (
                    <div>
                        <h2>Events & Abstimmungen ({meetings.length})</h2>
                        <ul style={{ listStyle: "none", padding: 0 }}>
                            {meetings.map((meeting) => (
                                <li
                                    key={meeting.id}
                                    style={{
                                        marginBottom: "2rem",
                                        borderBottom: "1px solid #eee",
                                        paddingBottom: "1rem",
                                    }}
                                >
                                    <h3 style={{ color: "#003399" }}>
                                        {meeting.title || meeting.name || "Meeting"}
                                    </h3>
                                    <p>
                                        <b>Datum:</b>{" "}
                                        {meeting.date || meeting.startDate || "unbekannt"}
                                    </p>
                                    <p>
                                        <b>Ort:</b> {meeting.location || "unbekannt"}
                                    </p>
                                    {/* Hier könnten weitere Details, Abstimmungen etc. geladen werden */}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
            <footer
                style={{
                    textAlign: "center",
                    color: "#003399",
                    margin: "2rem 0 1rem 0",
                    fontWeight: 500,
                }}
            >
                Datenquelle:{" "}
                <a
                    href="https://data.europarl.europa.eu/en/developer-corner/opendata-api"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    EU Parliament Open Data API
                </a>
            </footer>
        </div>
    );
}

export default App;
