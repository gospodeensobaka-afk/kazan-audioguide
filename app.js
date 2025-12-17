let map;
let userGeoObject = null;
let lastCoords = null;
let lastAngle = 0;

// Параметры анимации движения
let animationFrameId = null;
let animationStartTime = null;
let animationDuration = 400;
let startCoords = null;
let targetCoords = null;

// Параметры автоповорота карты
let lastMapRotation = 0;
let rotationSmoothing = 0.15; // плавность поворота карты

function log(t) {
    const el = document.getElementById("debug");
    if (el) el.textContent += t + "\n";
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

// Вычисляем угол направления движения
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

// Плавная анимация движения стрелки
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

    if (t < 1) {
        animationFrameId = requestAnimationFrame(animateMarker);
    } else {
        animationFrameId = null;
        animationStartTime = null;
        lastCoords = targetCoords;
    }
}

// Запуск плавного движения
function moveMarkerSmooth(newCoords) {
    if (!lastCoords) {
        if (userGeoObject) {
            userGeoObject.geometry.setCoordinates(newCoords);
        }
        lastCoords = newCoords;
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

    // 🔥 Автоповорот карты
    rotateMapToAngle(angle);
}

// Плавный поворот карты
function rotateMapToAngle(targetAngle) {
    if (!map) return;

    // нормализуем угол
    let diff = targetAngle - lastMapRotation;
    diff = ((diff + 180) % 360) - 180;

    lastMapRotation += diff * rotationSmoothing;

    map.setRotation(lastMapRotation);
}

function initMap() {
    log("initMap вызван");

    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820],
        zoom: 17,
        controls: []
    });

    setStatus("Карта создана");

    // Жесты
    map.behaviors.enable('multiTouch');
    map.behaviors.enable('drag');
    map.behaviors.enable('scrollZoom');

    // 🔥 Отключаем синий кружок Яндекса
    ymaps.modules.require(['geolocation'], function (geolocation) {
        geolocation.get({
            provider: 'browser',
            mapStateAutoApply: false
        });
    });

    // Точки и зоны
    fetch("points.json")
        .then(r => r.json())
        .then(points => {
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
            });

            log("Точки и зоны загружены");
        });

    // Геолокация
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                lastCoords = coords;

                log("Геолокация: " + coords.join(", "));

                userGeoObject = new ymaps.Placemark(
                    coords,
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
                map.setCenter(coords);
                setStatus("Геолокация получена");
            },
            err => {
                log("Ошибка геолокации: " + err.message);
                setStatus("Ошибка геолокации");
            },
            { enableHighAccuracy: true }
        );

        navigator.geolocation.watchPosition(
            pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                log("watchPosition: " + coords.join(", "));

                if (userGeoObject) {
                    moveMarkerSmooth(coords);
                } else {
                    lastCoords = coords;
                }
            },
            err => log("Ошибка watchPosition: " + err.message),
            { enableHighAccuracy: true }
        );
    } else {
        log("Геолокация недоступна");
        setStatus("Геолокация недоступна");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    log("DOM загружен");
    ymaps.ready(initMap);
});
