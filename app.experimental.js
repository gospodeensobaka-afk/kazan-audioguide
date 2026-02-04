//// EXPERIMENTAL: UNIVERSAL PHOTO INTERCEPTOR

console.log("Experimental module loaded");

document.addEventListener("DOMContentLoaded", () => {
    console.log("Experimental: universal photo hook active");

    // Перехватываем установку src у всех изображений
    const originalSetAttribute = Element.prototype.setAttribute;

    Element.prototype.setAttribute = function(name, value) {
        try {
            if (name === "src" && this.id === "photoImage") {
                console.log("Experimental: intercepted photo src =", value);

                // Показываем экспериментальную галерею
                experimentalGallery(value);

                // Блокируем стандартную галерею
                const overlay = document.getElementById("photoOverlay");
                if (overlay) overlay.classList.add("hidden");

                return; // НЕ вызываем оригинальный setAttribute → core не покажет фото
            }
        } catch (e) {
            console.error("Experimental interceptor failed:", e);
        }

        // fallback → стандартное поведение
        return originalSetAttribute.apply(this, arguments);
    };
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
