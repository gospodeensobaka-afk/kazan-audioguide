               /* ========================================================
                  =============== GLOBAL VARIABLES & STATE ===============
                  ======================================================== */
               document.getElementById("buildIndicator").textContent =
                 "build: " + new Date().toLocaleTimeString();
               // TOUR START FLAG
               let tourStarted = false;
               let map;
               let currentPointImage = null;
               
               const togglePhotoBtn = document.getElementById("togglePhotoBtn");
               const photoOverlay = document.getElementById("photoOverlay");
               const photoImage = document.getElementById("photoImage");
               const closePhotoBtn = document.getElementById("closePhotoBtn");
               
               let arrowEl = null;
               let lastCoords = null;
               let zones = [];
               
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
               let globalAudio = null;
               let gpsActive = false; // включится после старта
               let audioEnabled = false;
               let audioPlaying = false;
               let totalAudioZones = 0;
               let visitedAudioZones = 0;
               let fullRoute = [];
               let routeSegments = []; // массив слоёв маршрута
               let activeSegmentIndex = null; // какой слой сейчас активен
               let passedRoute = [];
               let maxPassedIndex = 0;
               let compassActive = false;
               let userTouching = false;
               let userInteracting = false;
               let smoothAngle = 0;
               let compassUpdates = 0;
               
               let gpsAngleLast = null;
               let gpsUpdates = 0;
               
               let arrowPngStatus = "init";
               let iconsPngStatus = "init";
               
               let lastMapBearing = 0;
               let lastCorrectedAngle = 0;
               let lastRouteDist = null;
               let lastRouteSegmentIndex = null;
               let lastZoneDebug = "";
               
               const ROUTE_HITBOX_METERS = 6;
               
               /* ========================================================
                  ===================== UTILITIES ========================
                  ======================================================== */
               
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
               function updateProgress() {
                   const el = document.getElementById("tourProgress");
                   if (!el) return;
                   el.textContent = `Пройдено: ${visitedAudioZones} из ${totalAudioZones}`;
               }
               /* ========================================================
                  ===================== AUDIO ZONES =======================
                  ======================================================== */
               
            function playZoneAudio(src, id) {
              currentZoneId = id;
lastZoneMedia = [];
    if (!audioEnabled) audioEnabled = true;

    globalAudio.src = src;
    globalAudio.currentTime = 0;

    // Привязываем тайминги ВСЕГДА
    setupPhotoTimingsForAudio(globalAudio, id);

    globalAudio.play().catch(() => {});

    audioPlaying = true;
    globalAudio.onended = () => audioPlaying = false;
}
               function setupPhotoTimingsForAudio(audio, zoneId) {
    console.log("SETUP TIMINGS CALLED, zoneId =", zoneId, "src =", audio.src);

    const src = audio.src.split("/").pop();
    const key = "audio/" + src;
    console.log("PHOTO KEY =", key, "TIMINGS =", photoTimings[key]);

    const timings = photoTimings[key];
    if (!timings) return;

    let shown = {};

    audio.ontimeupdate = () => {
        const t = Math.floor(audio.currentTime);
        console.log("AUDIO TIME", t);

        if (timings[t] && !shown[t]) {
            shown[t] = true;
            console.log("SHOW TIMED PHOTO", timings[t]);
            showTimedPhoto(timings[t]);
        }
    };
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
                   zones.forEach(z => {
                       if (z.type !== "audio") return;
               
                       const dist = distance(coords, [z.lat, z.lng]);
               
                       // СТАРАЯ НАДЁЖНАЯ ЛОГИКА: один раз при входе
                      if (!z.visited && dist <= z.radius) {
    z.visited = true;

    lastZoneMedia = []; /* === PATCH_RESET_MEDIA_SIMULATION === */
    currentZoneId = z.id; /* ← правильный id зоны */

    if (z.type === "audio") {
        visitedAudioZones++;
        updateProgress();
    }

    updateCircleColors();
    if (z.audio) playZoneAudio(z.audio, z.id);
}
                   });
               }
               
               /* ========================================================
                  ===================== SUPER DEBUG =======================
                  ======================================================== */
               
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
                     dbg.style.pointerEvents = "none"; /* === PATCH_DEBUG_POINTER_EVENTS === */
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
                   try { computed = window.getComputedStyle(arrowEl).transform; }
                   catch (e) { computed = "error"; }
               
                   const ow = arrowEl.offsetWidth;
                   const oh = arrowEl.offsetHeight;
               
                   const rect = arrowEl.getBoundingClientRect();
                   const boxRaw =
                       `x:${rect.x.toFixed(1)}, y:${rect.y.toFixed(1)}, ` +
                       `w:${rect.width.toFixed(1)}, h:${rect.height.toFixed(1)}`;
               
                   const routeDistStr =
                       (lastRouteDist == null) ? "n/a" : `${lastRouteDist.toFixed(1)}m`;
                   const routeSegStr =
                       (lastRouteSegmentIndex == null) ? "n/a" : `${lastRouteSegmentIndex}`;
               
                   const zoneInfo = lastZoneDebug || "none";
               
                   dbg.textContent =
               `SRC: ${source} | ANG: ${isNaN(angle) ? "NaN" : Math.round(angle)}° | ERR: ${error}
               
               --- TRANSFORM ---
               SET:   ${tr}
               COMP:  ${computed}
               
               --- LAYOUT ---
               offset: ${ow}x${oh}
               BOX:    ${boxRaw}
               
               --- STATE ---
               CMP: ${compassActive ? "active" : "inactive"} | H: ${Math.round(smoothAngle)}° | UPD: ${compassUpdates}
               GPS: ${gpsActive ? "on" : "off"} | GPS_ANG: ${gpsAngleLast} | GPS_UPD: ${gpsUpdates}
               
               --- MAP / ROUTE ---
               routeDist: ${routeDistStr} | seg: ${routeSegStr}
               
               --- ZONE ---
               ${zoneInfo}
               
               --- PNG ---
               arrow=${arrowPngStatus}, icons=${iconsPngStatus}
               `;
               }/* ========================================================
                  ===================== COMPASS LOGIC =====================
                  ======================================================== */
               
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
               
               /* ========================================================
                  ============= DOM-СТРЕЛКА: ПОЗИЦИЯ И ПОВОРОТ ============
                  ======================================================== */
               
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
               /* ========================================================
                  ========== SIMULATE AUDIO ZONE (MANUAL TRIGGER) =========
                  ======================================================== */
               function simulateAudioZone(id) {
    const z = zones.find(z => z.id === id && z.type === "audio");
    if (!z) return;

    // Разрешаем повторный запуск в симуляции
    z.visited = false;

    z.visited = true;
    visitedAudioZones++;
    updateProgress();
    updateCircleColors();

    if (z.audio) {
        if (!audioEnabled) audioEnabled = true;

        // Полный сброс аудио, чтобы браузер считал это новым запуском
        globalAudio.pause();
        globalAudio.removeAttribute("src");
        globalAudio.load();
document.body.addEventListener("click", () => {
    globalAudio.play().catch(() => {});
}, { once: true });
        globalAudio.src = z.audio;
        globalAudio.currentTime = 0;

        // Сбрасываем старый таймер
        globalAudio.ontimeupdate = null;

        // ВАЖНО: тайминги ДО play()
        setupPhotoTimingsForAudio(globalAudio, id);

        // Запуск аудио
        globalAudio.play().catch(() => {});

        audioPlaying = true;
        globalAudio.onended = () => audioPlaying = false;
    }

    console.log("Simulated audio zone:", id);
}
              /* ========================================================
   ========== PHOTO TIMINGS FOR AUDIO ZONES ================
   ======================================================== */

