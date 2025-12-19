// ======================================================
// 1. ПРОСТОЙ ТЕСТ КАРТЫ (БЕЗ СТРЕЛКИ, ЗОН И Т.Д.)
// ======================================================

// Глобальные переменные
let map = null;

// ======================================================
// 2. УТИЛИТЫ ДЛЯ ЛОГОВ (ЧТОБЫ НЕ ПАДАЛИ ВЫЗОВЫ log/setStatus)
// ======================================================

function log(t) {
    const el = document.getElementById("debug");
    if (el) {
        el.textContent += t + "\n";
        el.scrollTop = el.scrollHeight;
    }
}

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) el.textContent = t;
}

// ======================================================
// 3. ИНИЦИАЛИЗАЦИЯ КАРТЫ (МИНИМАЛЬНЫЙ ВАРИАНТ)
// ======================================================

function initMap() {
    const initialCenter = [55.826584, 49.082118];

    // Создаём карту
    map = new ymaps.Map("map", {
        center: initialCenter,
        zoom: 15,
        controls: []
    });

    // Добавляем ОДИН простой маркер для проверки
    const testMarker = new ymaps.Placemark(
        initialCenter,
        {
            hintContent: "Тестовый маркер",
            balloonContent: "Если ты это видишь — карта работает"
        },
        {
            preset: "islands#redIcon"
        }
    );

    map.geoObjects.add(testMarker);

    setStatus("Тестовая карта загружена");
    log("Тестовая карта загружена, маркер добавлен.");
}

// ======================================================
// 4. ЗАПУСК
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
    log("Яндекс.Карты загружаются (минимальный тест)");
    ymaps.ready(initMap);
});
