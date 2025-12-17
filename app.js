    // =======================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// =======================

let map;
let userMarker = null;

let lastCoords = null;        // последние координаты маркера
let lastAngle = 0;            // последний угол поворота

// Анимация движения
let animationFrameId = null;
let animationStartTime = null;
let animationDuration = 600;  // мс на перемещение между точками
let startCoords = null;
let targetCoords = null;

// Зоны
let zones = [];
let routeCompleted = false;   // чтобы финальная точка не триггерила сброс несколько раз

// Симуляция
let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

// GPS
let gpsActive = true;

// Автоследование карты (B2)
// true — карта следует за стрелкой
// false — карта остаётся там, куда её сдвинул пользователь
let autoFollow = true;


// =======================
// Служебные функции
// =======================

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

// Угол между двумя координатами (для поворота стрелки)
function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    const angleRad = Math.atan2(dx, dy);
    return angleRad * (180 / Math.PI);
}

// Линейная интерполяция между координатами
function lerpCoords(start, end, t) {
    return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];
}

// Расстояние между двумя точками (метры)
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


// =======================
// ЗОНЫ И ЧЕКПОИНТЫ
// =======================

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

            // Финальная точка — Мусорка
            if (z.name === "Мусорка" && !routeCompleted) {
                routeCompleted = true;
                log("Маршрут пройден: достигнута Мусорка");
                setStatus("Маршрут пройден! Сброс через 1 секунду.");

                // Даём пользователю увидеть зелёный круг
                setTimeout(() => {
                    resetAllZones();
                }, 1000);
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

    routeCompleted = false;
    log("Все зоны сброшены");
    setStatus("Все чекпоинты сброшены. Можно проходить маршрут снова.");
}


// =======================
// АНИМАЦИЯ МАРКЕРА И АВТОСЛЕДОВАНИЕ
// =======================

function animateMarker(timestamp) {
    if (!animationStartTime) animationStartTime = timestamp;

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / animationDuration;
    if (t > 1) t = 1;

    const current = lerpCoords(startCoords, targetCoords, t);

    // Перемещаем маркер
    userMarker.geometry.setCoordinates(current);

    // Поворот стрелки
    userMarker.options.set("iconImageRotation", lastAngle);

    // Автоследование карты (если не выключено пользователем)
    if (autoFollow) {
        map.setCenter(current, undefined, { duration: 200 });
    }

    // Проверяем зоны по пути
    checkZones(current);

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;

        // Если идёт симуляция — продолжаем следующий шаг
        if (simulationActive) {
            simulateNextStep();
        }
    }
}

function moveMarkerSmooth(newCoords) {
    // Если ещё нет lastCoords — просто ставим маркер и сохраняем
    if (!lastCoords) {
        lastCoords = newCoords;
        userMarker.geometry.setCoordinates(newCoords);

        // При первом появлении тоже можно автофолловить
        if (autoFollow) {
            map.setCenter(newCoords, undefined, { duration: 200 });
        }

        checkZones(newCoords);
        return;
    }

    // Защита от нулевого движения (чтобы не дёргать анимацию и угол)
    const dist = distance(lastCoords, newCoords);
    if (dist < 0.5) {
        // Движения практически нет — игнорируем
        return;
    }

    // Останавливаем предыдущую анимацию, если ещё идёт
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        animationStartTime = null;
    }

    startCoords = lastCoords;
    targetCoords = newCoords;

    // Считаем угол движения
    lastAngle = calculateAngle(startCoords, targetCoords);

    animationFrameId = requestAnimationFrame(animateMarker);
}


// =======================
// СИМУЛЯЦИЯ
// =======================

function simulateNextStep() {
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;      // возвращаем управление GPS
        setStatus("Симуляция завершена");
        log("Симуляция завершена, GPS снова активен");
        return;
    }

    const next = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarkerSmooth(next);
}

function startSimulation() {
    if (!simulationPoints.length) {
        setStatus("Точки симуляции не загружены");
        return;
    }

    simulationActive = true;
    gpsActive = false;      // отключаем GPS, чтобы не мешал
    autoFollow = true;      // включаем автоследование
    simulationIndex = 0;

    const start = simulationPoints[0];
    lastCoords = start;

    userMarker.geometry.setCoordinates(start);

    // S1 — при старте симуляции центрируем карту на стрелке
    map.setCenter(start, undefined, { duration: 300 });

    checkZones(start);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    simulateNextStep();
}


// =======================
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// =======================

function initMap() {
    // Центр — твоя стартовая точка (можно подправить)
    const initialCenter = [55.826620, 49.082188];

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 18,
        controls: []
    });

    // Кастомный маркер-стрелка
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

    // ОТКЛЮЧЕНИЕ автоследования при действии пользователя (B2)
    // Любое начало действия на карте (перемещение, зум) — вырубаем autoFollow
    map.events.add("actionbegin", () => {
        autoFollow = false;
        log("Автоследование выключено пользователем");
    });

    // Загружаем точки и зоны из points.json
    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            // Рисуем зоны
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

            // Собираем точки для симуляции
            // Здесь я оставляю твою логику: id 3 -> id 2 -> id 4 (Мусорка)
            const p1 = points.find(p => p.id === 3);
            const p4 = points.find(p => p.id === 2);
            const trash = points.find(p => p.id === 4);

            if (p1 && p4 && trash) {
                simulationPoints = [
                    [p1.lat, p1.lon],
                    [p4.lat, p4.lon],
                    [trash.lat, trash.lon]
                ];
                setStatus("Готово к симуляции");
                log("Точки симуляции загружены");
            } else {
                setStatus("Не удалось найти точки для симуляции");
                log("Ошибка: не найдены p1, p4 или trash в points.json");
            }
        })
        .catch(err => {
            console.error(err);
            setStatus("Ошибка загрузки points.json");
            log("Ошибка загрузки points.json: " + err);
        });

    // Кнопка симуляции
    const btnSim = document.getElementById("simulate");
    if (btnSim) {
        btnSim.addEventListener("click", () => {
            startSimulation();
        });
    }

    // GPS
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            pos => {
                if (!gpsActive) return;  // если идёт симуляция — игнорируем GPS

                const coords = [pos.coords.latitude, pos.coords.longitude];
                moveMarkerSmooth(coords);
            },
            err => {
                console.error(err);
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


// =======================
// СТАРТ
// =======================

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
