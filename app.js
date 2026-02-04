/* ============================================================
   === GLOBAL: VARIABLES ======================================
   ============================================================ */

document.getElementById("buildIndicator").textContent =
  "build: " + new Date().toLocaleTimeString();

/* --- Core State --- */
let tourStarted = false;
let map;
let currentPointImage = null;

/* --- Photo UI Elements --- */
const togglePhotoBtn = document.getElementById("togglePhotoBtn");
const photoOverlay = document.getElementById("photoOverlay");
const photoImage = document.getElementById("photoImage");

/* --- Arrow & Movement --- */
let arrowEl = null;
let lastCoords = null;

/* --- Zones & Route --- */
let zones = [];
let fullRoute = [];
let routeSegments = [];
let activeSegmentIndex = null;
let passedRoute = [];
let maxPassedIndex = 0;

/* --- Simulation --- */
let simulationActive = false;
let simulationPoints = [];
const jumpPoints = [
    [55.826681, 49.082236],
    [55.826597, 49.082102],
    [55.826698, 49.082098],
    [55.826934, 49.081875],
    [55.826830, 49.082332],
    [55.826659, 49.082523]
];
let simulationIndex = 0;

/* --- Audio --- */
let globalAudio = null;
let gpsActive = false;
let audioEnabled = false;
let audioPlaying = false;
let totalAudioZones = 0;
let visitedAudioZones = 0;

/* --- Compass --- */
let compassActive = false;
let userTouching = false;
let userInteracting = false;
let smoothAngle = 0;
let compassUpdates = 0;
let gpsAngleLast = null;
let gpsUpdates = 0;

/* --- Debug --- */
let arrowPngStatus = "init";
let iconsPngStatus = "init";
let lastMapBearing = 0;
let lastCorrectedAngle = 0;
let lastRouteDist = null;
let lastRouteSegmentIndex = null;
let lastZoneDebug = "";

/* --- Constants --- */
const ROUTE_HITBOX_METERS = 6;

/* --- Gallery Storage --- */
let lastZoneMedia = []; // сюда складываются фото/видео для галереи
/* ============================================================
   === UTILS: DISTANCE / ANGLES / PROJECTION ==================
   ============================================================ */

/* --- Distance between two lat/lng points (meters) --- */
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

/* --- Angle between two GPS points (bearing) --- */
function calculateAngle(prev, curr) {
    const dx = curr[1] - prev[1];
    const dy = curr[0] - prev[0];
    return Math.atan2(dx, dy) * (180 / Math.PI);
}

/* --- Normalize angle to 0–360 --- */
function normalizeAngle(a) {
    return (a + 360) % 360;
}

/* --- Convert lat/lng to XY meters for projection --- */
function latLngToXY(lat, lng) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const x = R * lng * rad * Math.cos(lat * rad);
    const y = R * lat * rad;
    return { x, y };
}

/* --- Project point onto segment (for route coloring) --- */
function pointToSegmentInfo(pointLatLng, aLngLat, bLngLat) {
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

    const invRad = 180 / (Math.PI * 6371000);
    const projLat = projY * invRad;
    const projLng = projX * invRad / Math.cos(projLat * Math.PI / 180);

    return { dist, t, projLngLat: [projLng, projLat] };
}
/* ============================================================
   === AUDIO: PLAYBACK / TIMINGS ==============================
   ============================================================ */

/* --- Update progress counter --- */
function updateProgress() {
    const el = document.getElementById("tourProgress");
    if (!el) return;
    el.textContent = `Пройдено: ${visitedAudioZones} из ${totalAudioZones}`;
}

/* --- Play audio for a zone --- */
function playZoneAudio(src, id) {
    if (!audioEnabled) audioEnabled = true;

    globalAudio.src = src;
    globalAudio.currentTime = 0;

    // Привязываем тайминги ДО play()
    setupPhotoTimingsForAudio(globalAudio, id);

    globalAudio.play().catch(() => {});
    audioPlaying = true;

    globalAudio.onended = () => {
        audioPlaying = false;
    };
}

/* --- Photo timings for audio zones --- */
const photoTimings = {
    "audio/3.mp3": {
        3: "images/zone3_photo.jpg"
    },
    "audio/5.mp3": {
        3: "images/zone5_photo.jpg"
    }
};

/* --- Video timings for audio zones --- */
const videoTimings = {
    "audio/3.mp3": {
        3: "videos/zone3_video.mp4"
    }
};

