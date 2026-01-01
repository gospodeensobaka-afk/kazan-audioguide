/* ========================================================
   =============== GLOBAL VARIABLES & STATE ===============
   ======================================================== */

let map;
let currentPointImage = null;

const togglePhotoBtn = document.getElementById("togglePhotoBtn");
const photoOverlay = document.getElementById("photoOverlay");
const photoImage = document.getElementById("photoImage");
const closePhotoBtn = document.getElementById("closePhotoBtn");

let arrowEl = null;
let lastCoords = null;
let zones = [];

let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

let gpsActive = true;
let audioEnabled = false;
let audioPlaying = false;

let fullRoute = [];
let passedRoute = [];

let compassActive = false;
let smoothAngle = 0;
let compassUpdates = 0;

let gpsAngleLast = null;
let gpsUpdates = 0;

let arrowPngStatus = "init";
let iconsPngStatus = "init";

let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let lastRouteDist = null;
let lastRouteSegmentIndex = null;
let lastZoneDebug = "";

const ROUTE_HITBOX_METERS = 6;

/* ========================================================
   ===================== UTILITIES ========================
   ======================================================== */

function distance(a, b) {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const x = dLon * Math.cos((lat1 + lat2) / 2);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * R;
}

function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}

function normalizeAngle(a) {
    return (a + 360) % 360;
}

function latLngToXY(lat, lng) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const x = R * lng * rad * Math.cos(lat * rad);
    const y = R * lat * rad;
    return { x, y };
}

function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
    const p = latLngToXY(pointLatLng[0], pointLatLng[1]);
    const a = latLngToXY(aLngLat[1], aLngLat[0]);
    const b = latLngToXY(bLngLat[1], bLngLat[0]);

    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;

    const len2 = vx * vx + vy * vy;
    if (len2 === 0) {
        const dist = Math.sqrt(wx * wx + wy * wy);
        return { dist, t: 0, projLngLat: [aLngLat[0], aLngLat[1]] };
    }

    let t = (wx * vx + wy * vy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * vx;
    const projY = a.y + t * vy;

    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const invRad = 180 / (Math.PI * 6371000);
    const projLat = projY * invRad;
    const projLng = projX * invRad / Math.cos(projLat * Math.PI / 180);

    return { dist, t, projLngLat: [projLng, projLat] };
}

/* ========================================================
   ===================== AUDIO ZONES =======================
   ======================================================== */

function playZoneAudio(src) {
    if (!audioEnabled || audioPlaying) return;
    const audio = new Audio(src);
    audioPlaying = true;
    audio.play().catch(() => { audioPlaying = false; });
    audio.onended = () => { audioPlaying = false; };
}

function updateCircleColors() {
    const source = map.getSource("audio-circles");
    if (!source) return;
    source.setData({
        type: "FeatureCollection",
        features: zones
            .filter(z => z.type === "audio")
            .map(z => ({
                type: "Feature",
                properties: { id: z.id, visited: z.visited },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            }))
    });
}

function checkZones(coords) {
    zones.forEach(z => {
        if (z.type !== "audio") return;

        const dist = distance(coords, [z.lat, z.lng]);

        // СТАРАЯ НАДЁЖНАЯ ЛОГИКА
        if (!z.visited && dist <= z.radius) {
            z.visited = true;
            updateCircleColors();
            if (z.audio) playZoneAudio(z.audio);
        }
    });
}

/* ========================================================
   ===================== SUPER DEBUG =======================
   ======================================================== */

function ensureSuperDebug() {
    let dbg = document.getElementById("superDebug");
    if (!dbg) {
        dbg = document.createElement("div");
        dbg.id = "superDebug";
        dbg.style.position = "fixed";
        dbg.style.bottom = "0";
        dbg.style.left = "0";
        dbg.style.width = "100%";
        dbg.style.padding = "8px 10px";
        dbg.style.background = "rgba(0,0,0,0.75)";
        dbg.style.color = "white";
        dbg.style.fontSize = "12px";
        dbg.style.fontFamily = "monospace";
        dbg.style.zIndex = "99999";
        dbg.style.whiteSpace = "pre-line";
        dbg.style.display = "block";
        document.body.appendChild(dbg);
    }
    return dbg;
}

