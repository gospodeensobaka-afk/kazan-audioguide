/* ============================================================
   EXPERIMENTAL MODULE: Extended Photo Timings + Media Queue
   ============================================================ */

/* 1) Расширяем тайминги для audio/5.mp3 */
(function extendPhotoTimings() {
    if (!window.photoTimings) return;

    const key = "audio/5.mp3";

    if (!photoTimings[key]) {
        photoTimings[key] = {};
    }

    // Добавляем новые фото
    photoTimings[key][4] = "photos/5.jpg";
    photoTimings[key][5] = "photos/6.jpg";
    photoTimings[key][6] = "photos/7.jpg";

    console.log("[EXPERIMENT] Extended photo timings for zone 5");
})();

/* ============================================================
   2) Очередь медиа, чтобы фото не перебивали друг друга
   ============================================================ */

let mediaQueue = [];
let mediaIsShowing = false;

function experimentalShowMedia(src, type) {
    mediaQueue.push({ src, type });
    processMediaQueue();
}

function processMediaQueue() {
    if (mediaIsShowing) return;
    if (mediaQueue.length === 0) return;

    const { src, type } = mediaQueue.shift();
    mediaIsShowing = true;

    // вызываем оригинальную функцию
    window.showFullscreenMedia(src, type);

    // ждём закрытия
    const overlay = document.getElementById("fsMediaOverlay");
    const closeBtn = document.getElementById("fsMediaClose");

    const finish = () => {
        mediaIsShowing = false;
        processMediaQueue();
    };

    closeBtn.addEventListener("click", finish, { once: true });
    overlay.addEventListener("click", finish, { once: true });
}

/* ============================================================
   3) Оборачиваем setupPhotoTimingsForAudio
   ============================================================ */

(function wrapSetupPhotoTimings() {
    const original = window.setupPhotoTimingsForAudio;

    window.setupPhotoTimingsForAudio = function (audio, zoneId) {
        original(audio, zoneId);

        const src = audio.src.split("/").pop();
        const key = "audio/" + src;
        const timings = photoTimings[key];

        if (!timings) return;

        const shown = {};

        audio.ontimeupdate = () => {
            const t = Math.floor(audio.currentTime);

            if (timings[t] && !shown[t]) {
                shown[t] = true;
                experimentalShowMedia(timings[t], "photo");
            }
        };

        console.log("[EXPERIMENT] Timings wrapped for", key);
    };
})();
