let map;
let userMarker = null;

let lastCoords = null;

// Анимация
let animationFrameId = null;
let animationStartTime = null;
let animationDuration = 1200; // скорость движения
let startCoords = null;
let targetCoords = null;

// Зоны
let zones = [];

// Симуляция
let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

// GPS
let gpsActive = true;

function log(t) {
    const el = document.getElementById("debug");
    if (el) {
        el.textContent += t + "\n";
        el.scrollTop = el.scrollHeight;
    }
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

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

function checkZones(coords) {
    zones.forEach(z => {
        const dist = distance(coords, [z.lat, z.lon]);

        if (dist <= z.radius && !z.visited) {
            z.visited = true;

            z.circle.options.set({
                fillColor: "rgba(0,255,0,0.15)",
                strokeColor: "rgba(0,255,0,0.4)"
            });

            log("Вход в зону: " + z.name);

            if (z.id === 4) {
                setStatus("Маршрут пройден! Достигнута финальная точка.");
                log("Маршрут пройден.");
            }
        }
    });
}

function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

function animateMarker(timestamp) {
    if (!animationStartTime) animationStartTime = timestamp;

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / animationDuration;
    if (t > 1) t = 1;

    const current = lerpCoords(startCoords, targetCoords, t);

    userMarker.geometry.setCoordinates(current);
    checkZones(current);

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;

        if (simulationActive) {
            simulateNextStep();
        }
    }
}

function moveMarkerSmooth(newCoords) {
    if (!lastCoords) {
        lastCoords = newCoords;
        userMarker.geometry.setCoordinates(newCoords);
        checkZones(newCoords);
        return;
    }

    startCoords = lastCoords;
    targetCoords = newCoords;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        animationStartTime = null;
    }

    animationFrameId = requestAnimationFrame(animateMarker);
}

function simulateNextStep() {
    if (!simulationActive) return;

    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;
        setStatus("Симуляция завершена");
        log("Симуляция завершена");
        return;
    }

    const next = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarkerSmooth(next);
}

function startSimulation() {
    if (!simulationPoints.length) {
        setStatus("Нет точек для симуляции");
        return;
    }

    simulationActive = true;
    gpsActive = false;
    simulationIndex = 0;

    const start = simulationPoints[0];
    lastCoords = start;

    userMarker.geometry.setCoordinates(start);
    map.setCenter(start, 14);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    simulateNextStep();
}

function initMap() {
    const initialCenter = [55.826584, 49.082118];

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 14,
        controls: []
    });

    userMarker = new ymaps.Placemark(
        initialCenter,
        {},
        {
            iconLayout: "default#image",
            iconImageHref: "arrow.png",
            iconImageSize: [40, 40],
            iconImageOffset: [-20, -20],
            iconImageRotate: true
        }
    );

    map.geoObjects.add(userMarker);

    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            points.forEach(p => {
                const circle = new ymaps.Circle(
                    [[p.lat, p.lon], p.radius],
                    {},
                    {
                        fillColor: "rgba(255,0,0,0.15)",
                        strokeColor: "rgba(255,0,0,0.4)",
                        strokeWidth: 2
                    }
                );

                map.geoObjects.add(circle);

                zones.push({
                    id: p.id,
                    name: p.name,
                    lat: p.lat,
                    lon: p.lon,
                    radius: p.radius,
                    circle: circle,
                    visited: false
                });
            });

            const p1 = points.find(p => p.id === 1);
            const p2 = points.find(p => p.id === 2);
            const p3 = points.find(p => p.id === 3);
            const p4 = points.find(p => p.id === 4);

            simulationPoints = [
                [p1.lat, p1.lon],
                [p2.lat, p2.lon],
                [p3.lat, p3.lon],
                [p4.lat, p4.lon]
            ];

            setStatus("Готово к симуляции");
        });

    const btnSim = document.getElementById("simulate");
    if (btnSim) {
        btnSim.addEventListener("click", startSimulation);
    }

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            pos => {
                if (!gpsActive) return;

                const coords = [pos.coords.latitude, pos.coords.longitude];
                moveMarkerSmooth(coords);
            },
            err => log("Ошибка GPS: " + err.message),
            { enableHighAccuracy: true }
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
