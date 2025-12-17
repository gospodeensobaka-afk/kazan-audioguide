let map;
let userGeoObject = null;

function log(t) {
    document.getElementById("debug").textContent += t + "\n";
}

function setStatus(t) {
    document.getElementById("status").textContent = t;
}

function initMap() {
    log("initMap вызван");

    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820],
        zoom: 16,
        controls: []
    });

    setStatus("Карта создана");

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
