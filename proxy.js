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

const PORT = 4000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