/* --- Bind timed photo/video events to audio --- */
function setupPhotoTimingsForAudio(audio, zoneId) {
    const src = audio.src.split("/").pop();
    const key = "audio/" + src;

    const pTimings = photoTimings[key] || null;
    const vTimings = videoTimings[key] || null;

    if (!pTimings && !vTimings) return;

    const shownPhoto = {};
    const shownVideo = {};

    audio.ontimeupdate = () => {
        const t = Math.floor(audio.currentTime);

        if (pTimings && pTimings[t] && !shownPhoto[t]) {
            shownPhoto[t] = true;
            showTimedPhoto(pTimings[t]);
        }

        if (vTimings && vTimings[t] && !shownVideo[t]) {
            shownVideo[t] = true;
            showTimedVideo(vTimings[t]);
        }
    };
}

/* --- Update circle colors on map --- */
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

/* --- Check if user entered an audio zone --- */
function checkZones(coords) {
    zones.forEach(z => {
        if (z.type !== "audio") return;

        const dist = distance(coords, [z.lat, z.lng]);

        if (!z.visited && dist <= z.radius) {
            z.visited = true;

            visitedAudioZones++;
            updateProgress();
            updateCircleColors();

            if (z.audio) playZoneAudio(z.audio, z.id);
        }
    });
}
/* ============================================================
   === MEDIA: SHOW PHOTO / SHOW VIDEO =========================
   ============================================================ */

/* --- Show fullscreen photo --- */
function showTimedPhoto(src) {
    lastZoneMedia.push({ type: "photo", src });

    photoImage.src = src;
    photoOverlay.classList.remove("hidden");
    photoOverlay.style.display = "flex";
}

/* --- Show fullscreen video --- */
function showTimedVideo(src) {
    lastZoneMedia.push({ type: "video", src });

    const videoOverlay = document.getElementById("videoOverlay");
    const videoElement = document.getElementById("videoElement");

    videoElement.src = src;
    videoElement.currentTime = 0;
    videoElement.play().catch(() => {});

    videoOverlay.style.display = "flex";
}

/* --- Close photo overlay by clicking background --- */
photoOverlay.onclick = (e) => {
    if (e.target === photoOverlay) {
        photoOverlay.style.display = "none";
        photoOverlay.classList.add("hidden");
    }
};

/* --- Close photo overlay by ✕ button --- */
const closePhotoBtn = document.getElementById("closePhotoBtn");
if (closePhotoBtn) {
    closePhotoBtn.onclick = () => {
        photoOverlay.style.display = "none";
        photoOverlay.classList.add("hidden");
    };
}
/* ============================================================
   === MEDIA: GALLERY (G1 – horizontal bottom strip) ===========
   ============================================================ */

/* --- Create gallery overlay dynamically if missing --- */
let galleryOverlay = document.getElementById("galleryOverlay");

if (!galleryOverlay) {
    galleryOverlay = document.createElement("div");
    galleryOverlay.id = "galleryOverlay";
    galleryOverlay.style.position = "fixed";
    galleryOverlay.style.bottom = "20px";
    galleryOverlay.style.left = "50%";
    galleryOverlay.style.transform = "translateX(-50%)";
    galleryOverlay.style.width = "320px";
    galleryOverlay.style.background = "rgba(0,0,0,0.75)";
    galleryOverlay.style.backdropFilter = "blur(10px)";
    galleryOverlay.style.borderRadius = "18px";
    galleryOverlay.style.padding = "12px";
    galleryOverlay.style.display = "none";
    galleryOverlay.style.flexDirection = "row";
    galleryOverlay.style.gap = "10px";
    galleryOverlay.style.zIndex = "1000000";
    galleryOverlay.style.overflowX = "auto";
    galleryOverlay.style.whiteSpace = "nowrap";
    galleryOverlay.style.maxHeight = "120px";

    document.body.appendChild(galleryOverlay);
}

/* --- Add media thumbnail to gallery --- */
function addMediaToGallery(item) {
    const thumb = document.createElement("img");
    thumb.src = item.src;
    thumb.style.width = "80px";
    thumb.style.height = "80px";
    thumb.style.objectFit = "cover";
    thumb.style.borderRadius = "10px";
    thumb.style.cursor = "pointer";

    thumb.onclick = () => {
        if (item.type === "photo") {
            showTimedPhoto(item.src);
        } else if (item.type === "video") {
            showTimedVideo(item.src);
        }
    };

    galleryOverlay.appendChild(thumb);
}

/* --- Sync gallery with lastZoneMedia --- */
function refreshGallery() {
    galleryOverlay.innerHTML = "";
    lastZoneMedia.forEach(addMediaToGallery);
}

/* --- Button: “Не успеваю” --- */
const notReadyBtn = document.getElementById("notReadyBtn");

