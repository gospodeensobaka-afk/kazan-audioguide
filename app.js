// ======================================================
// 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ======================================================

let map;
let userMarker = null;

let lastCoords = null;
let zones = [];

let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

let gpsActive = true;

let compassActive = false;
let compassAngle = null;

// Глобальная ссылка на экземпляр Canvas‑layout стрелки
let arrowLayoutInstance = null;


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
// 4. CANVAS-СТРЕЛКА (layout + управление поворотом)
// ======================================================

// Кастомный layout с <canvas>, который рисует arrow.png и вращает её
const ArrowLayout = ymaps.templateLayoutFactory.createClass(
    '<canvas width="60" height="60"></canvas>',
    {
        build: function () {
            ArrowLayout.superclass.build.call(this);

            // Находим canvas, созданный этим layout
            this.canvas = this.getParentElement().querySelector("canvas");
            this.ctx = this.canvas.getContext("2d");

            this.image = new Image();
            this.image.src = "arrow.png";

            this.rotation = 0; // угол в градусах

            // Сохраняем ссылку на текущий экземпляр layout
            arrowLayoutInstance = this;

            this.image.onload = () => {
                this.draw();
            };
        },

        clear: function () {
            // При очистке убираем ссылку
            if (arrowLayoutInstance === this) {
                arrowLayoutInstance = null;
            }
            ArrowLayout.superclass.clear.call(this);
        },

        draw: function () {
            if (!this.ctx || !this.image) return;

            const ctx = this.ctx;
            const img = this.image;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0, 0, w, h);

            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.rotate(this.rotation * Math.PI / 180);

            // Рисуем стрелку по центру
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            ctx.restore();
        },

        // Вызывается извне, чтобы обновить угол
        setRotation: function (angle) {
            this.rotation = angle;
            this.draw();
        }
    }
);

// Функция, которую будет вызывать rotateMarker
function rotateArrow(angle) {
    if (!arrowLayoutInstance) {
        // layout ещё не построен (например, карта не успела инициализироваться)
        return;
    }
    arrowLayoutInstance.setRotation(angle);
}


// ======================================================
// 5. ГИБРИДНЫЙ ПОВОРОТ СТРЕЛКИ (теперь управляет Canvas)
// ======================================================

function rotateMarker(prev, curr, forcedAngle = null) {
    let angle = null;

    // 1) Симуляция передала угол
    if (forcedAngle !== null) {
        angle = forcedAngle;
    }

    // 2) Компас активен (оставляем на будущее — когда захочешь задействовать)
    else if (compassActive && compassAngle !== null) {
        angle = compassAngle;
    }

    // 3) Есть движение
    else if (prev) {
        angle = calculateAngle(prev, curr);
    }

    // 4) Стоим → смотрим на следующую точку маршрута
    else if (!prev && simulationPoints.length > 1) {
        angle = calculateAngle(simulationPoints[0], simulationPoints[1]);
    }

    if (angle !== null) {
        // Раньше здесь был iconImageRotation — теперь вращаем Canvas‑стрелку
        rotateArrow(angle);
    }
}


// ======================================================
// 6. ПЕРЕМЕЩЕНИЕ МАРКЕРА
// ======================================================

function moveMarker(coords, forcedAngle = null) {
    rotateMarker(lastCoords, coords, forcedAngle);
    lastCoords = coords;
    userMarker.geometry.setCoordinates(coords);
    checkZones(coords);
}


// ======================================================
// 7. СИМУЛЯЦИЯ
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

    const curr = simulationPoints[simulationIndex];
    const next = simulationPoints[simulationIndex + 1];

    let angle = null;
    if (next) angle = calculateAngle(curr, next);

    simulationIndex++;

    moveMarker(curr, angle);

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
    const next = simulationPoints[1];

    let angle = null;
    if (next) angle = calculateAngle(start, next);

    moveMarker(start, angle);
    map.setCenter(start, 15);

    setStatus("Симуляция запущена");
    log("Симуляция запущена");

    setTimeout(simulateNextStep, 2000);
}


// ======================================================
// 8. КОМПАС
// ======================================================

function initCompass() {
    log("initCompass() вызван по клику");

    if (!window.DeviceOrientationEvent) {
        log("Компас не поддерживается");
        return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        log("iOS: вызываем requestPermission()");

        DeviceOrientationEvent.requestPermission()
            .then(state => {
                log("Ответ iOS: " + state);

                if (state === "granted") {
                    compassActive = true;
                    window.addEventListener("deviceorientation", handleCompass);
                    setStatus("Компас включён");
                    log("Компас активирован (iOS)");
                } else {
                    setStatus("Компас отклонён");
                    log("Компас отклонён пользователем (iOS)");
                }
            })
            .catch(err => {
                log("Ошибка iOS: " + err);
                setStatus("Ошибка компаса");
            });

        return;
    }

    log("Android/Chrome: включаем deviceorientation");
    compassActive = true;

    window.addEventListener("deviceorientationabsolute", handleCompass);
    window.addEventListener("deviceorientation", handleCompass);

    setStatus("Компас включён");
    log("Компас активирован (Android)");
}

function handleCompass(e) {
    if (e.alpha == null) {
        log("handleCompass: alpha === null");
        return;
    }

    compassAngle = 360 - e.alpha;
    log("Компас угол: " + compassAngle.toFixed(2));
}


// ======================================================
// 9. ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ======================================================

function initMap() {
    const initialCenter = [55.826584, 49.082118];

    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 15,
        controls: []
    });

    // === ЗАМЕНА: вместо default#image используем наш Canvas‑layout ===
    userMarker = new ymaps.Placemark(
        initialCenter,
        {},
        {
            iconLayout: ArrowLayout, // кастомный layout со стрелкой
            iconShape: {
                type: 'Circle',
                radius: 30,
                coordinates: [30, 30]
            }
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

            simulationPoints = routeCoords;

            setStatus("Готово к симуляции");
            log("Точки и маршрут загружены");
        });

    const btnSim = document.getElementById("simulate");
    if (btnSim) btnSim.addEventListener("click", startSimulation);

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

    const btnCompass = document.getElementById("enableCompass");
    if (btnCompass) {
        btnCompass.addEventListener("click", () => {
            log("Кнопка 'Включить компас' нажата");
            initCompass();
        });
    }

    setStatus("Карта инициализирована");
    log("Карта инициализирована");
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
