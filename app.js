// ========================================================
// =============== GLOBAL VARIABLES & STATE ===============
// ========================================================

let map;
let userMarker = null;
let arrowEl = null;

let lastCoords = null;
let zones = [];

let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

let gpsActive = true;

let audioPlaying = false;
let audioEnabled = false;

// --- ROUTE COLORING ---
let fullRoute = []; // [{coord:[lng,lat], passed:false}, ...]

// --- COMPASS STATE ---
let compassActive = false;
let compassAngle = 0;
let compassUpdates = 0;

// --- GPS DEBUG ---
let gpsAngleLast = null;
let gpsUpdates = 0;

// --- PNG STATUS ---
let arrowPngStatus = "init";
let iconsPngStatus = "init";

// ================= END GLOBAL VARIABLES =================



// ========================================================
// ===================== UTILITIES ========================
// ========================================================

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

// =================== END UTILITIES ======================



// ========================================================
// ===================== AUDIO ZONES =======================
// ========================================================

function playZoneAudio(src) {
    if (!audioEnabled) return;
    if (audioPlaying) return;

    const audio = new Audio(src);
    audioPlaying = true;

    audio.play()
        .catch(() => { audioPlaying = false; });

    audio.onended = () => {
        audioPlaying = false;
    };
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
        if (dist <= z.radius && !z.visited) {
            z.visited = true;
            updateCircleColors();
            if (z.audio) {
                playZoneAudio(z.audio);
            }
        }
    });
}

// =================== END AUDIO ZONES ====================



// ========================================================
// ===================== SUPER DEBUG =======================
// ========================================================

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
        dbg.style.fontSize = "13px";
        dbg.style.fontFamily = "monospace";
        dbg.style.zIndex = "99999";
        dbg.style.whiteSpace = "pre-line";
        dbg.textContent = "DEBUG INIT";
        document.body.appendChild(dbg);
    }
    return dbg;
}

function debugUpdate(source, angle, error = "none") {
    const dbg = ensureSuperDebug();

    const vis = arrowEl?.style?.visibility || "undefined";
    const tr = arrowEl?.style?.transform || "none";

    let bbox = "no-arrow";
    if (arrowEl) {
        const r = arrowEl.getBoundingClientRect();
        bbox = `x:${Math.round(r.x)}, y:${Math.round(r.y)}, w:${Math.round(r.width)}, h:${Math.round(r.height)}`;
    }

    dbg.textContent =
`SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | VIS: ${vis}
CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(compassAngle)}° | UPD: ${compassUpdates}
GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}
ERR: ${error}
TR: ${tr}
BOX: ${bbox}
PNG: arrow=${arrowPngStatus}, icons=${iconsPngStatus}`;
}

// =================== END SUPER DEBUG ====================



// ========================================================
// ===================== COMPASS LOGIC =====================
// ========================================================

// без сглаживания, крутим сразу по heading
function handleIOSCompass(e) {
    if (!compassActive) return;
    if (!map || !userMarker || !lastCoords) {
        debugUpdate("compass", NaN, "NO_MAP_OR_COORDS");
        return;
    }
    if (e.webkitCompassHeading == null) {
        debugUpdate("compass", NaN, "NO_HEADING");
        return;
    }

    const heading = e.webkitCompassHeading; // 0 = север, по часовой
    compassAngle = heading;
    compassUpdates++;

    // --- держим стрелку на lastCoords и форсим рендер ---
    const offset = 0.0000001;
    userMarker.setLngLat([lastCoords[1] + offset, lastCoords[0] + offset]);
    setTimeout(() => {
        userMarker.setLngLat([lastCoords[1], lastCoords[0]]);
    }, 0);

    if (arrowEl) {
        arrowEl.style.transform = `rotate(${compassAngle}deg)`;
        arrowEl.style.visibility = "visible";
    }

    debugUpdate("compass", compassAngle);
}

function startCompass() {
    compassActive = true;

    let dbg = document.getElementById("compassDebug");
    if (!dbg) {
        dbg = document.createElement("div");
        dbg.id = "compassDebug";
        dbg.style.position = "fixed";
        dbg.style.bottom = "60px";
        dbg.style.left = "0";
        dbg.style.width = "100%";
        dbg.style.padding = "6px 10px";
        dbg.style.background = "rgba(0,0,0,0.55)";
        dbg.style.color = "white";
        dbg.style.fontSize = "14px";
        dbg.style.fontFamily = "monospace";
        dbg.style.zIndex = "9999";
        dbg.style.textAlign = "center";
        dbg.textContent = "Compass: waiting…";
        document.body.appendChild(dbg);
    }

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {

        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === "granted") {
                    window.addEventListener("deviceorientation", handleIOSCompass);
                } else {
                    dbg.textContent = "Compass: permission denied";
                    debugUpdate("compass", NaN, "PERMISSION_DENIED");
                }
            })
            .catch(() => {
                dbg.textContent = "Compass: error requesting permission";
                debugUpdate("compass", NaN, "PERMISSION_ERROR");
            });

        return;
    }

    dbg.textContent = "Compass: iOS only";
    debugUpdate("compass", NaN, "IOS_ONLY");
}

// =================== END COMPASS LOGIC ===================// ========================================================
// ===================== MOVE MARKER =======================
// ========================================================

