let map;
let arrow;
let simulationPoints = [];
let gpsActive = false;

// Логирование и статус
function log(msg) {
    console.log(msg);
}
function setStatus(msg) {
    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.textContent = msg;
}

// Инициализация карты
function initMap() {
    map = new ymaps.Map("map", {
        center: [55.796, 49.106], // центр Казани для примера
        zoom: 14
    });

    // Загружаем точки маршрута
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

            // Создаём стрелку
            arrow = new ymaps.Placemark(routeCoords[0], {}, {
                iconLayout: 'default#image',
                iconImageHref: 'arrow.jpg',
                iconImageSize: [100, 100],
                iconImageOffset: [-50, -50], // центр картинки
            });
            map.geoObjects.add(arrow);

            setStatus("Готово к симуляции");
            log("Точки и маршрут загружены");
        });

    // Кнопка симуляции
    const btnSim = document.getElementById("simulate");
    if (btnSim) btnSim.addEventListener("click", startSimulation);

    // GPS‑трекер
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

    // Кнопка компаса
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

// Движение стрелки
function moveMarker(coords) {
    if (arrow) {
        arrow.geometry.setCoordinates(coords);
    }
}

// Поворот стрелки
function rotateArrow(degrees) {
    if (arrow) {
        arrow.options.set('iconImageRotation', degrees);
    }
}

// Симуляция движения по точкам
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

// Инициализация компаса
function initCompass() {
    window.addEventListener("deviceorientation", (event) => {
        let heading = event.alpha; // угол в градусах (0 = север)
        rotateArrow(heading);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    ymaps.ready(initMap);
});
