const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const app = express();

// Globales Request-Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health-Check
app.get('/health', (req, res) => res.send('OK'));

// Cache für 2 Stunden (7.200.000 ms)
const CACHE_DURATION = 2 * 60 * 60 * 1000;
const cache = new Map();

// Cache-Funktion
function getCacheKey(url) {
    return url;
}

function getCachedResponse(cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Cache HIT for: ${cacheKey}`);
        console.log(`Cached data type: ${typeof cached.data}`);
        console.log(`Cached data preview: ${String(cached.data).substring(0, 100)}...`);
        return cached;
    }
    if (cached) {
        console.log(`Cache EXPIRED for: ${cacheKey}`);
        cache.delete(cacheKey);
    }
    return null;
}

function setCachedResponse(cacheKey, data, status, headers) {
    console.log(`Caching data type: ${typeof data}`);
    console.log(`Caching data preview: ${String(data).substring(0, 100)}...`);
    cache.set(cacheKey, {
        data,
        status,
        headers,
        timestamp: Date.now()
    });
    console.log(`Cache SET for: ${cacheKey}`);
}

// Cache-Status Endpoint
app.get("/api/cache/status", (req, res) => {
    const cacheSize = cache.size;
    const cacheEntries = Array.from(cache.entries()).map(([key, value]) => ({
        url: key,
        age: Math.round((Date.now() - value.timestamp) / 1000),
        expires: Math.round((CACHE_DURATION - (Date.now() - value.timestamp)) / 1000)
    }));
    res.json({
        cacheSize,
        cacheDuration: CACHE_DURATION / 1000,
        entries: cacheEntries
    });
});

// Cache löschen Endpoint
app.delete("/api/cache", (req, res) => {
    const clearedSize = cache.size;
    cache.clear();
    console.log(`Cache CLEARED: ${clearedSize} entries removed`);
    res.json({ message: `Cache cleared: ${clearedSize} entries removed` });
});

// Proxy für alle /api/meetings und Subrouten
app.use("/api/meetings", async (req, res) => {
    // baue Ziel-URL
    const subPath = req.path === "/" ? "" : req.path;
    const params = new URLSearchParams(req.query);
    if (!params.has("format")) {
        params.set("format", "application/ld+json");
    }
    
    // Korrekte URL-Konstruktion für die externe API
    let url;
    if (subPath === "" || subPath === "/") {
        // Haupt-Endpunkt: /api/meetings
        url = `https://data.europarl.europa.eu/api/v2/meetings?${params.toString()}`;
    } else {
        // Sub-Endpunkte: /api/meetings/{id}/activities, /api/meetings/{id}/decisions, etc.
        // Entferne führenden Slash und baue die korrekte URL
        const cleanPath = subPath.startsWith("/") ? subPath.substring(1) : subPath;
        url = `https://data.europarl.europa.eu/api/v2/meetings/${cleanPath}?${params.toString()}`;
    }
    
    console.log(`Meetings URL: ${url}`);
    console.log(`Original path: ${req.path}, subPath: ${subPath}`);
    
    // Prüfe Cache
    const cacheKey = getCacheKey(url);
    const cached = getCachedResponse(cacheKey);
    
    if (cached) {
        console.log(`Using cached response for meetings`);
        // Verwende gecachte Antwort
        res.status(cached.status);
        if (cached.headers) {
            Object.entries(cached.headers).forEach(([key, value]) => {
                res.set(key, value);
            });
        }
        // Stelle sicher, dass cached.data als JSON zurückgegeben wird
        try {
            const data = typeof cached.data === "string" ? JSON.parse(cached.data) : cached.data;
            console.log(`Sending cached JSON response, data type: ${typeof data}`);
            return res.json(data);
        } catch (parseError) {
            console.error("Error parsing cached meetings data:", parseError);
            return res.status(500).json({ error: "Invalid cached meetings data" });
        }
    }
    
    try {
        console.log(`Fetching from external API: ${url}`);
        const response = await fetch(url, {
            headers: { accept: "application/ld+json" },
        });
        console.log(`External response status: ${response.status}`);
        console.log(`External response content-type: ${response.headers.get("content-type")}`);
        
        if (!response.ok) {
            console.error(`External API error: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ 
                error: "External API error", 
                status: response.status,
                message: response.statusText 
            });
        }
        
        const data = await response.json();
        console.log(`External response data type: ${typeof data}`);
        console.log(`External response data preview: ${JSON.stringify(data).substring(0, 100)}...`);
        
        // Cache die Antwort als String für Konsistenz
        const headers = {};
        response.headers.forEach((value, key) => {
            // Filtere problematische Header, die zu 502 Fehlern führen können
            const lowerKey = key.toLowerCase();
            if (lowerKey !== 'content-length' && lowerKey !== 'transfer-encoding') {
                headers[key] = value;
            }
        });
        setCachedResponse(cacheKey, JSON.stringify(data), response.status, headers);
        
        res.status(response.status);
        console.log(`Sending JSON response to client, data type: ${typeof data}`);
        res.json(data);
    } catch (e) {
        console.error("Error in meetings proxy:", e);
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
    
    const url = `https://data.europarl.europa.eu/api/v2/meps/${id}?format=application%2Fld%2Bjson`;
    console.log(`MEPs URL: ${url}`);
    
    // Prüfe Cache
    const cacheKey = getCacheKey(url);
    const cached = getCachedResponse(cacheKey);
    
    if (cached) {
        console.log(`Using cached response for MEP ${id}`);
        res.status(cached.status);
        if (cached.headers) {
            Object.entries(cached.headers).forEach(([key, value]) => {
                res.set(key, value);
            });
        }
        // Prüfe Content-Type im Cache
        const contentType = cached.headers && (cached.headers["content-type"] || cached.headers["Content-Type"]);
        console.log(`Cached content-type: ${contentType}`);
        if (contentType && (contentType.includes("application/json") || contentType.includes("application/ld+json"))) {
            try {
                const data = typeof cached.data === "string" ? JSON.parse(cached.data) : cached.data;
                console.log(`Sending cached JSON response for MEP, data type: ${typeof data}`);
                return res.json(data);
            } catch (parseError) {
                console.error("Error parsing cached MEP JSON:", parseError);
                return res.status(500).json({ error: "Invalid cached MEP data" });
            }
        } else {
            console.log(`Sending cached text response for MEP`);
            return res.send(cached.data);
        }
    }
    
    try {
        console.log(`Fetching MEP from external API: ${url}`);
        const response = await fetch(url, {
            headers: { accept: "application/ld+json" },
        });
        console.log(`External MEP response status: ${response.status}`);
        console.log(`External MEP response content-type: ${response.headers.get("content-type")}`);
        
        res.status(response.status);
        res.set("content-type", response.headers.get("content-type") || "application/json");
        const contentType = response.headers.get("content-type") || "";
        
        if (contentType.includes("application/json") || contentType.includes("application/ld+json")) {
            const data = await response.json();
            console.log(`External MEP response data type: ${typeof data}`);
            console.log(`External MEP response data preview: ${JSON.stringify(data).substring(0, 100)}...`);
            
            // Cache die Antwort als String für Konsistenz
            const headers = {};
            response.headers.forEach((value, key) => {
                // Filtere problematische Header, die zu 502 Fehlern führen können
                const lowerKey = key.toLowerCase();
                if (lowerKey !== 'content-length' && lowerKey !== 'transfer-encoding') {
                    headers[key] = value;
                }
            });
            setCachedResponse(cacheKey, JSON.stringify(data), response.status, headers);
            console.log(`Sending JSON response to client for MEP, data type: ${typeof data}`);
            res.json(data);
        } else {
            const data = await response.text();
            console.log(`External MEP response data type: ${typeof data}`);
            console.log(`External MEP response data preview: ${String(data).substring(0, 100)}...`);
            
            // Cache die Antwort
            const headers = {};
            response.headers.forEach((value, key) => {
                // Filtere problematische Header, die zu 502 Fehlern führen können
                const lowerKey = key.toLowerCase();
                if (lowerKey !== 'content-length' && lowerKey !== 'transfer-encoding') {
                    headers[key] = value;
                }
            });
            setCachedResponse(cacheKey, data, response.status, headers);
            console.log(`Sending text response to client for MEP`);
            res.send(data);
        }
    } catch (e) {
        console.error("Error in MEPs proxy:", e);
        res.status(500).json({ error: "Proxy error", details: e.message });
    }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Proxy listening on port ${PORT} with 5-minute caching enabled`));