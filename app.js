let map;
let arrow;
let simulationPoints = [];
let gpsActive = false;

function log(msg) {
    console.log(msg);
    const debugEl = document.getElementById("debug");
    if (debugEl) {
        debugEl.textContent += msg + "\n";
    }
}
function setStatus(msg) {
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = msg;
}

function initMap() {
    map = new ymaps.Map("map", {
        center: [55.796, 49.106],
        zoom: 14
    });

    fetch("points.json")
        .then(res => res.json())
        .then(routeCoords => {
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

            // Стрелка как обычный маркер
            arrow = new ymaps.Placemark(routeCoords[0], {}, {
                iconLayout: 'default#image',
                iconImageHref: 'arrow.png',
                iconImageSize: [100, 100],
                iconImageOffset: [-50, -50],
            });
            map.geoObjects.add(arrow);

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

function moveMarker(coords) {
    if (arrow) {
        arrow.geometry.setCoordinates(coords);
    }
}

function rotateArrow(degrees) {
    if (arrow) {
        arrow.options.set('iconImageRotation', degrees);
    }
}

function startSimulation() {
    if (!simulationPoints.length) {
        log("Нет точек для симуляции");
        return;
    }
    let i = 0;
    gpsActive = false;
    setStatus("Симуляция запущена");

    const interval = setInterval(() => {
        moveMarker(simulationPoints[i]);
        i++;
        if (i >= simulationPoints.length) {
            clearInterval(interval);
            setStatus("Симуляция завершена");
        }
    }, 1000);
}

function initCompass() {
    function handler(event) {
        let heading = event.alpha;
        log("Компас угол: " + heading);
        rotateArrow(heading);
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(response => {
            if (response === 'granted') {
                window.addEventListener("deviceorientation", handler);
            }
        });
    } else {
        window.addEventListener("deviceorientation", handler);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
