/* ============================================================
   EXPERIMENT: show test photos once to fill gallery
   ============================================================ */

function tryShowTestPhotos() {
    if (typeof window.showFullscreenMedia !== "function") {
        console.log("[EXPERIMENT] waiting for core...");
        return false;
    }

    // Показываем фото с задержкой, чтобы не наложились друг на друга
    setTimeout(() => showFullscreenMedia("photos/5.jpg", "photo"), 500);
    setTimeout(() => showFullscreenMedia("photos/6.jpg", "photo"), 1500);
    setTimeout(() => showFullscreenMedia("photos/7.jpg", "photo"), 2500);

    console.log("[EXPERIMENT] test photos shown");
    return true;
}

// Пытаемся каждые 100 мс, пока core не загрузится
const exp = setInterval(() => {
    if (tryShowTestPhotos()) {
        clearInterval(exp);
    }
}, 100);