function debugUpdate(source, angle, error = "none") {
    const dbg = ensureSuperDebug();

    if (!arrowEl) {
        dbg.textContent = "NO ARROW ELEMENT";
        return;
    }

    const tr = arrowEl.style.transform || "none";
    let computed = "none";
    try { computed = window.getComputedStyle(arrowEl).transform; }
    catch (e) { computed = "error"; }

    const ow = arrowEl.offsetWidth;
    const oh = arrowEl.offsetHeight;

    const rect = arrowEl.getBoundingClientRect();
    const boxRaw =
        `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, ` +
        `w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;

    const vis = arrowEl.style.visibility || "undefined";

    const routeDistStr =
        (lastRouteDist == null) ? "n/a" : `${lastRouteDist.toFixed(1)}m`;
    const routeSegStr =
        (lastRouteSegmentIndex == null) ? "n/a" : `${lastRouteSegmentIndex}`;

    const zoneInfo = lastZoneDebug || "none";

    dbg.textContent =
`SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | ERR: ${error}

--- TRANSFORM ---
SET:   ${tr}
COMP:  ${computed}

--- LAYOUT ---
offset: ${ow}x${oh}
BOX:    ${boxRaw}

--- STATE ---
CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}

--- MAP / ROUTE ---
routeDist: ${routeDistStr} | seg: ${routeSegStr}

--- ZONE ---
${zoneInfo}

--- PNG ---
arrow=${arrowPngStatus}, icons=${iconsPngStatus}
`;
}/* ========================================================
   ===================== MOVE MARKER =======================
   ======================================================== */

function updateArrowPositionFromCoords(coords) {
    if (!map || !arrowEl || !coords) return;

    const lngLat = [coords[1], coords[0]];
    const p = map.project(lngLat);

    arrowEl.style.left = `${p.x}px`;
    arrowEl.style.top = `${p.y}px`;
}

function applyArrowTransform(angle) {
    if (!arrowEl) return;
    const a = isNaN(angle) ? 0 : angle;
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${a}deg)`;
    arrowEl.style.visibility = "visible";
    arrowEl.style.willChange = "transform";
}

function handleMapMove() {
    if (!lastCoords) return;
    updateArrowPositionFromCoords(lastCoords);

    const src = compassActive ? "compass" : "gps";
    const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
    debugUpdate(src, ang);
}

function moveMarker(coords) {
    const prevCoords = lastCoords;
    lastCoords = coords;

    updateArrowPositionFromCoords(coords);

    // GPS‑поворот, если компас выключен
    if (!compassActive && prevCoords) {
        const angle = calculateAngle(prevCoords, coords);
        gpsAngleLast = Math.round(angle);
        gpsUpdates++;
        applyArrowTransform(angle);
    }

    /* ========================================================
       ========== УМНАЯ ПЕРЕКРАСКА МАРШРУТА ===================
       ======================================================== */

    let bestIndex = null;
    let bestDist = Infinity;
    let bestProj = null;
    let bestT = 0;

    if (fullRoute.length >= 2) {
        for (let i = 0; i < fullRoute.length - 1; i++) {
            const a = fullRoute[i].coord;
            const b = fullRoute[i + 1].coord;

            const info = pointToSegmentInfo([coords[0], coords[1]], a, b);

            if (info.dist < bestDist) {
                bestDist = info.dist;
                bestIndex = i;
                bestProj = info.projLngLat;
                bestT = info.t;
            }
        }
    }

    lastRouteDist = bestDist;
    lastRouteSegmentIndex = bestIndex;

    /* ========================================================
       ========== КОСТЫЛЬ-ЛИНИЯ (ОТКЛЮЧИТЬ) ==================
       ======================================================== */

    const hackLayer = map.getLayer("route-hack-line");
    if (hackLayer) {
        map.setLayoutProperty("route-hack-line", "visibility", "none");
    }

    /* ========================================================
       ========== ПЕРЕКРАСКА МАРШРУТА =========================
       ======================================================== */

    if (bestIndex != null && bestDist <= ROUTE_HITBOX_METERS && bestProj) {

        const passedCoords = [];
        const remainingCoords = [];

        for (let i = 0; i < fullRoute.length; i++) {
            remainingCoords.push(fullRoute[i].coord);
        }

        for (let i = 0; i < bestIndex; i++) {
            passedCoords.push(fullRoute[i].coord);
        }

        const a = fullRoute[bestIndex].coord;
        const b = fullRoute[bestIndex + 1].coord;

        if (bestT <= 0) {
            passedCoords.push(a);

        } else if (bestT >= 1) {
            passedCoords.push(a, b);

        } else {
            const proj = bestProj;
            passedCoords.push(a, proj);
            remainingCoords[bestIndex] = proj;
        }

        map.getSource("route-passed").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: passedCoords }
        });

        map.getSource("route-remaining").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: remainingCoords }
        });
    }

    /* ========================================================
       ====================== AUDIO ZONES ======================
       ======================================================== */

    checkZones(coords);

    /* ========================================================
       ========== PHOTO ACTIVATION FOR SQUARE POINTS ==========
       ======================================================== */

    zones.forEach(z => {
        if (z.type !== "square" || !z.image) return;

        const dist = distance(coords, [z.lat, z.lng]);

        // Вход в круг → показать кнопку и фото
        if (!z.entered && dist <= 30) {
            z.entered = true;
            currentPointImage = z.image;
            togglePhotoBtn.style.display = "block";
            photoImage.src = z.image;
            photoOverlay.classList.remove("hidden");
        }

        // Выход из круга → спрятать кнопку
        if (z.entered && dist > 30) {
            z.entered = false;
            togglePhotoBtn.style.display = "none";
        }
    });

    /* ========================================================
       ===================== FINAL DEBUG ======================
       ======================================================== */

    const src = compassActive ? "compass" : "gps";
    const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
    debugUpdate(src, ang);
}

