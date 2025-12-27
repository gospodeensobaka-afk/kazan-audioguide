// ========================================================
// =============== GLOBAL VARIABLES & STATE ===============
// ========================================================

let map;
let arrowEl = null;            // DOM-стрелка
let lastCoords = null;         // [lat, lng]
let zones = [];

// SIMULATION
let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

// GPS & AUDIO
let gpsActive = true;
let audioEnabled = false;
let audioPlaying = false;

// --- ROUTE COLORING ---
let fullRoute = [];

// --- COMPASS STATE ---
let compassActive = false;
let smoothAngle = 0;           // сглаженный угол (S1)
let compassUpdates = 0;

// --- GPS DEBUG ---
let gpsAngleLast = null;
let gpsUpdates = 0;

// --- PNG STATUS ---
let arrowPngStatus = "init";
let iconsPngStatus = "init";

// --- MAP / ROUTE DEBUG ---
let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let lastRouteDist = null;
let lastRouteSegmentIndex = null;
let lastZoneDebug = "";

// --- ROUTE HITBOX (метров) ---
const ROUTE_HITBOX_METERS = 6; // "хитбокс" вокруг маршрута


// ========================================================
// ===================== UTILITIES ========================
// ========================================================

function distance(a, b) {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLon = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const x = dLon * Math.cos((lat1 + lat2) / 2);
    const y = dLat;
    return Math.sqrt(x * x + y * y) * R;
}

function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}

function normalizeAngle(a) {
    return (a + 360) % 360;
}

// переводим географические координаты в "плоские" для работы с отрезками
function latLngToXY(lat, lng) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const x = R * lng * rad * Math.cos(lat * rad);
    const y = R * lat * rad;
    return { x, y };
}

// информация о ближайшей точке на отрезке маршрута к точке пользователя
function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
    // pointLatLng: [lat, lng]
    // aLngLat / bLngLat: [lng, lat]
    const p = latLngToXY(pointLatLng[0], pointLatLng[1]);
    const a = latLngToXY(aLngLat[1], aLngLat[0]);
    const b = latLngToXY(bLngLat[1], bLngLat[0]);

    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;

    const len2 = vx * vx + vy * vy;
    if (len2 === 0) {
        const dist = Math.sqrt(wx * wx + wy * wy);
        return { dist, t: 0, projLngLat: [aLngLat[0], aLngLat[1]] };
    }

    let t = (wx * vx + wy * vy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * vx;
    const projY = a.y + t * vy;

    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // обратная аппроксимация в [lng, lat]
    const invRad = 180 / (Math.PI * 6371000);
    const projLat = projY * invRad;
    const projLng = projX * invRad / Math.cos(projLat * Math.PI / 180);

    return { dist, t, projLngLat: [projLng, projLat] };
}


// ========================================================
// ===================== AUDIO ZONES =======================
// ========================================================

function playZoneAudio(src) {
    if (!audioEnabled) return;
    if (audioPlaying) return;

    const audio = new Audio(src);
    audioPlaying = true;

    audio.play().catch(() => { audioPlaying = false; });
    audio.onended = () => { audioPlaying = false; };
}

function updateCircleColors() {
    const source = map.getSource("audio-circles");
    if (!source) return;

    source.setData({
        type: "FeatureCollection",
        features: zones
            .filter(z => z.type === "audio")
            .map(z => ({
                type: "Feature",
                properties: { id: z.id, visited: z.visited },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            }))
    });
}

// зона зеленеет и запускает аудио только после реального входа внутрь круга
function checkZones(coords) {
    let closestZone = null;
    let closestDist = Infinity;

    zones.forEach(z => {
        if (z.type !== "audio") return;

        const dist = distance(coords, [z.lat, z.lng]);

        if (dist < closestDist) {
            closestDist = dist;
            closestZone = { id: z.id, dist, visited: z.visited, entered: z.entered };
        }

        // фиксируем факт входа внутрь круга
        if (!z.entered && dist <= z.radius) {
            z.entered = true;
        }

        // зона становится зелёной и запускает аудио только после входа
        if (z.entered && !z.visited) {
            z.visited = true;
            updateCircleColors();

            if (z.audio) {
                playZoneAudio(z.audio);
            }
        }
    });

    if (closestZone) {
        lastZoneDebug =
            `id: ${closestZone.id} | dist: ${closestZone.dist.toFixed(1)}m` +
            ` | entered: ${closestZone.entered} | visited: ${closestZone.visited}`;
    } else {
        lastZoneDebug = "";
    }
}// ========================================================
// ===================== SUPER DEBUG =======================
// ========================================================