const photoTimings = {
    "audio/3.mp3": {
        3: "images/zone3_photo.jpg"
    },
    "audio/5.mp3": {
        3: "images/zone5_photo.jpg"
    }
};

const videoTimings = {
    // Зона id3: на 3‑й секунде показываем превью видео
    "audio/3.mp3": {
        3: "videos/zone3_video.mp4"
    }
};

/* === START TIMED_MEDIA === */

let lastZoneMedia = [];
let currentZoneId = null;

const autoCloseTimings = {
    5: 2000
};

function showTimedPhoto(src) {
    lastZoneMedia.push({ type: "photo", src });

    photoImage.src = src;
    photoOverlay.classList.remove("hidden");

    const timeout = autoCloseTimings[currentZoneId];
    if (timeout) {
        setTimeout(() => {
            photoOverlay.classList.add("hidden");
        }, timeout);
    }
}

function showTimedVideo(src) {
    lastZoneMedia.push({ type: "video", src });

    const videoOverlay = document.getElementById("videoOverlay");
    const videoElement = document.getElementById("videoElement");
/* === PATCH_VIDEO_POINTER_EVENTS === */
const closeVideoBtn = document.getElementById("closeVideoBtn");
videoOverlay.style.pointerEvents = "auto";
if (closeVideoBtn) {
    closeVideoBtn.style.pointerEvents = "auto";
    closeVideoBtn.onclick = () => {
        videoElement.pause();
        videoOverlay.style.display = "none";
    };
}
    videoElement.src = src;
    videoElement.currentTime = 0;
    videoElement.play().catch(() => {});
    videoOverlay.style.display = "flex";

    const timeout = autoCloseTimings[currentZoneId];
    if (timeout) {
        setTimeout(() => {
            videoElement.pause();
            videoOverlay.style.display = "none";
        }, timeout);
    }
}

