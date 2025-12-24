// ======================================================
// 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ======================================================

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


// ======================================================
// 2. УТИЛИТЫ
// ======================================================

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


// ======================================================
// 3. АУДИО
// ======================================================

function playZoneAudio(src) {
    if (!audioEnabled) {
        console.log("Аудио заблокировано — нажми кнопку 'Включить звук'");
        return;
    }

    if (audioPlaying) return;

    const audio = new Audio(src);
    audioPlaying = true;

    audio.play().catch(() => {
        audioPlaying = false;
    });

    audio.onended = () => {
        audioPlaying = false;
    };
}


// ======================================================
// 4. ЗОНЫ
// ======================================================

function checkZones(coords) {
    zones.forEach(z => {
        const dist = distance(coords, [z.lat, z.lng]);

        if (dist <= z.radius && !z.visited) {
            z.visited = true;

            if (z.audio) playZoneAudio(z.audio);
        }
    });
}


// ======================================================
// 5. ДВИЖЕНИЕ МАРКЕРА
// ======================================================

function moveMarker(coords) {
    if (lastCoords) {
        const angle = calculateAngle(lastCoords, coords);
        arrowEl.style.transform = `rotate(${angle}deg)`;
    }

    lastCoords = coords;

    userMarker.setLngLat([coords[1], coords[0]]);
    checkZones(coords);
}


// ======================================================
// 6. СИМУЛЯЦИЯ
// ======================================================

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

    moveMarker(simulationPoints[0]);
    map.easeTo({ center: [simulationPoints[0][1], simulationPoints[0][0]], duration: 500 });

    setTimeout(simulateNextStep, 1200);
}


// ======================================================
// 7. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ======================================================

async function initMap() {
    const initialCenter = [49.082118, 55.826584];

    map = new maplibregl.Map({
        container: "map",
        style: "style.json",
        center: initialCenter,
        zoom: 18
    });

    map.on("load", async () => {
        // Загружаем точки и маршрут
        const points = await fetch("points.json").then(r => r.json());
        const route = await fetch("route.json").then(r => r.json());

        // Маршрут
        map.addSource("route", { type: "geojson", data: route });
        map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: {
                "line-color": "#007aff",
                "line-width": 4
            }
        });

        // Маркер пользователя (стрелка)
        arrowEl = document.createElement("img");
        arrowEl.src = "arrow.png";
        arrowEl.style.width = "40px";
        arrowEl.style.height = "40px";
        arrowEl.style.transform = "rotate(0deg)";
        arrowEl.style.transformOrigin = "center center";

        userMarker = new maplibregl.Marker({ element: arrowEl })
            .setLngLat(initialCenter)
            .addTo(map);

        // Точки
        points.forEach(p => {
            const el = document.createElement("div");
            el.style.width = "16px";
            el.style.height = "16px";

            if (p.type === "audio") {
                el.style.background = "red";
                el.style.borderRadius = "50%";
            }
            if (p.type === "square") {
                el.style.background = "blue";
            }
            if (p.type === "image") {
                el.style.background = "gray";
            }

            new maplibregl.Marker(el)
                .setLngLat([p.lng, p.lat])
                .addTo(map);

            zones.push({
                id: p.id,
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                radius: p.radius || 20,
                visited: false,
                audio: p.type === "audio" ? `audio/${p.id}.mp3` : null
            });
        });

        // Симуляция
        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);

        // GPS
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

    // Кнопка симуляции
    document.getElementById("simulate").onclick = startSimulation;

    // Кнопка включения звука
    const btnAudio = document.getElementById("enableAudio");
    if (btnAudio) {
        btnAudio.onclick = () => {
            const a = new Audio("audio/1.mp3");
            a.play()
                .then(() => {
                    audioEnabled = true;
                    console.log("Аудио разрешено");
                })
                .catch(() => console.log("Ошибка разрешения аудио"));
        };
    }
}

document.addEventListener("DOMContentLoaded", initMap);
