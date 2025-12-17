let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
}

let map;
let userGeoObject = null;
let activePointId = null;
let pointsData = [];
let lastDebugPoint = null; // для отладки ближайшей точки

function setStatus(text) {
    const el = document.getElementById("route-status");
    if (el) el.textContent = text;
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

        // Запоминаем ближайшую точку (для отладки)
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestPoint = point;
        }

        if (dist <= point.radius) {
            foundActive = point;
        }
    });

    // Отладка: показываем расстояние до ближайшей точки
    if (nearestPoint) {
        const debugName = nearestPoint.name || nearestPoint.id || "точка";
        setStatus(
            `Ближайшая: ${debugName}, ~${nearestDist.toFixed(1)} м` +
            (foundActive ? ` — ВНУТРИ зоны ${foundActive.name}` : "")
        );
    }

    if (foundActive && activePointId !== foundActive.id) {
        activePointId = foundActive.id;
        console.log("ENTER ZONE:", foundActive.id, foundActive.name);
        // тут потом повесим запуск аудио
    }

    if (!foundActive && activePointId !== null) {
        console.log("EXIT ZONE:", activePointId);
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
                    {
                        balloonContent: `<b>${point.name}</b><br>${point.text}`
                    },
                    {
                        preset: "islands#redIcon"
                    }
                );

                const circle = new ymaps.Circle(
                    [
                        [point.lat, point.lon],
                        point.radius
                    ],
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
                } else {
                    userGeoObject.geometry.setCoordinates(coords);
                }

                map.setCenter(coords, 16);
                setStatus("Геолокация получена.");
                checkRadius(coords); // сразу проверим зоны в стартовой точке
            },
            (err) => {
                console.warn("Ошибка геолокации (getCurrentPosition)", err);
                setStatus("Не удалось получить геолокацию.");
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );

        navigator.geolocation.watchPosition(
            (pos) => {
                const newCoords = [pos.coords.latitude, pos.coords.longitude];

                if (userGeoObject) {
                    const oldCoords = userGeoObject.geometry.getCoordinates();
                    userGeoObject.geometry.setCoordinates(newCoords);
                    checkRadius(newCoords);

                    const dx = newCoords[1] - oldCoords[1];
                    const dy = newCoords[0] - oldCoords[0];
                    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
                    userGeoObject.options.set("iconImageRotation", angle);
                } else {
                    // На всякий случай, если маркер ещё не создан
                    userGeoObject = new ymaps.Placemark(
                        newCoords,
                        {},
                        {
                            preset: "islands#blueNavigationIcon",
                            iconImageRotate: true
                        }
                    );
                    map.geoObjects.add(userGeoObject);
                    checkRadius(newCoords);
                }

                // Если хочешь – можно не трогать центр карты при движении
                // map.setCenter(newCoords, 16);
            },
            (err) => {
                console.warn("Ошибка геолокации (watchPosition)", err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );

    } else {
        setStatus("Геолокация недоступна.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const recenterBtn = document.getElementById("recenter-btn");

    if (recenterBtn) {
        recenterBtn.addEventListener("click", () => {
            if (!userGeoObject) {
                setStatus("Сначала нужно получить геолокацию.");
                return;
            }
            const coords = userGeoObject.geometry.getCoordinates();
            map.setCenter(coords, 16, { duration: 300 });
        });
    }

    if (window.ymaps) {
        ymaps.ready(initMap);
    } else {
        setStatus("Ошибка загрузки Яндекс.Карт.");
    }
});
