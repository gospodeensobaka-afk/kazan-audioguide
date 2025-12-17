let map;
let userGeoObject = null;
let lastCoords = null;
let lastAngle = 0;

// Плавное движение
let animationFrameId = null;
let animationStartTime = null;
let animationDuration = 400;
let startCoords = null;
let targetCoords = null;

// Зоны (чекпоинты)
let zones = [];

// Симуляция маршрута
let simulationPoints = []; // массив координат [lat, lon]
let simulationIndex = 0;
let simulationActive = false;

function log(t) {
    const el = document.getElementById("debug");
    if (el) el.textContent += t + "\n";
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

// Угол направления движения
function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    const angleRad = Math.atan2(dx, dy);
    return angleRad * (180 / Math.PI);
}

// Линейная интерполяция координат
function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

// Расстояние между двумя точками в метрах
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

// Проверка зон: вход + чекпоинты + финал
function checkZones(coords) {
    zones.forEach(z => {
        const dist = distance(coords, [z.lat, z.lon]);

        // первый вход в зону → отмечаем чекпоинт (зелёный)
        if (dist <= z.radius && !z.visited) {
            z.visited = true;

            z.circle.options.set({
                fillColor: "rgba(0,255,0,0.15)",
                strokeColor: "rgba(0,255,0,0.4)"
            });

            log("Вход в зону: " + z.name);

            // если это финальная точка - мусорка → считаем маршрут пройденным
            if (z.name === "Мусорка") {
                log("Маршрут пройден: достигнута Мусорка");
                setStatus("Маршрут пройден! Все чекпоинты сброшены.");
                resetAllZones();
            }
        }
    });
}

// Сброс всех чекпоинтов (после финальной точки)
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

    // Проверяем зоны по текущему положению (симуляция + реальный GPS используют один механизм)
    checkZones(current);

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;

        // Если идёт симуляция — переходим к следующему шагу
        if (simulationActive) {
            simulateNextStep();
        }
    }
}

// Запуск плавного движения к новой точке
function moveMarkerSmooth(newCoords) {
    if (!lastCoords) {
        lastCoords = newCoords;
        if (userGeoObject) userGeoObject.geometry.setCoordinates(newCoords);
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

// Симуляция: двигаемся по точкам маршрута
function simulateNextStep() {
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        setStatus("Симуляция завершена");
        return;
    }

    const next = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarkerSmooth(next);
}

// Запуск симуляции маршрута: 1 подъезд → 4 подъезд → Мусорка
function startSimulation() {
    if (!simulationPoints.length) {
        setStatus("Симуляция недоступна: точки маршрута не загружены");
        return;
    }

    simulationActive = true;
    simulationIndex = 1; // 0 — стартовая позиция, сразу ставим туда маркер

    const start = simulationPoints[0];
    lastCoords = start;

    if (userGeoObject) {
        userGeoObject.geometry.setCoordinates(start);
    }

    map.setCenter(start);
    setStatus("Симуляция маршрута…");

    // Сразу проверим зоны в стартовой точке
    checkZones(start);

    simulateNextStep();
}

function initMap() {
    log("initMap вызван");

    // Стартовый центр — примерно район маршрута
    map = new ymaps.Map("map", {
        center: [55.826620, 49.082188],
        zoom: 18,
        controls: []
    });

    setStatus("Карта создана");

    map.behaviors.enable('multiTouch');
    map.behaviors.enable('drag');
    map.behaviors.enable('scrollZoom');

    // Кастомный маркер (стрелка)
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

    // Загружаем точки маршрута и зоны
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

            // Собираем точки для симуляции в нужном порядке:
            // 1 подъезд (id: 3) → 4 подъезд (id: 2) → Мусорка (id: 4)
            const p1 = points.find(p => p.id === 3); // 1 подъезд
            const p4 = points.find(p => p.id === 2); // 4 подъезд
            const trash = points.find(p => p.id === 4); // Мусорка

            simulationPoints = [];
            if (p1) simulationPoints.push([p1.lat, p1.lon]);
            if (p4) simulationPoints.push([p4.lat, p4.lon]);
            if (trash) simulationPoints.push([trash.lat, trash.lon]);

            log("Точки симуляции: " + JSON.stringify(simulationPoints));
            setStatus("Готово к симуляции. Нажмите кнопку.");
        });

    // Кнопка симуляции
    const btn = document.getElementById("simulate");
    if (btn) {
        btn.addEventListener("click", () => {
            log("Запуск симуляции");
            startSimulation();
        });
    }

    // Реальный GPS можно будет подключить позже тем же moveMarkerSmooth(coords)
    // и той же checkZones(coords). Пока оставляем чисто симуляцию для отладки.
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
