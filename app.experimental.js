/* ============================================================
   ========== EXPERIMENT: MEDIA MENU FOR ZONE ID6 ==============
   ============================================================ */

(function() {

    // Ждём, пока карта и точки будут готовы
    const wait = setInterval(() => {
        if (!window.map || !window.zones) return;
        clearInterval(wait);
        initMediaMenuExperiment();
    }, 300);

    function initMediaMenuExperiment() {
        console.log("EXP: media menu for zone 6 enabled");

        // Ищем зону id6
        const zone6 = zones.find(z => z.id === 6 && z.type === "media");
        if (!zone6) {
            console.warn("EXP: zone 6 not found");
            return;
        }

        // Переопределяем стандартный клик по маркеру
        overrideMediaMarkerClick(zone6);

        // Создаём action-sheet
        createMediaMenuOverlay();
    }

    /* ============================================================
       ========== ПЕРЕХВАТ КЛИКА ПО МАРКЕРУ ID6 ===================
       ============================================================ */

    function overrideMediaMarkerClick(zone) {
        // Находим маркер по координатам
        const allMarkers = document.querySelectorAll("img[src='" + zone.icon + "']");
        if (!allMarkers.length) {
            console.warn("EXP: marker for zone 6 not found");
            return;
        }

        const markerEl = allMarkers[0];
        markerEl.onclick = () => openMediaMenu(zone);
    }

    /* ============================================================
       ========== ACTION SHEET (ВЫЕЗЖАЮЩЕЕ МЕНЮ) ==================
       ============================================================ */

    let menuOverlay = null;

    function createMediaMenuOverlay() {
        menuOverlay = document.createElement("div");
        menuOverlay.id = "mediaMenuOverlay";
        menuOverlay.style.position = "fixed";
        menuOverlay.style.left = "0";
        menuOverlay.style.top = "0";
        menuOverlay.style.width = "100%";
        menuOverlay.style.height = "100%";
        menuOverlay.style.background = "rgba(0,0,0,0.4)";
        menuOverlay.style.display = "none";
        menuOverlay.style.zIndex = "200000";
        menuOverlay.style.alignItems = "flex-end";
        menuOverlay.style.justifyContent = "center";

        // Контейнер снизу
        const sheet = document.createElement("div");
        sheet.id = "mediaMenuSheet";
        sheet.style.width = "100%";
        sheet.style.background = "#fff";
        sheet.style.borderTopLeftRadius = "16px";
        sheet.style.borderTopRightRadius = "16px";
        sheet.style.padding = "20px";
        sheet.style.boxSizing = "border-box";
        sheet.style.transform = "translateY(100%)";
        sheet.style.transition = "transform 0.25s ease-out";

        // Аннотация
        const title = document.createElement("div");
        title.textContent = "Сувенирный магазин, чак‑чак стоит 300р";
        title.style.fontSize = "18px";
        title.style.marginBottom = "16px";
        sheet.appendChild(title);

        // Кнопка видео
        const videoBtn = document.createElement("button");
        videoBtn.textContent = "Видео";
        videoBtn.style.width = "100%";
        videoBtn.style.padding = "14px";
        videoBtn.style.fontSize = "16px";
        videoBtn.style.marginBottom = "10px";
        videoBtn.style.borderRadius = "10px";
        videoBtn.style.border = "none";
        videoBtn.style.background = "#007aff";
        videoBtn.style.color = "#fff";
        videoBtn.onclick = () => {
            closeMenu();
            showFullscreenMedia("videos/10.MP4", "video");
        };
        sheet.appendChild(videoBtn);

        // Кнопка фото
        const photoBtn = document.createElement("button");
        photoBtn.textContent = "Фото";
        photoBtn.style.width = "100%";
        photoBtn.style.padding = "14px";
        photoBtn.style.fontSize = "16px";
        photoBtn.style.borderRadius = "10px";
        photoBtn.style.border = "none";
        photoBtn.style.background = "#34c759";
        photoBtn.style.color = "#fff";
        photoBtn.onclick = () => {
            showPhotoPreview();
        };
        sheet.appendChild(photoBtn);

        // Контейнер превью
        const preview = document.createElement("div");
        preview.id = "mediaPhotoPreview";
        preview.style.display = "none";
        preview.style.marginTop = "16px";
        preview.style.display = "flex";
        preview.style.gap = "10px";
        preview.style.justifyContent = "center";
        sheet.appendChild(preview);

        menuOverlay.appendChild(sheet);
        document.body.appendChild(menuOverlay);

        // Закрытие по клику вне
        menuOverlay.onclick = e => {
            if (e.target === menuOverlay) closeMenu();
        };
    }

    /* ============================================================
       ========== ОТКРЫТЬ МЕНЮ ====================================
       ============================================================ */

    function openMediaMenu(zone) {
        menuOverlay.style.display = "flex";

        const sheet = document.getElementById("mediaMenuSheet");
        sheet.style.transform = "translateY(0)";
    }

    /* ============================================================
       ========== ЗАКРЫТЬ МЕНЮ ====================================
       ============================================================ */

    function closeMenu() {
        const sheet = document.getElementById("mediaMenuSheet");
        sheet.style.transform = "translateY(100%)";

        setTimeout(() => {
            menuOverlay.style.display = "none";
            hidePhotoPreview();
        }, 250);
    }

    /* ============================================================
       ========== ПРЕВЬЮ ФОТО =====================================
       ============================================================ */

    const photoList = [
        "photos/p6.jpg",
        "photos/p7.jpg",
        "photos/p8.jpg"
    ];

    function showPhotoPreview() {
        const preview = document.getElementById("mediaPhotoPreview");
        preview.innerHTML = "";
        preview.style.display = "flex";

        photoList.forEach(src => {
            const box = document.createElement("div");
            box.style.width = "80px";
            box.style.height = "80px";
            box.style.borderRadius = "10px";
            box.style.overflow = "hidden";
            box.style.cursor = "pointer";
            box.style.background = "#000";

            const img = document.createElement("img");
            img.src = src;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";

            box.appendChild(img);
            box.onclick = () => {
                closeMenu();
                showFullscreenMedia(src, "photo");
            };

            preview.appendChild(box);
        });
    }

    function hidePhotoPreview() {
        const preview = document.getElementById("mediaPhotoPreview");
        preview.style.display = "none";
    }

})();
