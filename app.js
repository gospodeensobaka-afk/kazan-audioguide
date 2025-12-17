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

// Лог
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

// Проверка входа в зоны
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

            // Если это последняя точка маршрута (id = 4)
            if (z.id === 4) {
                setStatus("Финальная точка достигнута. Сброс через 10 секунд.");
                log("Финальная точка достигнута.");

                // Через 10 секунд сбрасываем все зоны
                setTimeout(() => {
                    zones.forEach(zone => {
                        zone.visited = false;
                        zone.circle.options.set({
                            fillColor: "rgba(255,0,0,0.15)",
                            strokeColor: "rgba(255,0,0,0.4)"
                        });
                    });

                    setStatus("Маршрут сброшен. Можно проходить снова.");
                    log("Все зоны сброшены.");
                }, 10000);
            }
        }
    });
}

// Простое перемещение маркера
function moveMarker(coords) {
    lastCoords = coords;
    userMarker.geometry.setCoordinates(coords);
    checkZones(coords);
}

// ===== СИМУЛЯЦИЯ =====

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
    map.setCenter(start, 14);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    setTimeout(simulateNextStep, 2000);
}

// ===== ИНИЦИАЛИЗАЦИЯ КАРТЫ =====

function initMap() {
    const initialCenter = [55.826584, 49.082118]; // Старт

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 14,
        controls: []
    });

    // Простой маркер (кружок)
    userMarker = new ymaps.Placemark(
        initialCenter,
        {},
        {
            preset: "islands#redCircleIcon"
        }
    );

    map.geoObjects.add(userMarker);

    // Загружаем точки
    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            // Создаём зоны
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

            // Маршрут симуляции: 1 → 2 → 3 → 4
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
            log("Точки симуляции загружены");
        });

    // Кнопка симуляции
    const btnSim = document.getElementById("simulate");
    if (btnSim) {
        btnSim.addEventListener("click", startSimulation);
    }

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
