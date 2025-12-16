// Инициализация Telegram WebApp
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
}

let map;
let userGeoObject = null;

// Обновление статуса
function setStatus(text) {
    const el = document.getElementById("route-status");
    if (el) el.textContent = text;
}

// -----------------------------
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// -----------------------------
function initMap() {
    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820], // центр двора
        zoom: 17,
        controls: []
    });

    setStatus("Карта загружена. Загружаем точки…");

    // -----------------------------
    // ЗАГРУЗКА ТОЧЕК
    // -----------------------------
    fetch("points.json")
        .then(response => response.json())
        .then(points => {

            points.forEach(point => {

                // Маркер точки
                const placemark = new ymaps.Placemark(
                    [point.lat, point.lon],
                    {
                        balloonContent: `<b>${point.name}</b><br>${point.text}`
                    },
                    {
                        preset: "islands#redIcon"
                    }
                );

                // Круг радиуса
                const circle = new ymaps.Circle(
                    [
                        [point.lat, point.lon],   // центр
                        point.radius              // радиус в метрах
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

    // -----------------------------
    // ПЕРВОЕ ПОЛУЧЕНИЕ ГЕОЛОКАЦИИ
    // -----------------------------
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];

                if (!userGeoObject) {
                    userGeoObject = new ymaps.Placemark(coords, {}, {
                        preset: "islands#blueCircleDotIcon"
                    });
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

        // -----------------------------
        // ОТСЛЕЖИВАНИЕ ДВИЖЕНИЯ
        // -----------------------------
        navigator.geolocation.watchPosition(
            (pos) => {
                const coords = [pos.coords.latitude, pos.coords.longitude];

                if (userGeoObject) {
                    userGeoObject.geometry.setCoordinates(coords);
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

// -----------------------------
// ЗАПУСК ПОСЛЕ ЗАГРУЗКИ DOM
// -----------------------------
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