function ensureSuperDebug() {
    let dbg = document.getElementById("superDebug");
    if (!dbg) {
        dbg = document.createElement("div");
        dbg.id = "superDebug";
        dbg.style.position = "fixed";
        dbg.style.bottom = "0";
        dbg.style.left = "0";
        dbg.style.width = "100%";
        dbg.style.padding = "8px 10px";
        dbg.style.background = "rgba(0,0,0,0.75)";
        dbg.style.color = "white";
        dbg.style.fontSize = "12px";
        dbg.style.fontFamily = "monospace";
        dbg.style.zIndex = "99999";
        dbg.style.whiteSpace = "pre-line";
        dbg.style.display = "block";
        document.body.appendChild(dbg);
    }
    return dbg;
}

function debugUpdate(source, angle, error = "none") {
    const dbg = ensureSuperDebug();

    if (!arrowEl) {
        dbg.textContent = "NO ARROW ELEMENT";
        return;
    }

    const tr = arrowEl.style.transform || "none";

    let computed = "none";
    try {
        computed = window.getComputedStyle(arrowEl).transform;
    } catch (e) {
        computed = "error";
    }

    const ow = arrowEl.offsetWidth;
    const oh = arrowEl.offsetHeight;

    const rect = arrowEl.getBoundingClientRect();
    const boxRaw = `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;

    const vis = arrowEl.style.visibility || "undefined";
    const wc = arrowEl.style.willChange || "none";
    const to = arrowEl.style.transformOrigin || "none";
    const pos = arrowEl.style.position || "static";
    const top = arrowEl.style.top || "auto";
    const left = arrowEl.style.left || "auto";

    const routeDistStr = (lastRouteDist == null) ? "n/a" : `${lastRouteDist.toFixed(1)}m`;
    const routeSegStr = (lastRouteSegmentIndex == null) ? "n/a" : `${lastRouteSegmentIndex}`;
    const zoneInfo = lastZoneDebug || "none";

    dbg.textContent =
`SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | ERR: ${error}

--- TRANSFORM ---
SET:   ${tr}
COMP:  ${computed}

--- LAYOUT ---
offset: ${ow}x${oh}
BOX:    ${boxRaw}

--- STYLE ---
VIS: ${vis}
willChange: ${wc}
origin: ${to}
position: ${pos}
top/left: ${top} / ${left}

--- STATE ---
CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}

--- MAP / ROUTE ---
bearing: ${Math.round(lastMapBearing)}°
corrected: ${isNaN(lastCorrectedAngle) ? "NaN" : Math.round(lastCorrectedAngle)}°
routeDist: ${routeDistStr} | seg: ${routeSegStr}

--- ZONE ---
${zoneInfo}

--- PNG ---
arrow=${arrowPngStatus}, icons=${iconsPngStatus}
`;
}


// ========================================================
// ============= DOM-СТРЕЛКА: ПОЗИЦИЯ И ПОВОРОТ ============
// ========================================================

function updateArrowPositionFromCoords(coords) {
    if (!map || !arrowEl || !coords) return;

    const lngLat = [coords[1], coords[0]];
    const p = map.project(lngLat);

    arrowEl.style.left = `${p.x}px`;
    arrowEl.style.top = `${p.y}px`;
}

function applyArrowTransform(angle) {
    if (!arrowEl) return;
    const a = isNaN(angle) ? 0 : angle;
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${a}deg)`;
    arrowEl.style.visibility = "visible";
    arrowEl.style.willChange = "transform";
}

