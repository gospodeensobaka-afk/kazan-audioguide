let map;
let userGeoObject = null;

function log(t) {
    const el = document.getElementById("debug");
    if (el) el.textContent += t + "\n";
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

function initMap() {
    log("initMap вызван");

    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820],
        zoom: 17,
        controls: []
    });

    setStatus("Карта создана");

    // Загружаем точки и зоны
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
                log("Геолокация: " + coords.join(", "));

                userGeoObject = new ymaps.Placemark(
                    coords,
                    {},
                    { preset: "islands#blueCircleIcon" }
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
    } else {
        log("Геолокация недоступна");
        setStatus("Геолокация недоступна");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    log("DOM загружен");
    ymaps.ready(initMap);
});