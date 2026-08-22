/* View in fullscreen */
function openFullscreen() {
  const htmlElement = document.documentElement;
  if (htmlElement.requestFullscreen) {
    htmlElement.requestFullscreen();
  } else if (htmlElement.webkitRequestFullscreen) {
    /* Safari */
    htmlElement.webkitRequestFullscreen();
  } else if (htmlElement.msRequestFullscreen) {
    /* IE11 */
    htmlElement.msRequestFullscreen();
  }
}

/* Close fullscreen */
function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    /* Safari */
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    /* IE11 */
    document.msExitFullscreen();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement == null && document.webkitFullscreenElement == null && document.msFullscreenElement == null) {
    openFullscreen();
  } else {
    exitFullscreen();
  }
}

function syncFullscreenUI() {
  const fullscreenBtnIcon = document.getElementById("btn-fullscreen-icon");
  const fullscreenBtn = document.getElementById("btn-fullscreen");
  if (!fullscreenBtn || !fullscreenBtnIcon) return;
  const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  if (isFS) {
    fullscreenBtnIcon.src = "images/icons/fullscreen-exit.svg";
    fullscreenBtn.classList.add("active");
  } else {
    fullscreenBtnIcon.src = "images/icons/fullscreen.svg";
    fullscreenBtn.classList.remove("active");
  }
}

document.addEventListener("fullscreenchange", syncFullscreenUI);
document.addEventListener("webkitfullscreenchange", syncFullscreenUI);
document.addEventListener("msfullscreenchange", syncFullscreenUI);

function applySavedDarkMode() {
  try {
    const isDark = localStorage.getItem("darkMode") === "true";
    if (isDark) {
      document.body.classList.add("dark");
      const darkBtn = document.getElementById("btn-dark");
      if (darkBtn) darkBtn.classList.add("active");
      ["path3259", "path3237", "path3247", "path3253"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add("dark");
      });
      const darkBtnIcon = document.getElementById("btn-dark-icon");
      if (darkBtnIcon) darkBtnIcon.src = "images/icons/sun.svg";
    }
  } catch (e) {}
}

function toggleDark() {
  const darkBtn = document.getElementById("btn-dark");
  document.body.classList.toggle("dark");
  if (darkBtn) darkBtn.classList.toggle("active");
  ["path3259", "path3237", "path3247", "path3253"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("dark");
  });
  const isDark = document.body.classList.contains("dark");
  try {
    localStorage.setItem("darkMode", isDark ? "true" : "false");
  } catch (e) {}
  const darkBtnIcon = document.getElementById("btn-dark-icon");
  if (darkBtnIcon) {
    if (isDark) {
      darkBtnIcon.src = "images/icons/sun.svg";
    } else {
      darkBtnIcon.src = "images/icons/moon.svg";
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applySavedDarkMode);
} else {
  applySavedDarkMode();
}
