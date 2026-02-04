//// EXPERIMENTAL: SAFE OVERRIDE FOR GALLERY

console.log("Experimental module loaded");

// Проверяем, существует ли функция showPhotoOverlay в ядре
if (typeof window.showPhotoOverlay !== "function") {
    console.warn("Experimental: showPhotoOverlay not found in core — override skipped");
} else {

    // Сохраняем оригинальную функцию
    const original_showPhotoOverlay = window.showPhotoOverlay;

    // Переопределяем
    window.showPhotoOverlay = function(src) {
        console.log("Experimental: override triggered with src =", src);

        try {
            return experimental_showPhotoOverlay(src); // пробуем новую версию
        } catch (e) {
            console.error("Experimental gallery failed:", e);
            console.log("Experimental: fallback → core version");
            return original_showPhotoOverlay(src); // fallback
        }
    };
}


// Новая экспериментальная галерея
function experimental_showPhotoOverlay(src) {
    console.log("Experimental: running experimental_showPhotoOverlay");

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
    const img = document.createElement("img");
    img.src = src;
    img.style.width = "100%";
    img.style.borderRadius = "12px";
    win.appendChild(img);

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