/* === END TIMED_MEDIA === */
/* === START GALLERY_LOGIC === */

/* === START PATCH_NOT_READY_TOGGLE === */
document.getElementById("notReadyBtn").onclick = () => {
    const gallery = document.getElementById("galleryOverlay");

    // если открыта — закрываем
    if (gallery.style.display === "flex") {
        gallery.style.display = "none";
        return;
    }

    // иначе — открываем и заполняем
    gallery.innerHTML = "";

    lastZoneMedia.forEach(item => {
        const thumb = document.createElement("div");
        thumb.style.width = "80px";
        thumb.style.height = "80px";
        thumb.style.borderRadius = "12px";
        thumb.style.overflow = "hidden";
        thumb.style.background = "#000";
        thumb.style.display = "flex";
        thumb.style.alignItems = "center";
        thumb.style.justifyContent = "center";
        thumb.style.cursor = "pointer";

        if (item.type === "photo") {
            const img = document.createElement("img");
            img.src = item.src;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            thumb.appendChild(img);

            thumb.onclick = () => {
                photoImage.src = item.src;
                photoOverlay.classList.remove("hidden");
            };
        }

        if (item.type === "video") {
            const icon = document.createElement("div");
            icon.style.width = "0";
            icon.style.height = "0";
            icon.style.borderLeft = "20px solid white";
            icon.style.borderTop = "12px solid transparent";
            icon.style.borderBottom = "12px solid transparent";
            thumb.appendChild(icon);

            thumb.onclick = () => {
                const videoOverlay = document.getElementById("videoOverlay");
                const videoElement = document.getElementById("videoElement");

                videoElement.src = item.src;
                videoElement.currentTime = 0;
                videoElement.play().catch(() => {});
                videoOverlay.style.display = "flex";
            };
        }

        gallery.appendChild(thumb);
    });

    gallery.style.display = "flex";

    // закрытие по клику на тёмный фон
    gallery.onclick = (e) => {
        if (e.target === gallery) {
            gallery.style.display = "none";
        }
    };
};
/* === END PATCH_NOT_READY_TOGGLE === */

