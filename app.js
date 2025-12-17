// ======================================================
// 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ======================================================

let map;

// Маркер пользователя (стрелка)
let userMarker = null;

// Положение и ориентация
let lastCoords = null;
let lastAngle = 0;

// Анимация движения
let animationFrameId = null;
let animationStartTime = null;
const ANIMATION_DURATION = 1200;

let startCoords = null;
let targetCoords = null;

// Зоны-чекпоинты
let zones = [];

// Маршрут
let routeCoords = [];
let routeReady = false;

// Симуляция
let simulationActive = false;
let simulationIndex = 0;

// GPS
let gpsActive = true;


// ======================================================
// 2. УТИЛИТЫ
// ======================================================

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

function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}


// ======================================================
// 3. ЗОНЫ
// ======================================================

function checkZones(coords) {
    zones.forEach(z => {
        const distToZone = distance(coords, [z.lat, z.lon]);

        if (distToZone <= z.radius && !z.visited) {
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


// ======================================================
// 4. ПЛАВНОЕ ДВИЖЕНИЕ + ПОВОРОТ СТРЕЛКИ
// ======================================================

function animateMarker(timestamp) {
    if (!animationStartTime) animationStartTime = timestamp;

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / ANIMATION_DURATION;
    if (t > 1) t = 1;

    const current = lerpCoords(startCoords, targetCoords, t);

    const angle = calculateAngle(startCoords, targetCoords);
    lastAngle = angle;
    userMarker.options.set("iconImageRotation", angle);

    userMarker.geometry.setCoordinates(current);
    checkZones(current);

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;

        if (simulationActive) simulateNextStep();
    }
}

function moveMarkerSmooth(newCoords) {
    if (!lastCoords) {
        lastCoords = newCoords;
        userMarker.geometry.setCoordinates(newCoords);
        userMarker.options.set("iconImageRotation", lastAngle);
        checkZones(newCoords);
        return;
    }

    const dist = distance(lastCoords, newCoords);
    if (dist < 0.5) return;

    startCoords = lastCoords;
    targetCoords = newCoords;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        animationStartTime = null;
    }

    animationFrameId = requestAnimationFrame(animateMarker);
}


// ======================================================
// 5. СИМУЛЯЦИЯ
// ======================================================

function validateRoute() {
    if (!routeReady || !routeCoords.length) {
        log("❌ Маршрут не готов");
        setStatus("Маршрут ещё загружается...");
        return false;
    }
    return true;
}

function simulateNextStep() {
    if (!simulationActive) return;

    if (simulationIndex >= routeCoords.length) {
        simulationActive = false;
        gpsActive = true;
        setStatus("Симуляция завершена");
        log("🏁 Симуляция завершена");
        return;
    }

    const next = routeCoords[simulationIndex];
    log("➡️ Следующая точка: " + JSON.stringify(next));

    simulationIndex++;
    moveMarkerSmooth(next);
}

function startSimulation() {
    log("=== НАЖАТА КНОПКА СИМУЛЯЦИИ ===");

    if (!validateRoute()) return;

    simulationActive = true;
    gpsActive = false;
    simulationIndex = 0;

    const start = routeCoords[0];
    lastCoords = start;

    userMarker.geometry.setCoordinates(start);
    userMarker.options.set("iconImageRotation", lastAngle);
    map.setCenter(start, 15);

    setStatus("Симуляция запущена");
    log("🚀 Симуляция стартовала");

    setTimeout(simulateNextStep, 300);
}

// ======================================================
// 6. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ======================================================

function initMap() {
    const initialCenter = [55.826584, 49.082118];

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 15,
        controls: []
    });

    // ----- МАРКЕР-СТРЕЛКА -----
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

    // ----- ЗАГРУЗКА ТОЧЕК -----
    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            const sorted = points.slice().sort((a, b) => a.id - b.id);

            // Нумерация точек
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

            // Зоны
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

            // Маршрут
            routeCoords = sorted.map(p => [p.lat, p.lon]);

            const routeLine = new ymaps.Polyline(
                routeCoords,
                {},
                {
                    strokeColor: "#1E90FF",
                    strokeWidth: 4,
                    strokeOpacity: 0.8
                }
            );

            map.geoObjects.add(routeLine);

            routeReady = true;
            setStatus("Маршрут загружен");
            log("Маршрут загружен");
        });

    // Кнопка симуляции
    const btnSim = document.getElementById("simulate");
    if (btnSim) btnSim.addEventListener("click", startSimulation);

    // GPS
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

    setStatus("Карта инициализирована");
    log("Карта инициализирована");
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
