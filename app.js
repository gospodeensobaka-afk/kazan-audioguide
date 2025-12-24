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

// NEW: route coloring
let passedCoords = [];
let remainingCoords = [];

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

function playZoneAudio(src) {
    if (!audioEnabled) return;
    if (audioPlaying) return;
    const audio = new Audio(src);
    audioPlaying = true;
    audio.play().catch(() => audioPlaying = false);
    audio.onended = () => audioPlaying = false;
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
            if (z.audio) playZoneAudio(z.audio);
        }
    });
}function moveMarker(coords) {
    if (lastCoords) {
        const angle = calculateAngle(lastCoords, coords);
        arrowEl.style.transform = `rotate(${angle}deg)`;
    }

    lastCoords = coords;

    userMarker.setLngLat([coords[1], coords[0]]);

    // --- UPDATE ROUTE COLORS ---
    passedCoords.push([coords[1], coords[0]]);
    remainingCoords.shift();

    const passedSource = map.getSource("route-passed");
    const remainingSource = map.getSource("route-remaining");

    if (passedSource) {
        passedSource.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: passedCoords }
        });
    }

    if (remainingSource) {
        remainingSource.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: remainingCoords }
        });
    }

    // --- FOLLOW THE ARROW DURING SIMULATION ---
    if (simulationActive) {
        map.easeTo({
            center: [coords[1], coords[0]],
            duration: 500
        });
    }

    checkZones(coords);
}

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

function startSimulation() {
    if (!simulationPoints.length) return;
    simulationActive = true;
    gpsActive = false;
    simulationIndex = 0;

    // reset route coloring
    passedCoords = [];
    remainingCoords = simulationPoints.map(c => [c[1], c[0]]);

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}

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

        // prepare route arrays
        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);
        remainingCoords = route.geometry.coordinates.map(c => [c[0], c[1]]);

        // --- ROUTE SOURCES (PASSED + REMAINING) ---
        map.addSource("route-passed", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: [] }
            }
        });

        map.addLayer({
            id: "route-passed-line",
            type: "line",
            source: "route-passed",
            paint: {
                "line-color": "#888888",
                "line-width": 4
            }
        });

        map.addSource("route-remaining", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: remainingCoords }
            }
        });

        map.addLayer({
            id: "route-remaining-line",
            type: "line",
            source: "route-remaining",
            paint: {
                "line-color": "#007aff",
                "line-width": 4
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

    document.getElementById("simulate").onclick = startSimulation;

    document.getElementById("enableAudio").onclick = () => {
        const a = new Audio("audio/1.mp3");
        a.play()
            .then(() => audioEnabled = true)
            .catch(() => console.log("Ошибка разрешения аудио"));
    };
}

document.addEventListener("DOMContentLoaded", initMap);
