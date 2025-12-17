let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
}

let map;
let userGeoObject = null;
let activePointId = null;
let pointsData = [];

function setStatus(text) {
    const el = document.getElementById("route-status");
    if (el) el.textContent = text;
}

function debug(msg) {
    const el = document.getElementById("debug");
    if (el) el.textContent += msg + "\n";
}

function distanceBetween(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkRadius(userCoords) {
    if (!pointsData.length) return;

    let foundActive = null;
    let nearestPoint = null;
    let nearestDist = Infinity;

    pointsData.forEach(point => {
        const dist = distanceBetween(
            userCoords[0], userCoords[1],
            point.lat, point.lon
        );

        if (dist < nearestDist) {
            nearestDist = dist;
            nearestPoint = point;
        }

        if (dist <= point.radius) {
            foundActive = point;
        }
    });

    if (nearestPoint) {
        setStatus(
            `Ближайшая: ${nearestPoint.name}, ~${nearestDist.toFixed(1)} м` +
            (foundActive ? ` — ВНУТРИ зоны ${foundActive.name}` : "")
        );
    }

    if (foundActive && activePointId !== foundActive.id) {
        activePointId = foundActive.id;
        debug("ENTER ZONE: " + foundActive.name);
    }

    if (!foundActive && activePointId !== null) {
        debug("EXIT ZONE: " + activePointId);
        activePointId = null;
    }
}

function initMap() {
    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820],
        zoom: 17,
        controls: [],
        suppressMapOpenBlock: true,
        suppressGeoLocation: true
    });

    setStatus("Карта загружена. Загружаем точки…");

    fetch("points.json")
        .then(response => response.json())
        .then(points => {
            pointsData = points;

            points.forEach(point => {
                const placemark = new ymaps.Placemark(
                    [point.lat, point.lon],
                    { balloonContent: `<b>${point.name}</b><br>${point.text}` },
                    { preset: "islands#redIcon" }
                );

                const circle = new ymaps.Circle(
                    [[point.lat, point.lon], point.radius],
                    {},
                    {
                        fillColor: "rgba(255, 0, 0, 0.15)",
                        strokeColor: "rgba(255, 0, 0, 0.4)",
                        strokeWidth: 2
                    }
                );

                map.geoObjects.add(circle);
                map.geoObjects.add(placemark);
            });

            setStatus("Точки загружены. Определяем местоположение…");
        });

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                debug("Геолокация получена: " + coords.join(", "));

                if (!userGeoObject) {
                    userGeoObject = new ymaps.Placemark(
                        coords,
                        {},
                        {
                            preset: "islands#blueNavigationIcon",
                            iconImageRotate: true
                        }
                    );
                    map.geoObjects.add(userGeoObject);
                }

                map.setCenter(coords, 16);
                checkRadius(coords);
                setStatus("Геолокация получена.");
            },
            () => {
                debug("Ошибка геолокации");
                setStatus("Не удалось получить геолокацию.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        navigator.geolocation.watchPosition(
            (pos) => {
                const newCoords = [pos.coords.latitude, pos.coords.longitude];
                debug("watchPosition: " + newCoords.join(", "));

                if (userGeoObject) {
                    const oldCoords = userGeoObject.geometry.getCoordinates();
                    userGeoObject.geometry.setCoordinates(newCoords);

                    const dx = newCoords[1] - oldCoords[1];
                    const dy = newCoords[0] - oldCoords[0];
                    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
                    userGeoObject.options.set("iconImageRotation", angle);

                    checkRadius(newCoords);
                }
            },
            () => debug("Ошибка watchPosition"),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const recenterBtn = document.getElementById("recenter-btn");
    const simulateBtn = document.getElementById("simulate-btn");

    if (recenterBtn) {
        recenterBtn.addEventListener("click", () => {
            if (!userGeoObject) return;
            const coords = userGeoObject.geometry.getCoordinates();
            map.setCenter(coords, 16, { duration: 300 });
        });
    }

    if (simulateBtn) {
        simulateBtn.addEventListener("click", () => {
            debug("Симуляция: кнопка нажата");

            if (!userGeoObject) {
                debug("ОШИБКА: userGeoObject = null");
                setStatus("Сначала нужно получить геолокацию.");
                return;
            }

            setStatus("Симуляция движения…");
            debug("Симуляция: старт цикла");

            const path = [
                [55.8266, 49.0820],
                [55.8267, 49.0821],
                [55.8268, 49.0822],
                [55.8269, 49.0823],
                [55.8270, 49.0824],
                [55.8271, 49.0825]
            ];

            let i = 0;

            const interval = setInterval(() => {
                if (i >= path.length) {
                    clearInterval(interval);
                    setStatus("Симуляция завершена.");
                    debug("Симуляция завершена");
                    return;
                }

                const newCoords = path[i];
                const oldCoords = userGeoObject.geometry.getCoordinates();

                debug("Шаг " + i + ": " + newCoords.join(", "));

                userGeoObject.geometry.setCoordinates(newCoords);

                const dx = newCoords[1] - oldCoords[1];
                const dy = newCoords[0] - oldCoords[0];
                const angle = Math.atan2(dx, dy) * (180 / Math.PI);
                userGeoObject.options.set("iconImageRotation", angle);

                checkRadius(newCoords);
                map.setCenter(newCoords);

                i++;
            }, 700);
        });
    }

    ymaps.ready(initMap);
});
