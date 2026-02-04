//// EXPERIMENTAL: DOM-HOOK GALLERY OVERRIDE

console.log("Experimental module loaded");

// Ждём загрузки DOM
document.addEventListener("DOMContentLoaded", () => {
    console.log("Experimental: DOMContentLoaded fired");

    const overlay = document.getElementById("photoOverlay");
    const img = document.getElementById("photoImage");

    console.log("Experimental: overlay =", overlay);
    console.log("Experimental: overlay.classList =", overlay?.classList);

    if (!overlay || !img) {
        console.warn("Experimental: photoOverlay or photoImage not found — override skipped");
        return;
    }

    console.log("Experimental: installing observer on overlay");

    // MutationObserver — следим за изменением класса overlay
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === "class") {
                console.log("Experimental: overlay class changed →", overlay.className);

                const isVisible = !overlay.classList.contains("hidden");

                if (isVisible) {
                    console.log("Experimental: gallery triggered via DOM");

                    try {
                        // Пробуем экспериментальную галерею
                        experimentalGallery(img.src);

                        // Прячем стандартную галерею
                        overlay.classList.add("hidden");
                    } catch (e) {
                        console.error("Experimental gallery failed:", e);
                        console.log("Experimental: fallback → core gallery");
                        // Ничего не делаем → core галерея останется видимой
                    }
                }
            }
        }
    });

    observer.observe(overlay, { attributes: true });
});


// === НОВАЯ ЭКСПЕРИМЕНТАЛЬНАЯ ГАЛЕРЕЯ ===
function experimentalGallery(src) {
    console.log("Experimental: running experimentalGallery");

    // Удаляем старое окно, если оно было
    const old = document.getElementById("expGalleryWindow");
    if (old) old.remove();

    // Создаём новое окно
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

    // Фото
    const imgEl = document.createElement("img");
    imgEl.src = src;
    imgEl.style.width = "100%";
    imgEl.style.borderRadius = "12px";
    win.appendChild(imgEl);

    // Кнопка закрытия
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