function handleMapMove() {
    if (!lastCoords) return;
    updateArrowPositionFromCoords(lastCoords);

    const src = compassActive ? "compass" : "gps";
    const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
    debugUpdate(src, ang);
}


// ========================================================
// ===================== COMPASS LOGIC =====================
// ========================================================

function handleIOSCompass(e) {
    if (!compassActive) return;
    if (!map || !arrowEl) {
        debugUpdate("compass", NaN, "NO_MAP_OR_ARROW");
        return;
    }
    if (e.webkitCompassHeading == null) {
        debugUpdate("compass", NaN, "NO_HEADING");
        return;
    }

    // 1) Сырые данные от компаса (0° = север)
    const raw = normalizeAngle(e.webkitCompassHeading);

    // 2) Плавное сглаживание (S1)
    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
    compassUpdates++;

    // 3) Учитываем поворот карты
    lastMapBearing = (typeof map.getBearing === "function") ? map.getBearing() : 0;

    // стрелка должна показывать, куда смотрит телефон ОТНОСИТЕЛЬНО ЭКРАНА
    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);

    // 4) Применяем скорректированный угол к стрелке
    applyArrowTransform(lastCorrectedAngle);

    // 5) В отладку отдаём именно corrected
    debugUpdate("compass", lastCorrectedAngle);
}

function startCompass() {
    compassActive = true;

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {

        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === "granted") {
                    window.addEventListener("deviceorientation", handleIOSCompass);
                } else {
                    debugUpdate("compass", NaN, "PERMISSION_DENIED");
                }
            })
            .catch(() => {
                debugUpdate("compass", NaN, "PERMISSION_ERROR");
            });

        return;
    }

    debugUpdate("compass", NaN, "IOS_ONLY");
}// ========================================================
// ===================== MOVE MARKER =======================
// ========================================================

function moveMarker(coords) {
    // coords = [lat, lng]

    // --- ROTATE ARROW (GPS), если компас выключен ---
    if (!compassActive && lastCoords) {
        const angle = calculateAngle(lastCoords, coords);

        gpsAngleLast = Math.round(angle);
        gpsUpdates++;

        applyArrowTransform(angle);
        debugUpdate("gps", angle);
    }

    // --- UPDATE LAST COORDS ---
    lastCoords = coords;

    // --- ПОЗИЦИЯ СТРЕЛКИ (DOM) ---
    updateArrowPositionFromCoords(coords);

    // ========================================================
    // ========== УМНАЯ ПЕРЕКРАСКА МАРШРУТА ПО СЕГМЕНТАМ ======
    // ========================================================

    let bestIndex = null;
    let bestDist = Infinity;
    let bestProj = null;
    let bestT = 0;

    if (fullRoute.length >= 2) {
        for (let i = 0; i < fullRoute.length - 1; i++) {
            const a = fullRoute[i].coord;       // [lng, lat]
            const b = fullRoute[i + 1].coord;   // [lng, lat]

            const info = pointToSegmentInfo([coords[0], coords[1]], a, b);

            if (info.dist < bestDist) {
                bestDist = info.dist;
                bestIndex = i;
                bestProj = info.projLngLat; // [lng, lat]
                bestT = info.t;
            }
        }
    }

    lastRouteDist = bestDist;
    lastRouteSegmentIndex = bestIndex;

    // --- ОБНОВЛЯЕМ МАРШРУТ ТОЛЬКО ЕСЛИ В ХИТБОКСЕ ---
    if (bestIndex != null && bestDist <= ROUTE_HITBOX_METERS && bestProj) {

        const passedCoords = [];
        const remainingCoords = [];

        // все точки до сегмента — в пройденное
        for (let i = 0; i < bestIndex; i++) {
            passedCoords.push(fullRoute[i].coord);
        }

        const a = fullRoute[bestIndex].coord;
        const b = fullRoute[bestIndex + 1].coord;

        if (bestT <= 0) {
            // мы ещё "до" сегмента
            passedCoords.push(a);
            remainingCoords.push(a, b);
            for (let i = bestIndex + 2; i < fullRoute.length; i++) {
                remainingCoords.push(fullRoute[i].coord);
            }

        } else if (bestT >= 1) {
            // дошли до конца сегмента
            passedCoords.push(a, b);
            for (let i = bestIndex + 2; i < fullRoute.length; i++) {
                remainingCoords.push(fullRoute[i].coord);
            }

        } else {
            // вошли в середину сегмента — режем его
            const proj = bestProj; // [lng, lat]

            passedCoords.push(a, proj);

            remainingCoords.push(proj, b);
            for (let i = bestIndex + 2; i < fullRoute.length; i++) {
                remainingCoords.push(fullRoute[i].coord);
            }
        }

        // обновляем слои
        map.getSource("route-passed").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: passedCoords }
        });

        map.getSource("route-remaining").setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: remainingCoords }
        });
    }

    // ========================================================
    // ===================== FOLLOW CAMERA ====================
    // ========================================================

    if (simulationActive) {
        map.easeTo({
            center: [coords[1], coords[0]],
            duration: 500
        });
    }

    // ========================================================
    // ====================== AUDIO ZONES ======================
    // ========================================================

    checkZones(coords);

    // ========================================================
    // ===================== FINAL DEBUG ======================
    // ========================================================

    debugUpdate(
        compassActive ? "compass" : "gps",
        compassActive ? lastCorrectedAngle : gpsAngleLast
    );
}


