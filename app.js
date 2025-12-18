let map;
let arrow;
let simulationPoints = [];
let gpsActive = false;

// Логирование и статус
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

// Инициализация карты
function initMap() {
    map = new ymaps.Map("map", {
        center: [55.796, 49.106], // центр Казани
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

            // Кастомный layout для стрелки
            const ArrowLayout = ymaps.templateLayoutFactory.createClass(
                '<div style="width:100px;height:100px;transform:rotate({{options.rotation}}deg);">' +
                    '<img src="arrow.png" style="width:100%;height:100%;" />' +
                '</div>'
            );

            // Создаём стрелку
            arrow = new ymaps.Placemark(routeCoords[0], {}, {
                iconLayout: ArrowLayout,
                rotation: 0, // начальный угол
                iconImageSize: [100, 100],
                iconImageOffset: [-50, -50],
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
        log("Поворот стрелки: " + degrees);
        arrow.options.set('rotation', degrees);
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
    function handler(event) {
        let heading = event.alpha; // угол в градусах
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
