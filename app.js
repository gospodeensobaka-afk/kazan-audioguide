// ======================================================
// 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ======================================================

let map;
let userMarker = null;

// Последние координаты пользователя или симуляции
let lastCoords = null;

// Зоны
let zones = [];

// Симуляция
let simulationActive = false;
let simulationPoints = [];
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

// Расстояние между двумя координатами (в метрах)
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

// Угол между двумя координатами (для поворота стрелки)
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
        const dist = distance(coords, [z.lat, z.lon]);

        if (dist <= z.radius && !z.visited) {
            z.visited = true;

            // Красим зону в зелёный
            z.circle.options.set({
                fillColor: "rgba(0,255,0,0.15)",
                strokeColor: "rgba(0,255,0,0.4)"
            });

            log("Вход в зону: " + z.name);

            // Финальная точка — просто зелёная, без сброса
            if (z.id === 4) {
                setStatus("Финальная точка достигнута!");
                log("Финальная точка достигнута.");
            }
        }
    });
}


// ======================================================
// 4. ПЕРЕМЕЩЕНИЕ МАРКЕРА (ТЕЛЕПОРТАЦИЯ + ПОВОРОТ)
// ======================================================

function moveMarker(coords) {
    if (lastCoords) {
        const angle = calculateAngle(lastCoords, coords);
        userMarker.options.set("iconImageRotation", angle);
    }

    lastCoords = coords;
    userMarker.geometry.setCoordinates(coords);
    checkZones(coords);
}


// ======================================================
// 5. СИМУЛЯЦИЯ (ТЕЛЕПОРТАЦИЯ)
// ======================================================

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

    moveMarker(next);

    // Пауза между точками (2 секунды)
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

            // Маршрут (Polyline)
            const routeCoords = sorted.map(p => [p.lat, p.lon]);

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

            // Симуляция по маршруту
            simulationPoints = routeCoords;

            setStatus("Готово к симуляции");
            log("Точки и маршрут загружены");
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
                moveMarker(coords);
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
