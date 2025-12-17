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
const ANIMATION_DURATION = 1200; // мс

let startCoords = null;
let targetCoords = null;

// Зоны-чекпоинты
let zones = [];

// Маршрут (список координат по порядку id)
let routeCoords = [];

// Симуляция
let simulationActive = false;
let simulationIndex = 0;

// GPS состояние
let gpsActive = true;


// ======================================================
// 2. УТИЛИТЫ: ЛОГ, СТАТУС, МАТЕМАТИКА
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

// Расстояние между точками (в метрах)
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

// Лерп координат
function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

// Угол между двумя точками (в градусах)
// dx по долготе, dy по широте — как в навигаторах
function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}


// ======================================================
// 3. ЗОНЫ (ЧЕКПОИНТЫ)
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

            // Финальная точка — просто лог и статус, без сброса
            // (логика аудиогида: прошёл — больше не возвращаешься)
            if (z.isLast) {
                setStatus("Финальная точка достигнута!");
                log("Финальная точка достигнута.");
            }
        }
    });
}


// ======================================================
// 4. ДВИЖЕНИЕ МАРКЕРА: ПЛАВНОСТЬ + ПОВОРОТ
// ======================================================

// Анимационный кадр
function animateMarker(timestamp) {
    if (!animationStartTime) animationStartTime = timestamp;

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / ANIMATION_DURATION;
    if (t > 1) t = 1;

    const current = lerpCoords(startCoords, targetCoords, t);

    // Поворот стрелки по направлению движения
    const angle = calculateAngle(startCoords, targetCoords);
    lastAngle = angle;
    userMarker.options.set("iconImageRotation", angle);

    // Перемещение
    userMarker.geometry.setCoordinates(current);
    checkZones(current);

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;

        // Если идёт симуляция — двигаемся к следующей точке
        if (simulationActive) {
            simulateNextStep();
        }
    }
}

// Общий метод движения (GPS и симуляция)
// Именно эта функция реализует «логику навигатора»
function moveMarkerSmooth(newCoords) {
    // Первый вызов — просто ставим стрелку в точку
    if (!lastCoords) {
        lastCoords = newCoords;
        userMarker.geometry.setCoordinates(newCoords);
        userMarker.options.set("iconImageRotation", lastAngle);
        checkZones(newCoords);
        return;
    }

    // Если движение совсем маленькое — не анимируем
    const dist = distance(lastCoords, newCoords);
    if (dist < 0.5) {
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


// ======================================================
// 5. СИМУЛЯЦИЯ МАРШРУТА
// ======================================================

function simulateNextStep() {
    if (!simulationActive) return;

    if (simulationIndex >= routeCoords.length) {
        simulationActive = false;
        gpsActive = true;
        setStatus("Симуляция завершена");
        log("Симуляция завершена");
        return;
    }

    const next = routeCoords[simulationIndex];
    simulationIndex++;

    moveMarkerSmooth(next);
}

function startSimulation() {
    if (!routeCoords.length) {
        setStatus("Нет маршрута для симуляции");
        log("Нет routeCoords для симуляции");
        return;
    }

    simulationActive = true;
    gpsActive = false;
    simulationIndex = 0;

    const start = routeCoords[0];
    lastCoords = start;

    userMarker.geometry.setCoordinates(start);
    userMarker.options.set("iconImageRotation", lastAngle);
    map.setCenter(start, 15);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    simulateNextStep();
}


// ======================================================
// 6. ИНИЦИАЛИЗАЦИЯ КАРТЫ, МАРКЕРА, МАРШРУТА, ЗОН
// ======================================================

function initMap() {
    const initialCenter = [55.826584, 49.082118]; // Старт, под твой маршрут

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 15,
        controls: []
    });

    // ----- МАРКЕР-СТРЕЛКА -----
    // Создаём ОДИН раз и больше НИКОГДА не пересоздаём
    userMarker = new ymaps.Placemark(
        initialCenter,
        {},
        {
            iconLayout: "default#image",
            iconImageHref: "arrow.png",       // В корне рядом с index.html
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
            if (!Array.isArray(points) || points.length === 0) {
                setStatus("points.json пустой");
                log("points.json пустой или не массив");
                return;
            }

            // Сортируем точки по id — задаём ПОРЯДОК маршрута
            const sorted = points.slice().sort((a, b) => a.id - b.id);

            // 6.1. Нумерация точек (вариант A — синие кружки с цифрой)
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

            // 6.2. Зоны
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
                    isLast: index === sorted.length - 1 // последняя точка маршрута
                });
            });

            // 6.3. Маршрут (Polyline) по порядку id
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

            setStatus("Маршрут загружен, готов к симуляции");
            log("Точки и маршрут загружены");
        })
        .catch(err => {
            console.error(err);
            setStatus("Ошибка загрузки points.json");
            log("Ошибка загрузки points.json: " + err.message);
        });

    // ----- Кнопка симуляции -----
    const btnSim = document.getElementById("simulate");
    if (btnSim) {
        btnSim.addEventListener("click", startSimulation);
    }

    // ----- GPS -----
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            pos => {
                if (!gpsActive) return;

                const coords = [pos.coords.latitude, pos.coords.longitude];
                moveMarkerSmooth(coords);
            },
            err => {
                log("Ошибка GPS: " + err.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 10000
            }
        );
    } else {
        setStatus("GPS не поддерживается");
        log("navigator.geolocation не поддерживается");
    }

    setStatus("Карта инициализирована");
    log("Карта инициализирована");
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
