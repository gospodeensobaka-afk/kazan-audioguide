// ========================================================
// =============== GLOBAL VARIABLES & STATE ===============
// ========================================================

let map;
let arrowEl = null;
let lastCoords = null;
let zones = [];

// SIMULATION
let simulationActive = false;
let simulationPoints = [];
let simulationIndex = 0;

// GPS & AUDIO
let gpsActive = true;
let audioEnabled = false;
let audioPlaying = false;

// ROUTE
let fullRoute = [];            // полный маршрут (всегда синий)
let passedRoute = [];          // пройденные сегменты (серый)

// COMPASS
let compassActive = false;
let smoothAngle = 0;
let compassUpdates = 0;

// GPS DEBUG
let gpsAngleLast = null;
let gpsUpdates = 0;

// PNG STATUS
let arrowPngStatus = "init";
let iconsPngStatus = "init";

// DEBUG
let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let lastRouteDist = null;
let lastRouteSegmentIndex = null;
let lastZoneDebug = "";

// CONSTANTS
const ROUTE_HITBOX_METERS = 6;


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

function latLngToXY(lat, lng) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const x = R * lng * rad * Math.cos(lat * rad);
    const y = R * lat * rad;
    return { x, y };
}

function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
    const p = latLngToXY(pointLatLng[0], pointLatLng[1]);
    const a = latLngToXY(aLngLat[1], aLngLat[0]);
    const b = latLngToXY(bLngLat[1], bLngLat[0]);

    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;

    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return { dist: Math.sqrt(wx * wx + wy * wy), t: 0 };

    let t = (wx * vx + wy * vy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * vx;
    const projY = a.y + t * vy;

    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return { dist, t };
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

function checkZones(coords) {
    let closestZone = null;
    let closestDist = Infinity;

    zones.forEach(z => {
        if (z.type !== "audio") return;

        const dist = distance(coords, [z.lat, z.lng]);

        if (dist < closestDist) {
            closestDist = dist;
            closestZone = {
                id: z.id,
                dist,
                visited: z.visited,
                entered: z.entered
            };
        }

        // Вход в круг = вход в зону
        if (!z.entered && dist <= z.radius) {
            z.entered = true;
        }

        // После входа → зелёный + аудио
        if (z.entered && !z.visited) {
            z.visited = true;
            updateCircleColors();
            if (z.audio) playZoneAudio(z.audio);
        }
    });

    if (closestZone) {
        lastZoneDebug =
            `id: ${closestZone.id} | dist: ${closestZone.dist.toFixed(1)}m` +
            ` | entered: ${closestZone.entered} | visited: ${closestZone.visited}`;
    } else {
        lastZoneDebug = "";
    }
}


// ========================================================
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

    const rect = arrowEl.getBoundingClientRect();
    const boxRaw =
        `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, ` +
        `w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;

    const routeDistStr = (lastRouteDist == null)
        ? "n/a"
        : `${lastRouteDist.toFixed(1)}m`;

    const routeSegStr = (lastRouteSegmentIndex == null)
        ? "n/a"
        : `${lastRouteSegmentIndex}`;

    dbg.textContent =
`SRC: ${source} | ANG: ${Math.round(angle)}° | ERR: ${error}

--- TRANSFORM ---
SET:   ${tr}
COMP:  ${computed}

--- LAYOUT ---
BOX:    ${boxRaw}

--- STATE ---
CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}

--- MAP / ROUTE ---
routeDist: ${routeDistStr} | seg: ${routeSegStr}

--- ZONE ---
${lastZoneDebug}

--- PNG ---
arrow=${arrowPngStatus}, icons=${iconsPngStatus}
`;
}// ========================================================
// ============= DOM-СТРЕЛКА: ПОЗИЦИЯ И ПОВОРОТ ============
// ========================================================

function updateArrowPositionFromCoords(coords) {
    if (!map || !arrowEl || !coords) return;

    const p = map.project([coords[1], coords[0]]);
    arrowEl.style.left = `${p.x}px`;
    arrowEl.style.top = `${p.y}px`;
}

function applyArrowTransform(angle) {
    if (!arrowEl) return;
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
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

    const raw = normalizeAngle(e.webkitCompassHeading);

    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
    compassUpdates++;

    lastMapBearing = map.getBearing ? map.getBearing() : 0;
    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);

    applyArrowTransform(lastCorrectedAngle);
    debugUpdate("compass", lastCorrectedAngle);
}

function startCompass() {
    compassActive = true;

    // iOS 13+ permission
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

    // Android / Desktop fallback
    debugUpdate("compass", NaN, "IOS_ONLY");
}// ========================================================
// ===================== MOVE MARKER =======================
// ========================================================

function moveMarker(coords) {
    // coords = [lat, lng]

    const prevCoords = lastCoords;
    lastCoords = coords;

    // --- Обновляем позицию стрелки ---
    updateArrowPositionFromCoords(coords);

    // --- Поворот стрелки по GPS, если компас выключен ---
    if (!compassActive && prevCoords) {
        const angle = calculateAngle(prevCoords, coords);
        gpsAngleLast = Math.round(angle);
        gpsUpdates++;
        applyArrowTransform(angle);
    }

    // ========================================================
    // ========== ПЕРЕКРАСКА МАРШРУТА (СТАРАЯ ХОРОШАЯ) =========
    // ========================================================
    //
    // ВАЖНО:
    // - НИКАКИХ ПРОЕКЦИЙ
    // - НИКАКИХ ПРОМЕЖУТОЧНЫХ ТОЧЕК
    // - НИКАКИХ "ЛИНИЙ ОТ СТРЕЛКИ"
    //
    // Логика:
    // 1) Находим ближайший сегмент
    // 2) Если в хитбоксе — считаем, что этот сегмент пройден
    // 3) Серый маршрут = все точки ДО текущего сегмента
    // 4) Синий маршрут = весь маршрут

    let bestIndex = null;
    let bestDist = Infinity;

    if (fullRoute.length >= 2) {
        for (let i = 0; i < fullRoute.length - 1; i++) {
            const a = fullRoute[i].coord;
            const b = fullRoute[i + 1].coord;

            const info = pointToSegmentInfo(
                [coords[0], coords[1]],
                a,
                b
            );

            if (info.dist < bestDist) {
                bestDist = info.dist;
                bestIndex = i;
            }
        }
    }

    lastRouteDist = bestDist;
    lastRouteSegmentIndex = bestIndex;

    // --- Перекрашиваем только если реально в хитбоксе ---
    if (bestIndex != null && bestDist <= ROUTE_HITBOX_METERS) {

        const passedCoords = [];
        const remainingCoords = [];

        // Синий маршрут — всегда полный
        for (let i = 0; i < fullRoute.length; i++) {
            remainingCoords.push(fullRoute[i].coord);
        }

        // Серый маршрут — только узлы ДО текущего сегмента
        for (let i = 0; i <= bestIndex; i++) {
            passedCoords.push(fullRoute[i].coord);
        }

        // Обновляем слои
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

    const src = compassActive ? "compass" : "gps";
    const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
    debugUpdate(src, ang);
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
    compassActive = false;

    simulationIndex = 0;

    moveMarker(simulationPoints[0]);

    map.easeTo({
        center: [simulationPoints[0][1], simulationPoints[0][0]],
        duration: 500
    });

    setTimeout(simulateNextStep, 1200);
}        // ========================================================
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
