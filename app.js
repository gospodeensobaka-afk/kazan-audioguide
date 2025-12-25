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

let compassActive = false;

// --- ROUTE COLORING ---
let fullRoute = []; // [{coord:[lng,lat], passed:false}, ...]

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
// ===================== COMPASS HANDLER ==================
// ========================================================

function startCompass() {
    compassActive = true;

    // --- iOS ---
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {

        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === "granted") {
                    window.addEventListener("deviceorientation", handleCompassIOS);
                }
            })
            .catch(err => console.log("iOS compass error:", err));

        return;
    }

    // --- ANDROID ---
    if ("AbsoluteOrientationSensor" in window) {
        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: 30 });
            sensor.addEventListener("reading", () => {
                const q = sensor.quaternion;
                if (!q) return;

                const yaw = Math.atan2(
                    2 * (q[0] * q[3] + q[1] * q[2]),
                    1 - 2 * (q[2] * q[2] + q[3] * q[3])
                );

                const deg = Math.round(-yaw * (180 / Math.PI));
                arrowEl.style.transform = `rotate(${deg}deg)`;
                arrowEl.style.visibility = "visible";
                console.log("Компас (Android):", deg);
            });
            sensor.start();
            return;
        } catch (e) {
            console.log("Android AbsoluteOrientationSensor error:", e);
        }
    }

    // --- FALLBACK ---
    window.addEventListener("deviceorientationabsolute", handleCompassAndroid);
}

function handleCompassIOS(e) {
    if (!compassActive) return;
    if (e.webkitCompassHeading != null) {
        const deg = Math.round(e.webkitCompassHeading);
        arrowEl.style.transform = `rotate(${deg}deg)`;
        arrowEl.style.visibility = "visible";
        console.log("Компас (iOS):", deg);
    }
}

function handleCompassAndroid(e) {
    if (!compassActive) return;
    if (e.alpha != null) {
        const deg = Math.round(360 - e.alpha);
        arrowEl.style.transform = `rotate(${deg}deg)`;
        arrowEl.style.visibility = "visible";
        console.log("Компас (fallback):", deg);
    }
}

// =================== END COMPASS HANDLER =================// ========================================================
// ===================== MOVE MARKER =======================
// ========================================================

function moveMarker(coords) {
    // coords = [lat, lng]

    // --- ROTATE ARROW (если компас выключен) ---
    if (!compassActive && lastCoords) {
        const angle = calculateAngle(lastCoords, coords);
        const deg = Math.round(angle);
        arrowEl.style.transform = `rotate(${deg}deg)`;
        arrowEl.style.visibility = "visible";
    }
    lastCoords = coords;

    // --- MOVE MARKER ---
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

    checkZones(coords);
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
    simulationIndex = 0;

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}

// ================ END START SIMULATION ==================



// ========================================================
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

        // --- ROUTE SOURCES (TWO LINESTRINGS) ---
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
            layout: {
                "line-join": "round",
                "line-cap": "round"
            },
            paint: {
                "line-width": 4,
                "line-color": "#888888"
            }
        });

        map.addLayer({
            id: "route-remaining-line",
            type: "line",
            source: "route-remaining",
            layout: {
                "line-join": "round",
                "line-cap": "round"
            },
            paint: {
                "line-width": 4,
                "line-color": "#007aff"
            }
        });        // --- AUDIO CIRCLES ---
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
                    geometry: {
                        type: "Point",
                        coordinates: [p.lng, p.lat]
                    }
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

                el.appendChild(img);

                new maplibregl.Marker({ element: el })
                    .setLngLat([p.lng, p.lat])
                    .addTo(map);
            }
        });

        // --- AUDIO CIRCLES SOURCE ---
        map.addSource("audio-circles", {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: circleFeatures
            }
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
            console.log("Компас включён");
        };
    }
}

// ===================== END INIT MAP =====================



// ========================================================
// ====================== DOM EVENTS =======================
// ========================================================

document.addEventListener("DOMContentLoaded", initMap);

// ==================== END DOM EVENTS ====================
