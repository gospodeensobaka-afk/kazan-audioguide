let map;
let userGeoObject = null;
let lastCoords = null;
let lastAngle = 0;

// Плавное движение
let animationFrameId = null;
let animationStartTime = null;
let animationDuration = 800;
let startCoords = null;
let targetCoords = null;

// Зоны (чекпоинты)
let zones = [];

// Симуляция маршрута: 1 подъезд → 4 подъезд → Мусорка
// Берём координаты из твоего points.json
const P_1_PODEZD  = [55.826823, 49.082742]; // id 3
const P_4_PODEZD  = [55.826634, 49.082187]; // id 2
const P_MUSORKA   = [55.826896, 49.082015]; // id 4

const simulationPoints = [
    P_1_PODEZD,
    P_4_PODEZD,
    P_MUSORKA
];

let simulationIndex = 0;
let simulationActive = false;

function log(t) {
    const el = document.getElementById("debug");
    if (!el) return;
    el.textContent += t + "\n";
    el.scrollTop = el.scrollHeight;
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

// Угол направления движения (для стрелки)
function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    const angleRad = Math.atan2(dx, dy);
    return angleRad * (180 / Math.PI);
}

// Линейная интерполяция
function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

// Расстояние (для зон)
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

// Чекпоинты: отметить вход + финал
function checkZones(coords) {
    zones.forEach(z => {
        const dist = distance(coords, [z.lat, z.lon]);

        // если ещё не посещали и вошли в радиус
        if (dist <= z.radius && !z.visited) {
            z.visited = true;
            z.circle.options.set({
                fillColor: "rgba(0,255,0,0.15)",
                strokeColor: "rgba(0,255,0,0.4)"
            });
            log(`Вход в зону: ${z.name}`);

            if (z.name === "Мусорка") {
                log("Маршрут пройден: достигнута Мусорка → сбрасываем чекпоинты");
                setStatus("Маршрут пройден! Все чекпоинты сброшены.");
                resetAllZones();
            }
        }
    });
}

function resetAllZones() {
    zones.forEach(z => {
        z.visited = false;
        z.circle.options.set({
            fillColor: "rgba(255,0,0,0.15)",
            strokeColor: "rgba(255,0,0,0.4)"
        });
    });
}

// Анимация маркера
function animateMarker(timestamp) {
    if (!animationStartTime) animationStartTime = timestamp;

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / animationDuration;
    if (t > 1) t = 1;

    const current = lerpCoords(startCoords, targetCoords, t);

    if (userGeoObject) {
        userGeoObject.geometry.setCoordinates(current);
        userGeoObject.options.set("iconImageRotation", lastAngle);
    }

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

// Плавное движение к новой точке
function moveMarkerSmooth(newCoords) {
    if (!lastCoords) {
        lastCoords = newCoords;
        if (userGeoObject) userGeoObject.geometry.setCoordinates(newCoords);
        map.setCenter(newCoords);
        checkZones(newCoords);
        return;
    }

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        animationStartTime = null;
    }

    startCoords = lastCoords;
    targetCoords = newCoords;

    const angle = calculateAngle(startCoords, targetCoords);
    lastAngle = angle;

    animationFrameId = requestAnimationFrame(animateMarker);
}

// Один шаг симуляции
function simulateNextStep() {
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        setStatus("Симуляция завершена");
        log("Симуляция завершена");
        return;
    }

    const next = simulationPoints[simulationIndex];
    log(`Симуляция: шаг ${simulationIndex + 1} → ${next[0].toFixed(6)}, ${next[1].toFixed(6)}`);
    simulationIndex++;

    moveMarkerSmooth(next);
}

// Старт симуляции
function startSimulation() {
    simulationActive = true;
    simulationIndex = 0;

    // Стартуем с 1 подъезда
    const start = simulationPoints[0];
    lastCoords = start;
    if (userGeoObject) {
        userGeoObject.geometry.setCoordinates(start);
    }
    map.setCenter(start);
    setStatus("Симуляция маршрута…");

    checkZones(start);

    simulateNextStep();
}

function initMap() {
    log("initMap вызван");

    map = new ymaps.Map("map", {
        center: [55.826620, 49.082188],
        zoom: 18,
        controls: []
    });

    setStatus("Карта создана");

    map.behaviors.enable('multiTouch');
    map.behaviors.enable('drag');
    map.behaviors.enable('scrollZoom');

    // Стрелка
    userGeoObject = new ymaps.Placemark(
        [55.826620, 49.082188],
        {},
        {
            iconLayout: "default#image",
            iconImageHref: "arrow.png",
            iconImageSize: [40, 40],
            iconImageOffset: [-20, -20],
            iconImageRotate: true
        }
    );

    map.geoObjects.add(userGeoObject);

    // Загружаем зоны из points.json (только для кругов и подсказок)
    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            log("points.json загружен, всего точек: " + points.length);

            points.forEach(p => {
                const placemark = new ymaps.Placemark(
                    [p.lat, p.lon],
                    { balloonContent: `<b>${p.name}</b><br>${p.text}` },
                    { preset: "islands#redIcon" }
                );

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
                map.geoObjects.add(placemark);

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

            setStatus("Готово к симуляции. Нажмите кнопку.");
        })
        .catch(err => {
            log("Ошибка загрузки points.json: " + err);
            setStatus("Ошибка загрузки точек");
        });

    const btn = document.getElementById("simulate");
    if (btn) {
        btn.addEventListener("click", () => {
            log("Нажата кнопка симуляции");
            startSimulation();
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    log("DOM загружен");
    ymaps.ready(initMap);
});
