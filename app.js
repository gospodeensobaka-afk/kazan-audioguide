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
let passedCoords = [];
let remainingCoords = [];
let fullRoute = null;

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

    // --- SMART ROUTE COLORING ---
    const current = [coords[1], coords[0]]; // [lng, lat]

    // ищем ближайшую точку маршрута
    let closestIndex = 0;
    let minDist = Infinity;

    fullRoute.forEach((pt, i) => {
        const d = distance([current[1], current[0]], [pt[1], pt[0]]);
        if (d < minDist) {
            minDist = d;
            closestIndex = i;
        }
    });

    // делим маршрут на пройденный и оставшийся
    passedCoords = fullRoute.slice(0, closestIndex + 1);
    remainingCoords = fullRoute.slice(closestIndex);

    // обновляем слои
    map.getSource("route-passed").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: passedCoords }
    });

    map.getSource("route-remaining").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: remainingCoords }
    });

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

    // сбрасываем раскраску маршрута
    passedCoords = [];
    remainingCoords = [...fullRoute];

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

        // сохраняем полный маршрут
        fullRoute = route.geometry.coordinates.map(c => [c[0], c[1]]);

        // симуляция использует lat/lng
        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);

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
                geometry: { type: "LineString", coordinates: fullRoute }
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
