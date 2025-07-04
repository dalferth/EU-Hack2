import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [details, setDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState(null);
    const [expandedDecision, setExpandedDecision] = useState({});
    const [personNames, setPersonNames] = useState({});
    const [loadingPersons, setLoadingPersons] = useState({});
    const year = 2025;
    const limit = 10;

    // Hilfsfunktion für sicheres JSON-Parsing
    const safeJsonFetch = async (url, errorMessage) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(errorMessage || `HTTP error! status: ${response.status}`);
            }
            
            const contentType = response.headers.get("content-type");
            if (!contentType || (!contentType.includes("application/json") && !contentType.includes("application/ld+json"))) {
                const text = await response.text();
                console.error("Non-JSON response:", text.substring(0, 200));
                throw new Error("Response is not JSON");
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
            throw error;
        }
    };

    useEffect(() => {
        const fetchMeetings = async () => {
            setLoading(true);
            setError(null);
            try {
                // Schritt 1: Anzahl der Events für das Jahr holen
                const countData = await safeJsonFetch(`/api/meetings?year=${year}&limit=1`, "Fehler beim Laden der Event-Anzahl");
                const total = countData.total || (countData.data ? countData.data.length : 0);
                const offset = total > limit ? total - limit : 17;

                // Schritt 2: Die letzten 10 Events holen
                const data = await safeJsonFetch(`/api/meetings?year=${year}&offset=${offset}&limit=${limit}`, "Fehler beim Laden der Events");
                setMeetings((data.data || data || []).reverse());
            } catch (e) {
                console.error("Fetch error:", e);
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchMeetings();
    }, []);

    const formatDate = (dateString) => {
        if (!dateString) return "";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString("de-DE", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        } catch (e) {
            return dateString;
        }
    };

    const getMeetingTitle = (meeting) => {
        if (meeting.activity_label?.de) {
            return meeting.activity_label.de;
        }
        if (meeting.activity_label?.en) {
            return meeting.activity_label.en;
        }
        if (meeting.activity_label && Object.values(meeting.activity_label).length > 0) {
            return Object.values(meeting.activity_label)[0];
        }
        // Fallback: Nur das formatierte Datum als Titel
        const date =
            meeting["eli-dl:activity_date"]?.["@value"] ||
            meeting.activity_start_date ||
            meeting.activity_date;
        return date ? formatDate(date) : "";
    };

    const getMeetingLocation = (meeting) => {
        if (meeting.hasLocality) {
            // Extrahiere den Ortsnamen aus der URL
            const urlParts = meeting.hasLocality.split("/");
            const location = urlParts[urlParts.length - 1];
            if (location === "FRA_SXB") {
                return "Straßburg, Frankreich";
            }
            return location.replace("_", ", ");
        }
        return "Straßburg, Frankreich"; // Standard-Ort für EU-Parlament
    };

    // Details laden
    const fetchDetails = async (meeting) => {
        setDetailsLoading(true);
        setDetailsError(null);
        setDetails(null);
        try {
            const id = meeting.activity_id || meeting.id;
            // Basisdetails
            const [main, activities, decisions, foreseen, votes, meetingDecisions] =
                await Promise.all([
                    safeJsonFetch(`/api/meetings/${id}`, "Fehler beim Laden der Sitzungsdetails"),
                    safeJsonFetch(`/api/meetings/${id}/activities`, "Fehler beim Laden der Aktivitäten"),
                    safeJsonFetch(`/api/meetings/${id}/decisions`, "Fehler beim Laden der Entscheidungen"),
                    safeJsonFetch(`/api/meetings/${id}/foreseen-activities`, "Fehler beim Laden der geplanten Aktivitäten"),
                    safeJsonFetch(`/api/meetings/${id}/vote-results`, "Fehler beim Laden der Abstimmungsergebnisse"),
                    safeJsonFetch(`/api/meetings/${id}/decisions`, "Fehler beim Laden der Entscheidungen"),
                ]);
            setDetails({ main, activities, decisions, foreseen, votes, meetingDecisions });
        } catch (e) {
            setDetailsError("Für diese Sitzung sind keine Detaildaten verfügbar.");
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleMeetingClick = (meeting) => {
        setSelectedMeeting(meeting);
        fetchDetails(meeting);
    };

    const handleBack = () => {
        setSelectedMeeting(null);
        setDetails(null);
        setDetailsError(null);
    };

    const handleExpandDecision = async (decisionId, type, ids) => {
        setExpandedDecision((prev) => ({
            ...prev,
            [decisionId]: {
                type,
                open: prev[decisionId]?.type !== type || !prev[decisionId]?.open,
                ids,
            },
        }));
        if (!ids.length) return;
        // Nur laden, wenn noch nicht vorhanden
        const missing = ids.filter((pid) => !personNames[pid]);
        if (missing.length) {
            setLoadingPersons((prev) => ({ ...prev, [`${decisionId}_${type}`]: true }));
            // Hole Namen und Bild für alle fehlenden Personen parallel
            const results = await Promise.all(
                missing.map(async (pid) => {
                    const mepId = pid.split("/").pop();
                    try {
                        const data = await safeJsonFetch(`/api/meps/${mepId}`, "Fehler beim Laden der Personendaten");
                        const d = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
                        return {
                            pid,
                            name: d?.label || d?.fullName || d?.name || pid,
                            img: d?.img,
                        };
                    } catch (error) {
                        console.error(`Error loading person ${mepId}:`, error);
                        return { pid, name: pid, img: null };
                    }
                })
            );
            const newNames = {};
            results.forEach(({ pid, name, img }) => {
                newNames[pid] = { name, img };
            });
            setPersonNames((prev) => ({ ...prev, ...newNames }));
            setLoadingPersons((prev) => ({ ...prev, [`${decisionId}_${type}`]: false }));
        }
    };

    return (
        <div className="App">
            <header
                className="App-header"
                style={{ background: "#003399", color: "white", padding: "2rem" }}
            >
                <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
                    EU Parliament – Events & Votes {year}
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
                    <p>Keine Events für dieses Jahr gefunden.</p>
                )}
                {!loading && !error && meetings.length > 0 && !selectedMeeting && (
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
                                        cursor: "pointer",
                                        background: "#f7faff",
                                        borderRadius: 8,
                                        transition: "background 0.2s",
                                    }}
                                    onClick={() => handleMeetingClick(meeting)}
                                    title="Details anzeigen"
                                >
                                    <h3 style={{ color: "#003399" }}>{getMeetingTitle(meeting)}</h3>
                                    <p>
                                        <b>Datum:</b>{" "}
                                        {formatDate(
                                            meeting["eli-dl:activity_date"]?.["@value"] ||
                                                meeting.activity_start_date
                                        )}
                                    </p>
                                    <p>
                                        <b>Ort:</b> {getMeetingLocation(meeting)}
                                    </p>
                                    {meeting.consists_of && meeting.consists_of.length > 0 && (
                                        <p>
                                            <b>Abstimmungen:</b> {meeting.consists_of.length}{" "}
                                            Abstimmungen geplant
                                        </p>
                                    )}
                                    <p>
                                        <b>Typ:</b>{" "}
                                        {meeting.had_activity_type ===
                                        "def/ep-activities/PLENARY_SITTING"
                                            ? "Plenarsitzung"
                                            : meeting.had_activity_type}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {/* Detailansicht */}
                {selectedMeeting && (
                    <div style={{ marginTop: 32 }}>
                        <button onClick={handleBack} style={{ marginBottom: 16 }}>
                            &larr; Zurück
                        </button>
                        {detailsLoading && <p>Lade Details...</p>}
                        {detailsError && <p style={{ color: "red" }}>{detailsError}</p>}
                        {details && (
                            <div
                                style={{
                                    marginTop: 16,
                                    background: "#f7faff",
                                    borderRadius: 12,
                                    padding: 24,
                                    boxShadow: "0 2px 8px #00339922",
                                }}
                            >
                                {/* Kopfbereich: Titel, Datum, Typ */}
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        marginBottom: 16,
                                    }}
                                >
                                    <span style={{ fontSize: 32, marginRight: 16 }}>📄</span>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 22 }}>
                                            {getMeetingTitle(details.main)}
                                        </div>
                                        <div
                                            style={{
                                                color: "#003399",
                                                fontWeight: 500,
                                                fontSize: 16,
                                            }}
                                        >
                                            {formatDate(
                                                details.main["eli-dl:activity_date"]?.["@value"] ||
                                                    details.main.activity_start_date ||
                                                    details.main.activity_date
                                            )}
                                        </div>
                                        <div style={{ fontSize: 14, color: "#666" }}>
                                            {getMeetingLocation(details.main)}
                                        </div>
                                    </div>
                                </div>
                                {/* Abstimmungsergebnisse (neu: aus /decisions) */}
                                <div style={{ margin: "24px 0" }}>
                                    <h3 style={{ color: "#003399", marginBottom: 8 }}>
                                        Abstimmungsergebnisse
                                    </h3>
                                    {Array.isArray(details.meetingDecisions.data) &&
                                    details.meetingDecisions.data.length > 0 ? (
                                        <table
                                            style={{
                                                width: "100%",
                                                borderCollapse: "collapse",
                                                background: "#fff",
                                                borderRadius: 8,
                                            }}
                                        >
                                            <thead>
                                                <tr style={{ background: "#e6eaff" }}>
                                                    <th style={{ textAlign: "left", padding: 8 }}>
                                                        Titel
                                                    </th>
                                                    <th style={{ textAlign: "center", padding: 8 }}>
                                                        ✅ Ja
                                                    </th>
                                                    <th style={{ textAlign: "center", padding: 8 }}>
                                                        ❌ Nein
                                                    </th>
                                                    <th style={{ textAlign: "center", padding: 8 }}>
                                                        ➖ Enth.
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {details.meetingDecisions.data
                                                    .filter((d) => {
                                                        const favor = d.had_voter_favor || [];
                                                        const against = d.had_voter_against || [];
                                                        const abstain =
                                                            d.had_voter_abstention || [];
                                                        return (
                                                            favor.length > 0 ||
                                                            against.length > 0 ||
                                                            abstain.length > 0
                                                        );
                                                    })
                                                    .map((d) => {
                                                        const favor = d.had_voter_favor || [];
                                                        const against = d.had_voter_against || [];
                                                        const abstain =
                                                            d.had_voter_abstention || [];
                                                        return (
                                                            <React.Fragment key={d.id}>
                                                                <tr
                                                                    style={{
                                                                        borderBottom:
                                                                            "1px solid #eee",
                                                                    }}
                                                                >
                                                                    <td style={{ padding: 8 }}>
                                                                        {d.activity_label?.de ||
                                                                            d.activity_label?.en ||
                                                                            d.activity_label?.fr ||
                                                                            d.activity_id}
                                                                    </td>
                                                                    <td
                                                                        style={{
                                                                            textAlign: "center",
                                                                            padding: 8,
                                                                        }}
                                                                    >
                                                                        <button
                                                                            style={{
                                                                                background: "none",
                                                                                border: "none",
                                                                                color: "#003399",
                                                                                cursor: favor.length
                                                                                    ? "pointer"
                                                                                    : "default",
                                                                                fontWeight: 600,
                                                                            }}
                                                                            disabled={!favor.length}
                                                                            onClick={() =>
                                                                                handleExpandDecision(
                                                                                    d.id,
                                                                                    "favor",
                                                                                    favor
                                                                                )
                                                                            }
                                                                        >
                                                                            {favor.length}
                                                                        </button>
                                                                    </td>
                                                                    <td
                                                                        style={{
                                                                            textAlign: "center",
                                                                            padding: 8,
                                                                        }}
                                                                    >
                                                                        <button
                                                                            style={{
                                                                                background: "none",
                                                                                border: "none",
                                                                                color: "#c00",
                                                                                cursor: against.length
                                                                                    ? "pointer"
                                                                                    : "default",
                                                                                fontWeight: 600,
                                                                            }}
                                                                            disabled={
                                                                                !against.length
                                                                            }
                                                                            onClick={() =>
                                                                                handleExpandDecision(
                                                                                    d.id,
                                                                                    "against",
                                                                                    against
                                                                                )
                                                                            }
                                                                        >
                                                                            {against.length}
                                                                        </button>
                                                                    </td>
                                                                    <td
                                                                        style={{
                                                                            textAlign: "center",
                                                                            padding: 8,
                                                                        }}
                                                                    >
                                                                        <button
                                                                            style={{
                                                                                background: "none",
                                                                                border: "none",
                                                                                color: "#666",
                                                                                cursor: abstain.length
                                                                                    ? "pointer"
                                                                                    : "default",
                                                                                fontWeight: 600,
                                                                            }}
                                                                            disabled={
                                                                                !abstain.length
                                                                            }
                                                                            onClick={() =>
                                                                                handleExpandDecision(
                                                                                    d.id,
                                                                                    "abstain",
                                                                                    abstain
                                                                                )
                                                                            }
                                                                        >
                                                                            {abstain.length}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                                {/* Expandierte Namen */}
                                                                {expandedDecision[d.id]?.type &&
                                                                    expandedDecision[d.id]
                                                                        ?.open && (
                                                                        <tr>
                                                                            <td
                                                                                colSpan={4}
                                                                                style={{
                                                                                    background:
                                                                                        "#f7faff",
                                                                                    padding: 8,
                                                                                }}
                                                                            >
                                                                                {loadingPersons[
                                                                                    `${d.id}_${
                                                                                        expandedDecision[
                                                                                            d.id
                                                                                        ].type
                                                                                    }`
                                                                                ] ? (
                                                                                    <span>
                                                                                        Lade
                                                                                        Namen...
                                                                                    </span>
                                                                                ) : (
                                                                                    <ul
                                                                                        style={{
                                                                                            margin: 0,
                                                                                            padding: 0,
                                                                                            columns: 2,
                                                                                        }}
                                                                                    >
                                                                                        {expandedDecision[
                                                                                            d.id
                                                                                        ].ids.map(
                                                                                            (
                                                                                                pid
                                                                                            ) => (
                                                                                                <li
                                                                                                    key={
                                                                                                        pid
                                                                                                    }
                                                                                                    style={{
                                                                                                        listStyle:
                                                                                                            "none",
                                                                                                        marginBottom: 4,
                                                                                                        display:
                                                                                                            "flex",
                                                                                                        alignItems:
                                                                                                            "center",
                                                                                                    }}
                                                                                                >
                                                                                                    {personNames[
                                                                                                        pid
                                                                                                    ]
                                                                                                        ?.img && (
                                                                                                        <img
                                                                                                            src={
                                                                                                                personNames[
                                                                                                                    pid
                                                                                                                ]
                                                                                                                    .img
                                                                                                            }
                                                                                                            alt={
                                                                                                                personNames[
                                                                                                                    pid
                                                                                                                ]
                                                                                                                    .name
                                                                                                            }
                                                                                                            style={{
                                                                                                                width: 24,
                                                                                                                height: 24,
                                                                                                                borderRadius:
                                                                                                                    "50%",
                                                                                                                marginRight: 8,
                                                                                                                objectFit:
                                                                                                                    "cover",
                                                                                                            }}
                                                                                                        />
                                                                                                    )}
                                                                                                    {personNames[
                                                                                                        pid
                                                                                                    ]
                                                                                                        ?.name ||
                                                                                                        pid}
                                                                                                </li>
                                                                                            )
                                                                                        )}
                                                                                    </ul>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p style={{ color: "#666" }}>
                                            Keine Abstimmungsergebnisse gefunden.
                                        </p>
                                    )}
                                </div>
                                {/* Optional: Link zu Dokumenten */}
                                {details.main.based_on_a_realization_of &&
                                    details.main.based_on_a_realization_of.length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <b>Dokument(e):</b>{" "}
                                            {details.main.based_on_a_realization_of.map(
                                                (doc, i) => (
                                                    <span key={doc}>
                                                        <a
                                                            href={`https://data.europarl.europa.eu/${doc}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            {doc}
                                                        </a>
                                                        {i <
                                                        details.main.based_on_a_realization_of
                                                            .length -
                                                            1
                                                            ? ", "
                                                            : ""}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    )}
                            </div>
                        )}
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
