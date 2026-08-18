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
  const fullscreenBtnIcon = document.getElementById("btn-fullscreen-icon");
  const fullscreenBtn = document.getElementById("btn-fullscreen");
  if (document.fullscreenElement == null) {
    openFullscreen();
    fullscreenBtnIcon.src = "images/icons/fullscreen-exit.svg";
    fullscreenBtn.classList.add("active");
  } else {
    exitFullscreen();
    fullscreenBtnIcon.src = "images/icons/fullscreen.svg";
    fullscreenBtn.classList.remove("active");
  }
}

function toggleDark() {
  const darkBtn = document.getElementById("btn-dark");
  document.body.classList.toggle("dark");
  darkBtn.classList.toggle("active");
  ["path3259", "path3237", "path3247", "path3253"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("dark");
  });
  const darkBtnIcon = document.getElementById("btn-dark-icon");
  if (document.body.classList.contains("dark")) {
    darkBtnIcon.src = "images/icons/sun.svg";
  } else {
    darkBtnIcon.src = "images/icons/moon.svg";
  }
}
