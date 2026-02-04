//// EXPERIMENTAL: SIMPLE POLLING GALLERY OVERRIDE

console.log("Experimental module loaded");

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("photoOverlay");
    const img = document.getElementById("photoImage");

    if (!overlay || !img) {
        console.warn("Experimental: overlay or img not found — skipped");
        return;
    }

    console.log("Experimental: polling hook active");

    // Проверяем каждые 120 мс — появился ли overlay
    setInterval(() => {
        const isVisible = !overlay.classList.contains("hidden");

        if (isVisible) {
            console.log("Experimental: overlay detected → running experimental gallery");

            try {
                experimentalGallery(img.src);
                overlay.classList.add("hidden"); // скрываем core-версию
            } catch (e) {
                console.error("Experimental gallery failed:", e);
                console.log("Experimental: fallback → core gallery");
            }
        }
    }, 120);
});


// === НОВАЯ ГАЛЕРЕЯ ===
function experimentalGallery(src) {
    console.log("Experimental: running experimentalGallery");

    const old = document.getElementById("expGalleryWindow");
    if (old) old.remove();

    const win = document.createElement("div");
    win.id = "expGalleryWindow";
    win.style.position = "fixed";
    win.style.bottom = "20px";
    win.style.left = "50%";
    win.style.transform = "translateX(-50%)";
    win.style.width = "80%";
    win.style.maxWidth = "380px";
    win.style.background = "rgba(0,0,0,0.75)";
    win.style.borderRadius = "18px";
    win.style.padding = "12px";
    win.style.zIndex = "999999";
    win.style.backdropFilter = "blur(6px)";
    win.style.display = "flex";
    win.style.flexDirection = "column";
    win.style.alignItems = "center";
    win.style.gap = "10px";

    const imgEl = document.createElement("img");
    imgEl.src = src;
    imgEl.style.width = "100%";
    imgEl.style.borderRadius = "12px";
    win.appendChild(imgEl);

    const close = document.createElement("button");
    close.innerText = "Закрыть";
    close.style.padding = "6px 12px";
    close.style.borderRadius = "8px";
    close.style.border = "none";
    close.style.background = "white";
    close.style.cursor = "pointer";
    close.onclick = () => win.remove();
    win.appendChild(close);

    document.body.appendChild(win);
}