// ========================================================
// ================== SIMULATION STEP ======================
// ========================================================

function simulateNextStep() {
    if (!simulationActive) return;
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;
        return;
    }

    const next = simulationPoints[simulationIndex];
    simulationIndex++;

    moveMarker(next);

    setTimeout(simulateNextStep, 1200);
}


// ========================================================
// ================== START SIMULATION =====================
// ========================================================

function startSimulation() {
    if (!simulationPoints.length) return;

    simulationActive = true;
    gpsActive = false;

    // компас не должен мешать симуляции
    compassActive = false;

    simulationIndex = 0;

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}// ========================================================
// ======================= INIT MAP ========================
// ========================================================

async function initMap() {
    const initialCenter = [49.082118, 55.826584];

    map = new maplibregl.Map({
        container: "map",
        style: "style.json",
        center: initialCenter,
        zoom: 18
    });

    // стрелку кладём внутрь контейнера карты
    const mapContainer = document.getElementById("map");
    if (mapContainer && getComputedStyle(mapContainer).position === "static") {
        mapContainer.style.position = "relative";
    }

    map.on("load", async () => {

        // ========================================================
        // ======================= LOAD DATA ======================
        // ========================================================

        const points = await fetch("points.json").then(r => r.json());
        const route = await fetch("route.json").then(r => r.json());

        // --- PREPARE FULL ROUTE ---
        fullRoute = route.geometry.coordinates.map(c => ({
            coord: [c[0], c[1]] // [lng, lat]
        }));

        // симуляция использует lat/lng
        simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);


        // ========================================================
        // ===================== ROUTE SOURCES ====================
        // ========================================================

        map.addSource("route-passed", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: { type: "LineString", coordinates: [] }
            }
        });

        map.addSource("route-remaining", {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: fullRoute.map(pt => pt.coord)
                }
            }
        });


        // ========================================================
        // ====================== ROUTE LAYERS =====================
        // ========================================================

        map.addLayer({
            id: "route-passed-line",
            type: "line",
            source: "route-passed",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#888888" }
        });

        map.addLayer({
            id: "route-remaining-line",
            type: "line",
            source: "route-remaining",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-color": "#007aff" }
        });


        // ========================================================
        // ====================== AUDIO ZONES ======================
        // ========================================================

        const circleFeatures = [];

        points.forEach(p => {
            zones.push({
                id: p.id,
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                radius: p.radius || 20,
                visited: false,
                entered: false,
                type: p.type,
                audio: p.type === "audio" ? `audio/${p.id}.mp3` : null
            });

            if (p.type === "audio") {
                circleFeatures.push({
                    type: "Feature",
                    properties: { id: p.id, visited: false },
                    geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                });
            }

            // --- PNG ICONS FOR SQUARE POINTS ---
            if (p.type === "square") {
                const el = document.createElement("div");
                el.style.width = "40px";
                el.style.height = "40px";
                el.style.display = "flex";
                el.style.alignItems = "center";
                el.style.justifyContent = "center";

                const img = document.createElement("img");
                img.src = `https://gospodeensobaka-afk.github.io/kazan-audioguide/icons/left.png`;
                img.style.width = "32px";
                img.style.height = "32px";

                img.onload = () => { iconsPngStatus = "ok"; };
                img.onerror = () => {
                    iconsPngStatus = "error";
                    debugUpdate("none", null, "PNG_LOAD_FAIL");
                };

                el.appendChild(img);

                new maplibregl.Marker({ element: el })
                    .setLngLat([p.lng, p.lat])
                    .addTo(map);
            }
        });

        // --- AUDIO CIRCLES SOURCE ---
        map.addSource("audio-circles", {
            type: "geojson",
            data: { type: "FeatureCollection", features: circleFeatures }
        });

        map.addLayer({
            id: "audio-circles-layer",
            type: "circle",
            source: "audio-circles",
            paint: {
                "circle-radius": 20,
                "circle-color": [
                    "case",
                    ["boolean", ["get", "visited"], false],
                    "rgba(0,255,0,0.25)",
                    "rgba(255,0,0,0.15)"
                ],
                "circle-stroke-color": [
                    "case",
                    ["boolean", ["get", "visited"], false],
                    "rgba(0,255,0,0.6)",
                    "rgba(255,0,0,0.4)"
                ],
                "circle-stroke-width": 2
            }
        });


        // ========================================================
        // ===================== DOM USER ARROW ===================
        // ========================================================

        arrowEl = document.createElement("img");
        arrowEl.src = "arrow.png";
        arrowEl.style.width = "40px";
        arrowEl.style.height = "40px";
        arrowEl.style.transformOrigin = "center center";
        arrowEl.style.visibility = "visible";
        arrowEl.style.willChange = "transform";
        arrowEl.style.position = "absolute";
        arrowEl.style.left = "50%";
        arrowEl.style.top = "50%";
        arrowEl.style.pointerEvents = "none";
        arrowEl.style.zIndex = "9999";

        applyArrowTransform(0);

        arrowEl.onload = () => { arrowPngStatus = "ok"; };
        arrowEl.onerror = () => {
            arrowPngStatus = "error";
            debugUpdate("none", null, "ARROW_PNG_FAIL");
        };

        if (mapContainer) {
            mapContainer.appendChild(arrowEl);
        } else {
            document.body.appendChild(arrowEl);
        }


        // ========================================================
        // ====================== GPS TRACKING ====================
        // ========================================================

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                pos => {
                    if (!gpsActive) return;
                    moveMarker([pos.coords.latitude, pos.coords.longitude]);
                },
                err => console.log("GPS error:", err),
                { enableHighAccuracy: true }
            );
        }


        // ========================================================
        // ===================== MAP MOVE UPDATE ==================
        // ========================================================

        map.on("move", handleMapMove);

        console.log("Карта готова");
    });


    // ========================================================
    // ========================= BUTTONS ======================
    // ========================================================

    const simBtn = document.getElementById("simulate");
    if (simBtn) simBtn.onclick = startSimulation;

    const audioBtn = document.getElementById("enableAudio");
    if (audioBtn) {
        audioBtn.onclick = () => {
            const a = new Audio("audio/1.mp3");
            a.play()
                .then(() => audioEnabled = true)
                .catch(() => console.log("Ошибка разрешения аудио"));
        };
    }

    const compassBtn = document.getElementById("enableCompass");
    if (compassBtn) compassBtn.onclick = startCompass;


    // ========================================================
    // ===================== INIT DEBUG PANEL =================
    // ========================================================

    ensureSuperDebug();
    debugUpdate("init", 0, "INIT");
}


// ========================================================
// ====================== DOM EVENTS =======================
// ========================================================

document.addEventListener("DOMContentLoaded", initMap);

// ==================== END DOM EVENTS ====================
