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

    pointsData.forEach(point => {
        const dist = distanceBetween(
            userCoords[0], userCoords[1],
            point.lat, point.lon
        );
        if (dist <= point.radius) {
            foundActive = point;
        }
    });

    if (foundActive && activePointId !== foundActive.id) {
        activePointId = foundActive.id;
        setStatus(`Вы вошли в зону: ${foundActive.name}`);
        console.log("ENTER:", foundActive.name);
    }

    if (!foundActive && activePointId !== null) {
        console.log("EXIT:", activePointId);
        setStatus("Вы вышли из зоны");
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
                            iconLayout: "default#image",
                            iconImageHref: "https://gospodeensobaka-afk.github.io/kazan-audioguide/assets/arrow-green.png",
                            iconImageSize: [40, 40],
                            iconImageOffset: [-20, -20],
                            iconImageRotate: true
                        }
                    );
                    map.geoObjects.add(userGeoObject);
                } else {
                    userGeoObject.geometry.setCoordinates(coords);
                }

                map.setCenter(coords, 16);
                setStatus("Геолокация получена.");
            },
            (err) => {
                console.warn("Ошибка геолокации", err);
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
                }

                setStatus("Обновление геолокации…");
            },
            (err) => {
                console.warn("Ошибка watchPosition", err);
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
    const helpBtn = document.getElementById("help-btn");

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

    if (helpBtn) {
        helpBtn.addEventListener("click", () => {
            setStatus("Скоро здесь появятся подсказки.");
        });
    }

    if (window.ymaps) {
        ymaps.ready(initMap);
    } else {
        setStatus("Ошибка загрузки Яндекс.Карт.");
    }
});
