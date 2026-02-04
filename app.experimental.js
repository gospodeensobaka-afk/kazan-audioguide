//// EXPERIMENTAL: PROOF OF LIFE

console.log("EXPERIMENTAL: loaded successfully");

// Покажем баннер через 2 секунды после загрузки
setTimeout(() => {
    const banner = document.createElement("div");
    banner.innerText = "EXPERIMENTAL WORKS!";
    banner.style.position = "fixed";
    banner.style.top = "20px";
    banner.style.left = "50%";
    banner.style.transform = "translateX(-50%)";
    banner.style.padding = "12px 20px";
    banner.style.background = "rgba(0,0,0,0.8)";
    banner.style.color = "white";
    banner.style.fontSize = "20px";
    banner.style.borderRadius = "12px";
    banner.style.zIndex = "999999";
    banner.style.backdropFilter = "blur(6px)";
    document.body.appendChild(banner);

    setTimeout(() => banner.remove(), 3000);
}, 2000);