if (notReadyBtn) {
    notReadyBtn.onclick = () => {
        refreshGallery();
        galleryOverlay.style.display = "flex";
    };
}

/* --- Close gallery by clicking outside (optional) --- */
document.addEventListener("click", (e) => {
    if (!galleryOverlay.contains(e.target) &&
        e.target !== notReadyBtn &&
        galleryOverlay.style.display === "flex") {
        galleryOverlay.style.display = "none";
    }
});
/* ============================================================
   === ROUTE: COLORING / ZONES / PHOTO POINTS =================
   ============================================================ */

function moveMarker(coords) {
    if (!tourStarted) return;

    const prevCoords = lastCoords;
    lastCoords = coords;

    updateArrowPositionFromCoords(coords);

    /* --- GPS rotation (if compass is off) --- */
    if (!compassActive && prevCoords) {
        const angle = calculateAngle(prevCoords, coords);
        gpsAngleLast = Math.round(angle);
        gpsUpdates++;

        applyArrowTransform(angle);

        if (!userTouching) {
            map.easeTo({
                bearing: angle,
                duration: 300
            });
        }
    }

    /* --- Find nearest route segment --- */
    let nearestIndex = null;
    let nearestDist = Infinity;
    let nearestProj = null;

    for (let i = 0; i < fullRoute.length - 1; i++) {
        const a = fullRoute[i].coord;
        const b = fullRoute[i + 1].coord;

        const info = pointToSegmentInfo([coords[0], coords[1]], a, b);

        if (info.dist < nearestDist) {
            nearestDist = info.dist;
            nearestIndex = i;
            nearestProj = info.projLngLat;
        }
    }

    /* --- If too far from route — stop coloring --- */
    if (nearestDist > 12) return;

    const passedCoords = [];
    const remainingCoords = [];

    /* --- 1) Fully passed segments --- */
    for (let i = 0; i < nearestIndex; i++) {
        passedCoords.push(fullRoute[i].coord);
        passedCoords.push(fullRoute[i + 1].coord);
    }

    /* --- 2) Current segment: partial coloring --- */
    const segA = fullRoute[nearestIndex].coord;
    const segB = fullRoute[nearestIndex + 1].coord;

    passedCoords.push(segA);
    passedCoords.push(nearestProj);

    remainingCoords.push(nearestProj);
    remainingCoords.push(segB);

    /* --- 3) Remaining segments --- */
    for (let i = nearestIndex + 1; i < fullRoute.length - 1; i++) {
        remainingCoords.push(fullRoute[i].coord);
        remainingCoords.push(fullRoute[i + 1].coord);
    }

    /* --- Update map sources --- */
    map.getSource("route-passed").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: passedCoords }
    });

    map.getSource("route-remaining").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: remainingCoords }
    });

    /* --- Audio zones --- */
    checkZones(coords);

    /* --- Photo points (square zones) --- */
    zones.forEach(z => {
        if (z.type !== "square" || !z.image) return;

        const dist = distance(coords, [z.lat, z.lng]);

        if (!z.entered && dist <= 30) {
            z.entered = true;
            currentPointImage = z.image;

            togglePhotoBtn.style.display = "block";
            togglePhotoBtn.classList.add("photo-btn-glow");

            photoImage.src = z.image;
        }

        if (z.entered && dist > 30) {
            z.entered = false;

            togglePhotoBtn.style.display = "none";
            togglePhotoBtn.classList.remove("photo-btn-glow");
        }
    });

    /* --- Debug arrow state --- */
    const src = compassActive ? "compass" : "gps";
    const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
    debugUpdate(src, ang);
}
/* ============================================================
   === SIMULATION: STEP / START ===============================
   ============================================================ */

/* --- One simulation step --- */
function simulateNextStep() {
    if (!simulationActive) return;

    // Если дошли до конца маршрута — стоп
    if (simulationIndex >= simulationPoints.length) {
        simulationActive = false;
        gpsActive = true;
        return;
    }

    const next = simulationPoints[simulationIndex];

    // 1) Двигаемся по маршруту
    moveMarker(next);

    // 2) Прыжок в сторону (если есть)
    if (simulationIndex < jumpPoints.length) {
        const jp = jumpPoints[simulationIndex];

        console.log("SIMULATION: SIDE JUMP", jp);

        setTimeout(() => {
            moveMarker(jp);

            // Возврат на маршрут через 1.2 сек
            setTimeout(() => {
                simulationIndex++;
                simulateNextStep();
            }, 1200);

        }, 800);

        return;
    }

    // 3) Обычная симуляция
    simulationIndex++;
    setTimeout(simulateNextStep, 1200);
}