/* === END GALLERY_LOGIC === */
function setupPhotoTimingsForAudio(audio, zoneId) {
    const src = audio.src.split("/").pop(); // например "3.mp3"
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
               /* ========================================================
                  ===================== MOVE MARKER =======================
                  ======================================================== */
               
               function moveMarker(coords) {
                   // TOUR NOT STARTED → IGNORE ALL MOVEMENT
                   if (!tourStarted) return;
               
                   const prevCoords = lastCoords;
                   lastCoords = coords;
               
                   updateArrowPositionFromCoords(coords);
               
                   /* ========================================================
                      =============== GPS ROTATION + MAP ROTATION ============
                      ======================================================== */
               
                   if (!compassActive && prevCoords) {
                       const angle = calculateAngle(prevCoords, coords);
                       gpsAngleLast = Math.round(angle);
                       gpsUpdates++;
               
                       // Поворот стрелки
                       applyArrowTransform(angle);
               
                       // Поворот карты — только если пользователь не трогает экран
                       if (!userTouching) {
                           map.easeTo({
                               bearing: angle,
                               duration: 300
                           });
                       }
                   }
               /* ========================================================
                  ========== ЧАСТИЧНАЯ ПЕРЕКРАСКА КАК В СТАРОЙ ВЕРСИИ =====
                  ======================================================== */
               
               // ищем ближайший сегмент
               let nearestIndex = null;
               let nearestDist = Infinity;
               let nearestProj = null;
               let nearestT = 0;
               
               for (let i = 0; i < fullRoute.length - 1; i++) {
                   const a = fullRoute[i].coord;
                   const b = fullRoute[i + 1].coord;
               
                   const info = pointToSegmentInfo([coords[0], coords[1]], a, b);
               
                   if (info.dist < nearestDist) {
                       nearestDist = info.dist;
                       nearestIndex = i;
                       nearestProj = info.projLngLat;
                       nearestT = info.t;
                   }
               }
               
               // если далеко от маршрута — не красим
               if (nearestDist > 12) return;
               
               const passedCoords = [];
               const remainingCoords = [];
               
               // 1) все сегменты ДО текущего — полностью пройденные
               for (let i = 0; i < nearestIndex; i++) {
                   passedCoords.push(fullRoute[i].coord);
                   passedCoords.push(fullRoute[i + 1].coord);
               }
               
               // 2) текущий сегмент — частичная перекраска
               const segA = fullRoute[nearestIndex].coord;
               const segB = fullRoute[nearestIndex + 1].coord;
               
               // пройденная часть: A → proj
               passedCoords.push(segA);
               passedCoords.push(nearestProj);
               
               // оставшаяся часть: proj → B
               remainingCoords.push(nearestProj);
               remainingCoords.push(segB);
               
               // 3) все сегменты ПОСЛЕ текущего — полностью оставшиеся
               for (let i = nearestIndex + 1; i < fullRoute.length - 1; i++) {
                   remainingCoords.push(fullRoute[i].coord);
                   remainingCoords.push(fullRoute[i + 1].coord);
               }
               
                   // === UPDATE SOURCES ===
                   map.getSource("route-passed").setData({
                       type: "Feature",
                       geometry: { type: "LineString", coordinates: passedCoords }
                   });
               
                   map.getSource("route-remaining").setData({
                       type: "Feature",
                       geometry: { type: "LineString", coordinates: remainingCoords }
                   });
               
                   // === ZONES ===
                   checkZones(coords);
                   const src = compassActive ? "compass" : "gps";
                   const ang = compassActive ? lastCorrectedAngle : gpsAngleLast;
                   debugUpdate(src, ang);
               }
               
               /* ========================================================
                  ================== SIMULATION STEP ======================
                  ======================================================== */
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
               
                   // 2) После каждой точки — прыжок в сторону
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
               
                   // 3) Если прыжков больше нет — обычная симуляция
                   simulationIndex++;
                   setTimeout(simulateNextStep, 1200);
               }
               
               /* ========================================================
                  ================== START SIMULATION =====================
                  ======================================================== */
               
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
               }/* ========================================================
                  ======================= INIT MAP ========================
                  ======================================================== */
               
               async function initMap() {
                   const initialCenter = [49.082118, 55.826584];
               
                   map = new maplibregl.Map({
                       container: "map",
                       style: "style.json?v=2",
                       center: initialCenter,
                       zoom: 18
                   });
               
                   const mapContainer = document.getElementById("map");
                   if (mapContainer && getComputedStyle(mapContainer).position === "static") {
                       mapContainer.style.position = "relative";
                   }
               
                   map.on("load", async () => {
                     globalAudio = document.getElementById("globalAudio");
                     globalAudio.muted = false;
globalAudio.autoplay = true;
                     globalAudio.load();
                      map.getCanvas().addEventListener("pointerdown", () => {
                   userTouching = true;
               });
               
               map.getCanvas().addEventListener("pointerup", () => {
                   userTouching = false;
               });
               
               map.getCanvas().addEventListener("pointercancel", () => {
                   userTouching = false;
               });
                      map.on("movestart", () => userInteracting = true);
               map.on("moveend", () => userInteracting = false);
               // FIX_REMOVE_HACK_LINE — полностью удалить старые слои маршрута
               ["route", "route-line", "route-hack-line"].forEach(id => {
                   if (map.getLayer(id)) {
                       map.removeLayer(id);
                   }
                   if (map.getSource(id)) {
                       map.removeSource(id);
                   }
               });
               
               // ВЫЗЫВАЕМ ПОСЛЕ удаления слоёв, но ДО загрузки данных
               updateProgress();
               
               /* ========================================================
                  ======================= LOAD DATA =======================
                  ======================================================== */
               
                       const points = await fetch("points.json").then(r => r.json());
                       const route = await fetch("route.json").then(r => r.json());
               
                       fullRoute = route.geometry.coordinates.map(c => ({
                           coord: [c[0], c[1]]
                       }));
               // создаём слои маршрута
               routeSegments = [];
               for (let i = 0; i < fullRoute.length - 1; i++) {
                   routeSegments.push({
                       start: fullRoute[i].coord,
                       end: fullRoute[i + 1].coord,
                       passed: false
                   });
               }
                       simulationPoints = route.geometry.coordinates.map(c => [c[1], c[0]]);
               
                       /* ========================================================
                          ===================== ROUTE SOURCES ====================
                          ======================================================== */
               
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
               
                       /* ========================================================
                          ====================== ROUTE LAYERS =====================
                          ======================================================== */
               
                       map.addLayer({
                           id: "route-remaining-line",
                           type: "line",
                           source: "route-remaining",
                           layout: { "line-join": "round", "line-cap": "round" },
                           paint: { "line-width": 4, "line-color": "#007aff" }
                       });
               
                       map.addLayer({
                           id: "route-passed-line",
                           type: "line",
                           source: "route-passed",
                           layout: { "line-join": "round", "line-cap": "round" },
                           paint: { "line-width": 4, "line-color": "#333333" }
                       });
                       /* ========================================================
                  ====================== AUDIO ZONES ======================
                  ======================================================== */
               
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
                       audio: p.type === "audio" ? `audio/${p.id}.mp3` : null,
                       image: p.image || null
                   });
               
                   if (p.type === "audio") totalAudioZones++;
               
                   if (p.type === "audio") {
                       circleFeatures.push({
                           type: "Feature",
                           properties: { id: p.id, visited: false },
                           geometry: { type: "Point", coordinates: [p.lng, p.lat] }
                       });
                   }
               
                   /* PNG markers */
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
               
               // ← ВАЖНО: обновляем прогресс ПОСЛЕ цикла
               updateProgress();
               
               /* ========================================================
                  ==================== AUDIO CIRCLES ======================
                  ======================================================== */
               
                       map.addSource("audio-circles", {
                           type: "geojson",
                           data: { type: "FeatureCollection", features: circleFeatures }
                       });
               
                       map.addLayer({
                           id: "audio-circles-layer",
                           type: "circle",
                           source: "audio-circles",
                           paint: {
                               "circle-radius": 0,
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
                      // === SIMULATE AUDIO ZONE ON CLICK ===
               map.on("click", "audio-circles-layer", (e) => {
                   const id = e.features[0].properties.id;
                   simulateAudioZone(id);
               });
               // FIX_PHYSICAL_AUDIO_RADIUS — визуальный радиус = физический радиус (метры → пиксели)
               function updateAudioCircleRadius() {
                   const zoom = map.getZoom();
                   const center = map.getCenter();
                   const lat = center.lat;
               
                   const metersPerPixel =
                       156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
               
                   zones.forEach(z => {
                       if (z.type === "audio") {
                           const radiusPixels = z.radius / metersPerPixel;
                           map.setPaintProperty("audio-circles-layer", "circle-radius", radiusPixels);
                       }
                   });
               }
               
               map.on("zoom", updateAudioCircleRadius);
               map.on("load", updateAudioCircleRadius);
                       /* ========================================================
                          ==================== PHOTO CIRCLES ======================
                          ======================================================== */
               
                       const photoCircleFeatures = zones
                           .filter(z => z.type === "square" && z.image)
                           .map(z => ({
                               type: "Feature",
                               properties: { id: z.id },
                               geometry: { type: "Point", coordinates: [z.lng, z.lat] }
                           }));
               
                       map.addSource("photo-circles", {
                           type: "geojson",
                           data: { type: "FeatureCollection", features: photoCircleFeatures }
                       });
               
                       map.addLayer({
                           id: "photo-circles-layer",
                           type: "circle",
                           source: "photo-circles",
                           paint: {
                               "circle-radius": 30,
                               "circle-color": "rgba(0,0,255,0.08)",
                               "circle-stroke-color": "rgba(0,0,255,0.3)",
                               "circle-stroke-width": 1
                           }
                       });
               
                       /* ========================================================
                          ===================== DOM USER ARROW ===================
                          ======================================================== */
               arrowEl = document.createElement("div");
               arrowEl.innerHTML = `
               <svg viewBox="0 0 100 100" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                 <polygon points="50,5 90,95 50,75 10,95" fill="currentColor"/>
               </svg>
               `;
               
               arrowEl.style.position = "absolute";
               arrowEl.style.left = "50%";
               arrowEl.style.top = "50%";
               arrowEl.style.transformOrigin = "center center";
               arrowEl.style.pointerEvents = "none";
               arrowEl.style.zIndex = "9999";
               arrowEl.style.color = "#00ff00"; // стартовый цвет
               
               applyArrowTransform();
               
               if (mapContainer) {
                   mapContainer.appendChild(arrowEl);
               } else {
                   document.body.appendChild(arrowEl);
               }
                       /* ========================================================
                          ====================== GPS TRACKING ====================
                          ======================================================== */
               
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
               
                       /* ========================================================
                          ===================== MAP MOVE UPDATE ==================
                          ======================================================== */
               
                       map.on("move", handleMapMove);
               
                       console.log("Карта готова");
                   });
               
                   /* ========================================================
                  ========================= BUTTONS ======================
                  ======================================================== */
               /* ========================================================
                  ===================== START TOUR BTN ====================
                  ======================================================== */
               
               /* START TOUR BTN */
               const startBtn = document.getElementById("startTourBtn");
               if (startBtn) {
                   startBtn.onclick = () => {
                       tourStarted = true;
                       gpsActive = true;
               
                       const intro = new Audio("audio/start.mp3");
                       intro.play().catch(() => console.log("Не удалось проиграть start.mp3"));
               
                       startBtn.style.display = "none";
                   };
               }
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
               
               // === PLACE PHOTO BUTTON RIGHT UNDER COMPASS BUTTON ===
               if (compassBtn && togglePhotoBtn) {
                   togglePhotoBtn.style.position = "absolute";
                   togglePhotoBtn.style.top = "160px";   // ниже компаса
                   togglePhotoBtn.style.left = "10px";
                   togglePhotoBtn.style.zIndex = "10";
                   togglePhotoBtn.style.display = "block";
                   togglePhotoBtn.style.width = "140px";
                   togglePhotoBtn.style.height = "32px";
               
                   togglePhotoBtn.textContent = "Фото";
                   togglePhotoBtn.style.fontSize = "13px";
                   togglePhotoBtn.style.whiteSpace = "nowrap";
                   togglePhotoBtn.style.overflow = "hidden";
                   togglePhotoBtn.style.textOverflow = "ellipsis";
               
                   compassBtn.insertAdjacentElement("afterend", togglePhotoBtn);
               }
                   /* ========================================================
                      ===================== INIT DEBUG PANEL =================
                      ======================================================== */
               
                   ensureSuperDebug();
                   debugUpdate("init", 0, "INIT");
               }
               
               /* ========================================================
                  ====================== DOM EVENTS =======================
                  ======================================================== */
               /* ========================================================
                  ========== TIMED PHOTO POPUP (SMALL → FULL) =============
                  ======================================================== */
               
               function showTimedPhoto(src) {
                   // маленькое превью
                   const preview = document.createElement("img");
                   preview.src = src;
                   preview.style.position = "absolute";
                   preview.style.bottom = "120px";
                   preview.style.left = "10px";
                   preview.style.width = "80px";
                   preview.style.height = "80px";
                   preview.style.borderRadius = "8px";
                   preview.style.boxShadow = "0 0 10px rgba(0,0,0,0.4)";
                   preview.style.zIndex = "99999";
                   preview.style.cursor = "pointer";
               
                   document.body.appendChild(preview);
               
                   preview.onclick = () => {
                       currentPointImage = src;
                       photoImage.src = src;
                       photoOverlay.classList.remove("hidden");
                   };
               
                   // исчезает через 10 секунд
                   setTimeout(() => {
                       preview.remove();
                   }, 10000);
               }
               togglePhotoBtn.onclick = () => {
                   if (!currentPointImage) return;
                   photoImage.src = currentPointImage;
                   photoOverlay.classList.remove("hidden");
               };
               
               closePhotoBtn.onclick = () => {
                   photoOverlay.classList.add("hidden");
               };
               
               photoOverlay.onclick = (e) => {
                   if (e.target === photoOverlay) {
                       photoOverlay.classList.add("hidden");
                   }
               };
               
               document.addEventListener("DOMContentLoaded", initMap);
               
               /* ==================== END OF APP.JS ====================== */




