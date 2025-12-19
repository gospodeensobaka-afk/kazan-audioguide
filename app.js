let map;
let userMarker = null;

let lastCoords = null;
let zones = [];

let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

let gpsActive = true;

// ===============================
// УТИЛИТЫ
// ===============================

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

// ===============================
// ПОВОРОТ НА СЛЕДУЮЩУЮ ТОЧКУ
// ===============================

function angleToNextPoint(current, next) {
    const dx = next[1] - current[1];
    const dy = next[0] - current[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}

function rotateMarkerToNext() {
    if (!lastCoords) return;
    if (!simulationPoints.length) return;

    // ищем ближайшую точку маршрута
    let nearestIndex = 0;
    let minDist = Infinity;

    simulationPoints.forEach((p, i) => {
        const d = distance(lastCoords, p);
        if (d < minDist) {
            minDist = d;
            nearestIndex = i;
        }
    });

    // если мы на последней точке — не вращаем
    if (nearestIndex >= simulationPoints.length - 1) return;

    const nextPoint = simulationPoints[nearestIndex + 1];
    const angle = angleToNextPoint(lastCoords, nextPoint);

    userMarker.options.set("iconImageRotation", angle);
}

// ===============================
// ЗОНЫ
// ===============================

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

            if (z.isLast) {
                setStatus("Финальная точка достигнута!");
                log("Финальная точка достигнута.");
            }
        }
    });
}

// ===============================
// ДВИЖЕНИЕ МАРКЕРА
// ===============================

function moveMarker(coords) {
    lastCoords = coords;
    userMarker.geometry.setCoordinates(coords);

    rotateMarkerToNext();   // ← ключевая строка

    checkZones(coords);
}

// ===============================
// СИМУЛЯЦИЯ
// ===============================

function simulateNextStep() {
    if (!simulationActive) return;

    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;
        setStatus("Симуляция завершена");
        log("Симуляция завершена");
        return;
    }

    const curr = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarker(curr);

    setTimeout(simulateNextStep, 2000);
}

function startSimulation() {
    if (!simulationPoints.length) {
        setStatus("Нет точек для симуляции");
        log("Нет точек для симуляции");
        return;
    }

    simulationActive = true;
    gpsActive = false;
    simulationIndex = 0;

    const start = simulationPoints[0];

    moveMarker(start);
    map.setCenter(start, 15);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    setTimeout(simulateNextStep, 2000);
}

// ===============================
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ===============================

function initMap() {
    const initialCenter = [55.826584, 49.082118];

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 15,
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
            iconImageRotation: 0,
            iconRotate: true
        }
    );

    map.geoObjects.add(userMarker);

    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            const sorted = points.slice().sort((a, b) => a.id - b.id);

            sorted.forEach(p => {
                const label = new ymaps.Placemark(
                    [p.lat, p.lon],
                    { iconContent: p.id },
                    {
                        preset: "islands#blueCircleIcon",
                        iconColor: "#1E90FF"
                    }
                );
                map.geoObjects.add(label);
            });

            sorted.forEach((p, index) => {
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
                    visited: false,
                    isLast: index === sorted.length - 1
                });
            });

            simulationPoints = sorted.map(p => [p.lat, p.lon]);

            const routeLine = new ymaps.Polyline(
                simulationPoints,
                {},
                {
                    strokeColor: "#1E90FF",
                    strokeWidth: 4,
                    strokeOpacity: 0.8
                }
            );

            map.geoObjects.add(routeLine);

            setStatus("Готово к симуляции");
        });

    const btnSim = document.getElementById("simulate");
    if (btnSim) btnSim.addEventListener("click", startSimulation);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            pos => {
                if (!gpsActive) return;
                moveMarker([pos.coords.latitude, pos.coords.longitude]);
            },
            err => log("Ошибка GPS: " + err.message),
            { enableHighAccuracy: true }
        );
    }

    setStatus("Карта инициализирована");
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