/* --- Start simulation --- */
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
}
/* ============================================================
   === COMPASS: IOS / ROTATION ================================
   ============================================================ */

/* --- Handle iOS compass events --- */
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

    // Smooth angle
    smoothAngle = normalizeAngle(0.8 * smoothAngle + 0.2 * raw);
    compassUpdates++;

    lastMapBearing =
        (typeof map.getBearing === "function") ? map.getBearing() : 0;

    lastCorrectedAngle = normalizeAngle(smoothAngle - lastMapBearing);

    applyArrowTransform(lastCorrectedAngle);

    if (!userTouching) {
        map.easeTo({
            bearing: smoothAngle,
            duration: 300
        });
    }

    debugUpdate("compass", lastCorrectedAngle);
}

/* --- Start compass mode (iOS only) --- */
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
}
/* ============================================================
   === ARROW: POSITION / TRANSFORM / MAP MOVE =================
   ============================================================ */

/* --- Update arrow position on map --- */
function updateArrowPositionFromCoords(coords) {
    if (!arrowEl) return;

    const p = map.project([coords[1], coords[0]]);
    arrowEl.style.left = p.x + "px";
    arrowEl.style.top = p.y + "px";
}

/* --- Apply rotation to arrow element --- */
function applyArrowTransform(angle) {
    if (!arrowEl) return;
    arrowEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
}

/* --- Debug panel update --- */
function debugUpdate(src, angle, note = "") {
    const el = document.getElementById("buildIndicator");
    if (!el) return;

    el.textContent =
        `src=${src} | angle=${Math.round(angle)} | gpsUpd=${gpsUpdates} | compUpd=${compassUpdates} ${note}`;
}

/* --- Map move event: keep arrow in correct place --- */
function onMapMove() {
    if (!lastCoords) return;
    updateArrowPositionFromCoords(lastCoords);
}
/* ============================================================
   === MAP: INIT / LAYERS / SOURCES (APP3 RESTORED) ===========
   ============================================================ */
function initMap() {
    map = new maplibregl.Map({
        container: "map",
        style: "./style.json",   // ← ВОТ ЭТО — ТВОЙ ОРИГИНАЛЬНЫЙ СТИЛЬ
        center: [49.106414, 55.796289],
        zoom: 15,
        pitch: 45,
        bearing: 0,
        attributionControl: false
    });

    map.on("load", () => {

        // --- Arrow (как в app3 — SVG) ---
        arrowEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        arrowEl.setAttribute("viewBox", "0 0 100 100");
        arrowEl.style.position = "absolute";
        arrowEl.style.width = "42px";
        arrowEl.style.height = "42px";
        arrowEl.style.transform = "translate(-50%, -50%)";
        arrowEl.style.zIndex = 999999;

        const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowPath.setAttribute("d", "M50 0 L100 100 L0 100 Z");
        arrowPath.setAttribute("fill", "#007aff");

        arrowEl.appendChild(arrowPath);
        document.body.appendChild(arrowEl);
    });
}

        /* --- Route sources --- */
        map.addSource("route-passed", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } }
        });

        map.addSource("route-remaining", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } }
        });

        /* --- Route layers --- */
        map.addLayer({
            id: "route-passed",
            type: "line",
            source: "route-passed",
            paint: {
                "line-color": "#00ff00",
                "line-width": 6
            }
        });

        map.addLayer({
            id: "route-remaining",
            type: "line",
            source: "route-remaining",
            paint: {
                "line-color": "#ffffff",
                "line-width": 6
            }
        });

        /* --- Audio circles --- */
        map.addSource("audio-circles", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] }
        });

        map.addLayer({
            id: "audio-circles",
            type: "circle",
            source: "audio-circles",
            paint: {
                "circle-radius": 18,
                "circle-color": [
                    "case",
                    ["==", ["get", "visited"], true],
                    "#00ff00",
                    "#ff0000"
                ],
                "circle-opacity": 0.45
            }
        });

        /* --- Photo squares --- */
        map.addSource("photo-squares", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] }
        });

        map.addLayer({
            id: "photo-squares",
            type: "circle",
            source: "photo-squares",
            paint: {
                "circle-radius": 10,
                "circle-color": "#007aff",
                "circle-opacity": 0.9
            }
        });

        /* --- Keep arrow in place on map move --- */
        map.on("move", onMapMove);

        /* --- Buttons --- */
        document.getElementById("startTourBtn").onclick = startTour;
        document.getElementById("enableAudio").onclick = () => {
            audioEnabled = true;
            globalAudio = document.getElementById("globalAudio");
        };
        document.getElementById("enableCompass").onclick = startCompass;
        document.getElementById("simulate").onclick = startSimulation;
    });
}
/* ============================================================
   === MAP: START TOUR / LOAD ROUTE / LOAD ZONES ==============
   ============================================================ */