/* ========================================================
   ================== SIMULATION STEP ======================
   ======================================================== */

function simulateNextStep() {
    if (!simulationActive) return;
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;
        return;
    }

    const next = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarker(next);

    setTimeout(simulateNextStep, 1200);
}

/* ========================================================
   ================== START SIMULATION =====================
   ======================================================== */

function startSimulation() {
    if (!simulationPoints.length) return;

    simulationActive = true;
    gpsActive = false;
    compassActive = false;

    simulationIndex = 0;

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}/* ========================================================
   ======================= INIT MAP ========================
   ======================================================== */

async function initMap() {
    const initialCenter = [49.082118, 55.826584];

    map = new maplibregl.Map({
        container: "map",
        style: "style.json?v=2",
        center: initialCenter,
        zoom: 18
    });

    const mapContainer = document.getElementById("map");
    if (mapContainer && getComputedStyle(mapContainer).position === "static") {
        mapContainer.style.position = "relative";
    }

    map.on("load", async () => {

        /* ========================================================
           ========== REMOVE OLD ROUTE LAYERS (COSTYL) ============
           ======================================================== */

        const oldLayers = ["route", "route-line", "route-hack-line"];
        oldLayers.forEach(id => {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, "visibility", "none");
            }
        });

        /* ========================================================
           ======================= LOAD DATA ======================
           ======================================================== */

        const points = await fetch("points.json").then(r => r.json());
        const route = await fetch("route.json").then(r => r.json());

        fullRoute = route.geometry.coordinates.map(c => ({
            coord: [c[0], c[1]]
        }));

        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);

        /* ========================================================
           ===================== ROUTE SOURCES ====================
           ======================================================== */

        map.addSource("route-passed", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: [] }
            }
        });

        map.addSource("route-remaining", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: fullRoute.map(pt => pt.coord)
                }
            }
        });

        /* ========================================================
           ====================== ROUTE LAYERS =====================
           ======================================================== */

        map.addLayer({
            id: "route-remaining-line",
            type: "line",
            source: "route-remaining",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#007aff" }
        });

        map.addLayer({
            id: "route-passed-line",
            type: "line",
            source: "route-passed",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#333333" }
        });

        /* ========================================================
           ====================== AUDIO ZONES ======================
           ======================================================== */

        const circleFeatures = [];

        points.forEach(p => {
            zones.push({
                id: p.id,
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                radius: p.radius || 20,
                visited: false,
                entered: false,
                type: p.type,
                audio: p.type === "audio" ? `audio/${p.id}.mp3` : null,
                image: p.image || null
            });

            if (p.type === "audio") {
                circleFeatures.push({
                    type: "Feature",
                    properties: { id: p.id, visited: false },
                    geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                });
            }

            /* PNG markers */
            if (p.type === "square") {
                const el = document.createElement("div");
                el.style.width = "40px";
                el.style.height = "40px";
                el.style.display = "flex";
                el.style.alignItems = "center";
                el.style.justifyContent = "center";

                const img = document.createElement("img");
                img.src = `https://gospodeensobaka-afk.github.io/kazan-audioguide/icons/left.png`;
                img.style.width = "32px";
                img.style.height = "32px";

                img.onload = () => { iconsPngStatus = "ok"; };
                img.onerror = () => {
                    iconsPngStatus = "error";
                    debugUpdate("none", null, "PNG_LOAD_FAIL");
                };

                el.appendChild(img);

                new maplibregl.Marker({ element: el })
                    .setLngLat([p.lng, p.lat])
                    .addTo(map);
            }
        });

        /* ========================================================
           ==================== AUDIO CIRCLES ======================
           ======================================================== */

        map.addSource("audio-circles", {
            type: "geojson",
            data: { type: "FeatureCollection", features: circleFeatures }
        });

        map.addLayer({
            id: "audio-circles-layer",
            type: "circle",
            source: "audio-circles",
            paint: {
                "circle-radius": 20,
                "circle-color": [
                    "case",
                    ["boolean", ["get", "visited"], false],
                    "rgba(0,255,0,0.25)",
                    "rgba(255,0,0,0.15)"
                ],
                "circle-stroke-color": [
                    "case",
                    ["boolean", ["get", "visited"], false],
                    "rgba(0,255,0,0.6)",
                    "rgba(255,0,0,0.4)"
                ],
                "circle-stroke-width": 2
            }
        });

        /* ========================================================
           ==================== PHOTO CIRCLES ======================
           ======================================================== */

        const photoCircleFeatures = zones
            .filter(z => z.type === "square" && z.image)
            .map(z => ({
                type: "Feature",
                properties: { id: z.id },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            }));

        map.addSource("photo-circles", {
            type: "geojson",
            data: { type: "FeatureCollection", features: photoCircleFeatures }
        });

        map.addLayer({
            id: "photo-circles-layer",
            type: "circle",
            source: "photo-circles",
            paint: {
                "circle-radius": 30,
                "circle-color": "rgba(0,0,255,0.08)",
                "circle-stroke-color": "rgba(0,0,255,0.3)",
                "circle-stroke-width": 1
            }
        });

        /* ========================================================
           ===================== DOM USER ARROW ===================
           ======================================================== */

        arrowEl = document.createElement("img");
        arrowEl.src = "arrow.png";
        arrowEl.style.width = "40px";
        arrowEl.style.height = "40px";
        arrowEl.style.transformOrigin = "center center";
        arrowEl.style.visibility = "visible";
        arrowEl.style.willChange = "transform";
        arrowEl.style.position = "absolute";
        arrowEl.style.left = "50%";
        arrowEl.style.top = "50%";
        arrowEl.style.pointerEvents = "none";
        arrowEl.style.zIndex = "9999";

        applyArrowTransform();

