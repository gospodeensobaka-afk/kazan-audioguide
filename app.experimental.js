/* ============================================================
   EXPERIMENT: extra photos for zone 5 (id:5)
   ============================================================ */

window.addEventListener("load", () => {
    if (!window.photoTimings) {
        console.warn("[EXPERIMENT] photoTimings still not found after load()");
        return;
    }

    const key = "audio/5.mp3";

    if (!photoTimings[key]) {
        photoTimings[key] = {};
    }

    photoTimings[key][4] = "photos/5.jpg";
    photoTimings[key][5] = "photos/6.jpg";
    photoTimings[key][6] = "photos/7.jpg";

    console.log("[EXPERIMENT] extra photos added for", key, photoTimings[key]);
});
