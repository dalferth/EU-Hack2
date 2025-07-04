const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const app = express();

// Proxy für alle /api/meetings und Subrouten
app.use("/api/meetings", async (req, res) => {
    // baue Ziel-URL
    const subPath = req.path === "/" ? "" : req.path;
    const params = new URLSearchParams(req.query);
    if (!params.has("format")) {
        params.set("format", "application/ld+json");
    }
    const url = `https://data.europarl.europa.eu/api/v2/meetings${subPath}?${params.toString()}`;
    try {
        const response = await fetch(url, {
            headers: { accept: "application/ld+json" },
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Proxy error", details: e.message });
    }
});

// Proxy für /api/meps/:id (exakt wie die externe API, inkl. Query-Parameter und Accept-Header)
app.get("/api/meps/:id", async (req, res) => {
    const { id } = req.params;
    const params = new URLSearchParams(req.query);
    if (!params.has("format")) {
        params.set("format", "application/ld+json");
    }
    console.log(id);
    const url = `https://data.europarl.europa.eu/api/v2/meps/${id}?format=application%2Fld%2Bjson`;
    try {
        const response = await fetch(url, {
            headers: { accept: "application/ld+json" },
        });
        // Leite Status durch (z.B. 404)
        res.status(response.status);
        // Leite Content-Type durch
        res.set("content-type", response.headers.get("content-type") || "application/json");
        const text = await response.text();
        res.send(text);
    } catch (e) {
        res.status(500).json({ error: "Proxy error", details: e.message });
    }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
