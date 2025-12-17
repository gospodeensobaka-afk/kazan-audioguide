let map;
let userGeoObject = null;
let pointsData = [];

function setStatus(t) {
    document.getElementById("route-status").textContent = t;
}

function debug(t) {
    document.getElementById("debug").textContent += t + "\n";
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

function checkRadius(coords) {
    if (!pointsData.length) return;
    let nearest = null;
    let nearestDist = Infinity;

    pointsData.forEach(p => {
        const d = distanceBetween(coords[0], coords[1], p.lat, p.lon);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = p;
        }
    });

    if (nearest) {
        setStatus(`Ближайшая: ${nearest.name}, ~${nearestDist.toFixed(1)} м`);
    }
}

function initMap() {
    map = new ymaps.Map("map", {
        center: [55.8266, 49.0820],
        zoom: 17,
        controls: []
    });

    fetch("points.json")
        .then(r => r.json())
        .then(points => {
            pointsData = points;

            points.forEach(p => {
                map.geoObjects.add(new ymaps.Placemark(
                    [p.lat, p.lon],
                    { balloonContent: p.name },
                    { preset: "islands#redIcon" }
                ));

                map.geoObjects.add(new ymaps.Circle(
                    [[p.lat, p.lon], p.radius],
                    {},
                    {
                        fillColor: "rgba(255,0,0,0.15)",
                        strokeColor: "rgba(255,0,0,0.4)",
                        strokeWidth: 2
                    }
                ));
            });

            setStatus("Точки загружены.");
        });

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const coords = [pos.coords.latitude, pos.coords.longitude];
                debug("Геолокация: " + coords.join(", "));

                userGeoObject = new ymaps.Placemark(
                    coords,
                    {},
                    { preset: "islands#blueCircleIcon" }
                );

                map.geoObjects.add(userGeoObject);
                map.setCenter(coords);
                checkRadius(coords);
            },
            () => setStatus("Ошибка геолокации"),
            { enableHighAccuracy: true }
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