function moveMarker(coords) {
    // coords = [lat, lng]

    // --- ROTATE ARROW (GPS) ---
    // GPS вращает стрелку ТОЛЬКО если компас выключен
    if (!compassActive && lastCoords) {
        const angle = calculateAngle(lastCoords, coords);

        gpsAngleLast = Math.round(angle);
        gpsUpdates++;

        if (arrowEl) {
            arrowEl.style.transform = `rotate(${angle}deg)`;
            arrowEl.style.visibility = "visible";
        }

        debugUpdate("gps", angle);
    }

    // --- UPDATE LAST COORDS ---
    lastCoords = coords;

    // --- MOVE MARKER TO REAL POSITION ---
    userMarker.setLngLat([coords[1], coords[0]]);

    // --- FIND CLOSEST ROUTE POINT ---
    const current = [coords[1], coords[0]]; // [lng, lat]

    let closestIndex = 0;
    let minDist = Infinity;

    fullRoute.forEach((pt, i) => {
        const d = distance([pt.coord[1], pt.coord[0]], [coords[0], coords[1]]);
        if (d < minDist) {
            minDist = d;
            closestIndex = i;
        }
    });

    // --- SPLIT ROUTE INTO PASSED + REMAINING ---
    const passedCoords = fullRoute.slice(0, closestIndex + 1).map(pt => pt.coord);
    const remainingCoords = fullRoute.slice(closestIndex).map(pt => pt.coord);

    // --- UPDATE SOURCES ---
    map.getSource("route-passed").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: passedCoords }
    });

    map.getSource("route-remaining").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: remainingCoords }
    });

    // --- FOLLOW CAMERA DURING SIMULATION ---
    if (simulationActive) {
        map.easeTo({
            center: [coords[1], coords[0]],
            duration: 500
        });
    }

    // --- AUDIO ZONES ---
    checkZones(coords);

    // --- ALWAYS SHOW ARROW ---
    if (arrowEl) {
        arrowEl.style.visibility = "visible";
    }

    // --- FINAL DEBUG UPDATE ---
    debugUpdate(
        compassActive ? "compass" : "gps",
        compassActive ? compassAngle : gpsAngleLast
    );
}

// =================== END MOVE MARKER ====================



// ========================================================
// ================== SIMULATION STEP ======================
// ========================================================

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

// ================ END SIMULATION STEP ===================



// ========================================================
// ================== START SIMULATION =====================
// ========================================================

function startSimulation() {
    if (!simulationPoints.length) return;

    simulationActive = true;
    gpsActive = false;

    // --- COMPASS MUST NOT INTERFERE WITH SIMULATION ---
    compassActive = false;

    simulationIndex = 0;

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}

// ================ END START SIMULATION ==================// ========================================================
// ======================= INIT MAP ========================
// ========================================================

async function initMap() {
    const initialCenter = [49.082118, 55.826584];

    map = new maplibregl.Map({
        container: "map",
        style: "style.json",
        center: initialCenter,
        zoom: 18
    });

    map.on("load", async () => {
        const points = await fetch("points.json").then(r => r.json());
        const route = await fetch("route.json").then(r => r.json());

        // --- PREPARE FULL ROUTE ---
        fullRoute = route.geometry.coordinates.map(c => ({
            coord: [c[0], c[1]], // [lng, lat]
            passed: false
        }));

        // симуляция использует lat/lng
        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);

        // --- ROUTE SOURCES ---
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
                geometry: { type: "LineString", coordinates: fullRoute.map(pt => pt.coord) }
            }
        });

        // --- ROUTE LAYERS ---
        map.addLayer({
            id: "route-passed-line",
            type: "line",
            source: "route-passed",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#888888" }
        });

        map.addLayer({
            id: "route-remaining-line",
            type: "line",
            source: "route-remaining",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#007aff" }
        });

        // --- AUDIO CIRCLES ---
        const circleFeatures = [];

        points.forEach(p => {
            zones.push({
                id: p.id,
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                radius: p.radius || 20,
                visited: false,
                type: p.type,
                audio: p.type === "audio" ? `audio/${p.id}.mp3` : null
            });

            if (p.type === "audio") {
                circleFeatures.push({
                    type: "Feature",
                    properties: { id: p.id, visited: false },
                    geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                });
            }

            // --- PNG ICONS FOR SQUARE POINTS ---
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
                img.onerror = () => { iconsPngStatus = "error"; debugUpdate("none", null, "PNG_LOAD_FAIL"); };

                el.appendChild(img);

                new maplibregl.Marker({ element: el })
                    .setLngLat([p.lng, p.lat])
                    .addTo(map);
            }
        });

        // --- AUDIO CIRCLES SOURCE ---
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

        // --- USER ARROW MARKER ---
        arrowEl = document.createElement("img");
        arrowEl.src = "arrow.png";
        arrowEl.style.width = "40px";
        arrowEl.style.height = "40px";
        arrowEl.style.transformOrigin = "center center";
        arrowEl.style.visibility = "visible";

        arrowEl.onload = () => { arrowPngStatus = "ok"; };
        arrowEl.onerror = () => { arrowPngStatus = "error"; debugUpdate("none", null, "ARROW_PNG_FAIL"); };

        userMarker = new maplibregl.Marker({ element: arrowEl })
            .setLngLat(initialCenter)
            .addTo(map);

        // --- GPS TRACKING ---
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

        console.log("Карта готова");
    });

    // --- BUTTONS ---
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
    if (compassBtn) {
        compassBtn.onclick = () => {
            startCompass();
        };
    }

    // --- FORCE SUPER DEBUG PANEL TO APPEAR ---
    ensureSuperDebug();
    debugUpdate("init", 0, "INIT");
}

// ===================== END INIT MAP =====================



// ========================================================
// ====================== DOM EVENTS =======================
// ========================================================

document.addEventListener("DOMContentLoaded", initMap);

// ==================== END DOM EVENTS ====================
