console.log("EXPERIMENT LOADED");

document.addEventListener("map-ready", () => {
    console.log("EXPERIMENT: map-ready received");

    // Ищем зону id6
    const zone6 = zones.find(z => z.id === 6 && z.type === "media");
    if (!zone6) {
        console.warn("EXP: zone 6 not found");
        return;
    }

    // Ищем маркер id6 через MapLibre
    const marker = map._markers.find(m => {
        const ll = m.getLngLat();
        return ll.lng === zone6.lng && ll.lat === zone6.lat;
    });

    if (!marker) {
        console.warn("EXP: marker for zone 6 not found");
        return;
    }

    const el = marker.getElement();

    // Удаляем старый клик
    el.replaceWith(el.cloneNode(true));
    const newEl = marker.getElement();

    // Новый клик
    newEl.addEventListener("click", () => {
        openMediaMenu();
    });

    console.log("EXP: menu override installed for zone 6");

    createMediaMenu();
});
