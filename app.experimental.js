//// EXPERIMENTAL: OVERRIDE GALLERY WITH SAFE FALLBACK

// Сохраняем оригинальную функцию из core
const original_showTimedPhoto = window.showTimedPhoto;

// Переопределяем showTimedPhoto
window.showTimedPhoto = function(src) {
    try {
        return experimental_showTimedPhoto(src); // пробуем новую версию
    } catch (e) {
        console.warn("Experimental gallery failed, fallback to core:", e);
        return original_showTimedPhoto(src); // fallback на стабильную
    }
};

// Новая экспериментальная галерея
function experimental_showTimedPhoto(src) {
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
    win.style.animation = "expFadeIn 0.25s ease";

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