/* ========================================================
           ====================== GPS TRACKING ====================
           ======================================================== */

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                pos => {
                    if (!gpsActive) return;
                    moveMarker([pos.coords.latitude, pos.coords.longitude]);
                },
                err => console.log("GPS error:", err),
                { enableHighAccuracy: true }
            );
        }

        /* ========================================================
           ===================== MAP MOVE UPDATE ==================
           ======================================================== */

        map.on("move", handleMapMove);

        console.log("Карта готова");
    });

    /* ========================================================
       ========================= BUTTONS ======================
       ======================================================== */

    const simBtn = document.getElementById("simulate");
    if (simBtn) simBtn.onclick = startSimulation;

    const audioBtn = document.getElementById("enableAudio");
    if (audioBtn) {
        audioBtn.onclick = () => {
            const a = new Audio("audio/1.mp3");
            a.play()
                .then(() => audioEnabled = true)
                .catch(() => console.log("Ошибка разрешения аудио"));
        };
    }

    const compassBtn = document.getElementById("enableCompass");
    if (compassBtn) compassBtn.onclick = startCompass;

    /* ========================================================
       ===================== INIT DEBUG PANEL =================
       ======================================================== */

    ensureSuperDebug();
    debugUpdate("init", 0, "INIT");
}

/* ========================================================
   ====================== DOM EVENTS =======================
   ======================================================== */

togglePhotoBtn.onclick = () => {
    if (!currentPointImage) return;
    photoImage.src = currentPointImage;
    photoOverlay.classList.remove("hidden");
};

closePhotoBtn.onclick = () => {
    photoOverlay.classList.add("hidden");
};

photoOverlay.onclick = (e) => {
    if (e.target === photoOverlay) {
        photoOverlay.classList.add("hidden");
    }
};

document.addEventListener("DOMContentLoaded", initMap);

/* ==================== END OF APP.JS ====================== */