/* --- Load route (array of [lat, lng]) --- */
function loadRoute(routeArray) {
    fullRoute = routeArray.map(coord => ({
        coord: [coord[1], coord[0]] // [lng, lat]
    }));

    // Инициализация remaining маршрута
    map.getSource("route-remaining").setData({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: fullRoute.map(p => p.coord)
        }
    });
}

/* --- Load zones (audio + photo) --- */
function loadZones(zonesArray) {
    zones = zonesArray;

    const audioFeatures = [];
    const photoFeatures = [];

    zones.forEach(z => {
        if (z.type === "audio") {
            audioFeatures.push({
                type: "Feature",
                properties: { id: z.id, visited: false },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            });
        }

        if (z.type === "square") {
            photoFeatures.push({
                type: "Feature",
                properties: { id: z.id },
                geometry: { type: "Point", coordinates: [z.lng, z.lat] }
            });
        }
    });

    totalAudioZones = audioFeatures.length;

    map.getSource("audio-circles").setData({
        type: "FeatureCollection",
        features: audioFeatures
    });

    map.getSource("photo-squares").setData({
        type: "FeatureCollection",
        features: photoFeatures
    });

    updateProgress();
}

/* --- Start the tour --- */
function startTour() {
    if (tourStarted) return;
    tourStarted = true;

    document.getElementById("startTourBtn").style.display = "none";

    globalAudio = document.getElementById("globalAudio");

    gpsActive = true;

    // Начальная позиция — первая точка маршрута
    if (fullRoute.length > 0) {
        const first = fullRoute[0].coord;
        lastCoords = [first[1], first[0]];

        map.easeTo({
            center: first,
            zoom: 16,
            duration: 800
        });

        updateArrowPositionFromCoords([first[1], first[0]]);
    }

    // Запуск GPS-трекинга
    startGPS();
}

/* --- GPS tracking --- */
function startGPS() {
    if (!navigator.geolocation) {
        console.log("GPS not supported");
        return;
    }

    navigator.geolocation.watchPosition(
        pos => {
            if (!gpsActive) return;

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            moveMarker([lat, lng]);
        },
        err => {
            console.log("GPS error:", err);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
}
/* ============================================================
   === UI: PHOTO BUTTON / VIDEO OVERLAY =======================
   ============================================================ */

/* --- Photo button: show fullscreen photo --- */
togglePhotoBtn.onclick = () => {
    if (!currentPointImage) return;

    photoImage.src = currentPointImage;
    photoOverlay.style.display = "flex";
    photoOverlay.classList.remove("hidden");
};

/* --- Close photo overlay by clicking background --- */
photoOverlay.onclick = (e) => {
    if (e.target === photoOverlay) {
        photoOverlay.style.display = "none";
        photoOverlay.classList.add("hidden");
    }
};

/* --- Close photo overlay by ✕ button --- */
if (closePhotoBtn) {
    closePhotoBtn.onclick = () => {
        photoOverlay.style.display = "none";
        photoOverlay.classList.add("hidden");
    };
}

/* --- Create video overlay dynamically if missing --- */
let videoOverlay = document.getElementById("videoOverlay");
let videoElement = document.getElementById("videoElement");

if (!videoOverlay) {
    videoOverlay = document.createElement("div");
    videoOverlay.id = "videoOverlay";
    videoOverlay.style.position = "fixed";
    videoOverlay.style.top = "0";
    videoOverlay.style.left = "0";
    videoOverlay.style.width = "100%";
    videoOverlay.style.height = "100%";
    videoOverlay.style.background = "rgba(0,0,0,0.85)";
    videoOverlay.style.display = "none";
    videoOverlay.style.alignItems = "center";
    videoOverlay.style.justifyContent = "center";
    videoOverlay.style.zIndex = "1000001";

    videoElement = document.createElement("video");
    videoElement.id = "videoElement";
    videoElement.controls = true;
    videoElement.style.maxWidth = "90%";
    videoElement.style.maxHeight = "90%";
    videoElement.style.borderRadius = "12px";

    videoOverlay.appendChild(videoElement);
    document.body.appendChild(videoOverlay);
}

/* --- Close video overlay by clicking background --- */
videoOverlay.onclick = (e) => {
    if (e.target === videoOverlay) {
        videoOverlay.style.display = "none";
        videoElement.pause();
    }
};
/* ============================================================
   === END: INIT MAP ==========================================
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    initMap();
});




