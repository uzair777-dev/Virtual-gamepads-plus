(function() {
 'use strict';

 var socket = io();
 var connected = false;
 var padId = null;

// Theme cycling state
window.themeIndex = 0;
window.themes = ['light', 'dark', 'amoled'];

// Input event types
var EV_KEY = 0x01;
var EV_ABS = 0x03;

// Wheel axes (ABS) - NO ABS_RX (clutch)
var ABS_X = 0x00; // Steering
var ABS_Y = 0x01; // Throttle
var ABS_Z = 0x02; // Brake
var ABS_RY = 0x04; // Camera X (right stick)
var ABS_RZ = 0x05; // Camera Y (right stick)

// Wheel button codes
var BTN_TRIGGER = 0x120;
var BTN_THUMB = 0x121;
var BTN_TOP = 0x123;
var BTN_TOP2 = 0x124;
var BTN_BASE = 0x126;
var BTN_BASE2 = 0x127;
var BTN_BASE3 = 0x128;
var BTN_BASE4 = 0x129;
var BTN_BASE5 = 0x12a;
var BTN_BASE6 = 0x12b;

var currentPreset = null;
var cameraKnob = null;

// Wheel tracking
var wheelTrackingId = null;
var wheelElement = null;
var wheelStartX = 0;
var wheelStartAngle = 0;
var wheelCenterX = 0;
var wheelCenterY = 0;
var wheelRadius = 0;
var steeringRange = 180;
var leftyMode = false;

// Paddle tracking
var leftPaddleActive = false;
var rightPaddleActive = false;

function emit(type, code, value) {
 if (!connected || padId === null) return;
 socket.emit('wheelEvent', { padId: padId, type: type, code: code, value: value });
}

// --- Utility ---
function toSigned16(val) {
 if (val > 32767) return val - 65536;
 if (val < -32768) return val + 65536;
 return val;
}

// --- Wheel Steering ---
function initWheel() {
 wheelElement = document.getElementById('steering-wheel-knob');
 if (!wheelElement) return;

 var wrapper = wheelElement.parentElement;
 if (!wrapper) return;

 var updateWheelGeometry = function() {
 var rect = wrapper.getBoundingClientRect();
 wheelCenterX = rect.left + rect.width / 2;
 wheelCenterY = rect.top + rect.height / 2;
 wheelRadius = Math.min(rect.width, rect.height) / 2 * 0.85;
 };

 updateWheelGeometry();
 window.addEventListener('resize', updateWheelGeometry);
 window.addEventListener('orientationchange', updateWheelGeometry);

 var rotation = 0;
 var startRotation = 0;

 wheelElement.addEventListener('touchstart', function(e) {
 if (wheelTrackingId !== null) return;
 var t = e.changedTouches[0];
 wheelTrackingId = t.identifier;
 var rect = wrapper.getBoundingClientRect();
 var dx = t.clientX - rect.left - rect.width / 2;
 var dy = t.clientY - rect.top - rect.height / 2;
 wheelStartAngle = Math.atan2(dy, dx);
 wheelStartX = t.clientX;
 startRotation = rotation;
 e.preventDefault();
 }, { passive: false });

 document.addEventListener('touchmove', function(e) {
 if (wheelTrackingId === null) return;
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === wheelTrackingId) {
 var t = e.changedTouches[i];
 var rect = wrapper.getBoundingClientRect();
 var dx = t.clientX - rect.left - rect.width / 2;
 var dy = t.clientY - rect.top - rect.height / 2;
 var currentAngle = Math.atan2(dy, dx);
 var deltaAngle = currentAngle - wheelStartAngle;
 rotation = startRotation + deltaAngle;
 var clamped = Math.max(-steeringRange / 360 * 2 * Math.PI, Math.min(steeringRange / 360 * 2 * Math.PI, rotation));
 wheelElement.style.transform = 'rotate(' + (clamped * 180 / Math.PI) + 'deg)';
 var value = Math.round(clamped / (2 * Math.PI) * 65536);
 emit(EV_ABS, ABS_X, toSigned16(value));
 e.preventDefault();
 break;
 }
 }
 }, { passive: false });

 document.addEventListener('touchend', function(e) {
 for (var i=0; i<e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === wheelTrackingId) releaseWheel();
 }
 });

 document.addEventListener('touchcancel', function(e) {
 for (var i=0; i<e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === wheelTrackingId) releaseWheel();
 }
 });

 function releaseWheel() {
 if (wheelTrackingId !== null) {
 emit(EV_ABS, ABS_X, 0);
 wheelElement.style.transform = 'rotate(0deg)';
 rotation = 0;
 wheelTrackingId = null;
 }
 }
}

// --- Pedal Sliders ---
function initSlider(elementId) {
 var slider = document.getElementById(elementId);
 if (!slider) return;
 var axis = parseInt(slider.getAttribute('data-axis'), 16);
 var track = slider.querySelector('.slider-track');
 var fill = slider.querySelector('.slider-fill');
 var label = slider.querySelector('.slider-label');
 var startY = 0;
 var startHeight = 50;
 var isActive = false;
 var identifier = null;

 track.addEventListener('touchstart', function(e) {
 if (isActive) return;
 var t = e.changedTouches[0];
 isActive = true;
 identifier = t.identifier;
 startY = t.clientY;
 var rect = track.getBoundingClientRect();
 startHeight = Math.max(0, Math.min(100, ((rect.bottom - t.clientY) / rect.height) * 100));
 updateFill(startHeight);
 e.preventDefault();
 }, { passive: false });

 document.addEventListener('touchmove', function(e) {
 if (!isActive) return;
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 var t = e.changedTouches[i];
 var rect = track.getBoundingClientRect();
 var deltaY = startY - t.clientY;
 var newHeight = Math.max(0, Math.min(100, startHeight + (deltaY / rect.height) * 100));
 updateFill(newHeight);
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchend', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 updateFill(0);
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchcancel', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 updateFill(0);
 break;
 }
 }
 });

 function updateFill(height) {
 fill.style.height = height + '%';
 var value = Math.round(255 * (height / 100));
 emit(EV_ABS, axis, value);
 }
}

// --- Camera Joystick (Wheel Center Zone) ---
var camJoyActiveId = null;
var camJoyKnobEl = null;
var camJoyRadius = 0;
var camJoyCenterX = 0;
var camJoyCenterY = 0;

function initCameraJoystick() {
 var zone = document.getElementById('zone-wheel-center');
 if (!zone) return;

 // Create visual knob element
 camJoyKnobEl = document.createElement('div');
 camJoyKnobEl.className = 'camera-knob';
 zone.appendChild(camJoyKnobEl);

 // Calculate radius and center
 var updateGeometry = function() {
 var rect = zone.getBoundingClientRect();
 camJoyCenterX = rect.width / 2;
 camJoyCenterY = rect.height / 2;
 camJoyRadius = Math.min(rect.width, rect.height) / 2 * 0.75; // 75% of half-size
 };
 updateGeometry();
 window.addEventListener('resize', updateGeometry);
 window.addEventListener('orientationchange', updateGeometry);

 zone.addEventListener('touchstart', function(e) {
 if (camJoyActiveId !== null) return;
 var t = e.changedTouches[0];
 camJoyActiveId = t.identifier;
 camJoyKnobEl.classList.add('active');
 updateGeometry();
 var dx = t.clientX - zone.getBoundingClientRect().left - camJoyCenterX;
 var dy = t.clientY - zone.getBoundingClientRect().top - camJoyCenterY;
 updateKnobPosition(dx, dy);
 e.preventDefault();
 }, { passive: false });

 window.addEventListener('touchmove', function(e) {
 if (camJoyActiveId === null) return;
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === camJoyActiveId) {
 var rect = zone.getBoundingClientRect();
 var dx = e.changedTouches[i].clientX - rect.left - camJoyCenterX;
 var dy = e.changedTouches[i].clientY - rect.top - camJoyCenterY;
 updateKnobPosition(dx, dy);
 e.preventDefault();
 break;
 }
 }
 });

 window.addEventListener('touchend', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === camJoyActiveId) {
 camJoyActiveId = null;
 camJoyKnobEl.classList.remove('active');
 camJoyKnobEl.style.transform = 'translate(-50%, -50%)';
 emit(EV_ABS, ABS_RY, 0);
 emit(EV_ABS, ABS_RZ, 0);
 e.preventDefault();
 break;
 }
 }
 });

 window.addEventListener('touchcancel', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === camJoyActiveId) {
 camJoyActiveId = null;
 camJoyKnobEl.classList.remove('active');
 camJoyKnobEl.style.transform = 'translate(-50%, -50%)';
 emit(EV_ABS, ABS_RY, 0);
 emit(EV_ABS, ABS_RZ, 0);
 break;
 }
 }
 });

 function updateKnobPosition(dx, dy) {
 var distance = Math.sqrt(dx * dx + dy * dy);
 if (distance > camJoyRadius) {
 dx = (dx / distance) * camJoyRadius;
 dy = (dy / distance) * camJoyRadius;
 distance = camJoyRadius;
 }
 camJoyKnobEl.style.transform = 'translate(' + (dx - camJoyCenterX) + 'px, ' + (dy - camJoyCenterY) + 'px)';
 var xValue = Math.round((dx / camJoyRadius) * 32767);
 var yValue = Math.round((dy / camJoyRadius) * 32767);
 emit(EV_ABS, ABS_RY, toSigned16(xValue));
 emit(EV_ABS, ABS_RZ, toSigned16(yValue));
 }
}

// --- Paddle Buttons ---
function initPaddle(paddleId, code) {
 var zone = document.getElementById(paddleId);
 if (!zone) return;
 var btn = document.createElement('button');
 btn.className = 'paddle-btn';
 btn.textContent = paddleId === 'zone-paddle-left' ? '▲' : '▲';
 btn.dataset.code = code;
 zone.appendChild(btn);

 var isActive = false;
 var identifier = null;

 zone.addEventListener('touchstart', function(e) {
 if (isActive) return;
 var t = e.changedTouches[0];
 isActive = true;
 identifier = t.identifier;
 btn.classList.add('pressed');
 emit(EV_KEY, code, 1);
 e.preventDefault();
 }, { passive: false });

 document.addEventListener('touchmove', function(e) {
 if (!isActive) return;
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 var rect = zone.getBoundingClientRect();
 var x = e.changedTouches[i].clientX;
 var y = e.changedTouches[i].clientY;
 if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, code, 0);
 }
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchend', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, code, 0);
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchcancel', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, code, 0);
 break;
 }
 }
 });
}

// --- Button Zones ---
function initButtonZone(zoneId, buttonCode, label) {
 var zone = document.getElementById(zoneId);
 if (!zone) return;
 var btn = document.createElement('button');
 btn.className = 'wheel-btn';
 btn.textContent = label || zoneId;
 btn.dataset.code = buttonCode;
 zone.appendChild(btn);

 var isActive = false;
 var identifier = null;

 zone.addEventListener('touchstart', function(e) {
 if (isActive) return;
 var t = e.changedTouches[0];
 isActive = true;
 identifier = t.identifier;
 btn.classList.add('pressed');
 emit(EV_KEY, buttonCode, 1);
 e.preventDefault();
 }, { passive: false });

 document.addEventListener('touchmove', function(e) {
 if (!isActive) return;
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 var rect = zone.getBoundingClientRect();
 var x = e.changedTouches[i].clientX;
 var y = e.changedTouches[i].clientY;
 if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, buttonCode, 0);
 }
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchend', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, buttonCode, 0);
 e.preventDefault();
 break;
 }
 }
 });

 document.addEventListener('touchcancel', function(e) {
 for (var i = 0; i < e.changedTouches.length; i++) {
 if (e.changedTouches[i].identifier === identifier) {
 isActive = false;
 identifier = null;
 btn.classList.remove('pressed');
 emit(EV_KEY, buttonCode, 0);
 break;
 }
 }
 });
}

// --- Theme Cycling ---
window.cycleTheme = function() {
 window.themeIndex = (window.themeIndex + 1) % window.themes.length;
 var theme = window.themes[window.themeIndex];

 // Remove all theme classes
 document.body.className = document.body.className.replace(/\bwheel-(light|dark|amoled)\b/g, '');

 // Add new theme class (skip 'light' as it's default)
 if (theme !== 'light') {
 document.body.classList.add('wheel-' + theme);
 }

 // Update button emoji for visual feedback
 var btn = document.getElementById('btn-theme');
 var emojis = ['🟢', '🌙', '⚫'];
 if (btn) {
 btn.textContent = emojis[window.themeIndex];
 }
};

// --- Fullscreen ---
function toggleFullscreen() {
 if (!document.fullscreenElement) {
 document.documentElement.requestFullscreen().catch(function(err) {
 console.log('Fullscreen error:', err);
 });
 } else {
 document.exitFullscreen();
 }
}

// --- Presets ---
function loadPresetsList() {
 socket.emit('getWheelPresets');
}

socket.on('wheelPresets', function(presets) {
 var select = document.getElementById('preset-select');
 select.innerHTML = '';
 presets.forEach(function(preset) {
 var option = document.createElement('option');
 option.value = preset;
 option.textContent = preset;
 select.appendChild(option);
 });
 loadPreset('default');
});

function loadPreset(name) {
 socket.emit('loadWheelPreset', { name: name });
}

socket.on('wheelPreset', function(config) {
 currentPreset = config;
 applyPreset(config);
});

function applyPreset(config) {
 if (config.leftyMode !== undefined) {
 leftyMode = config.leftyMode;
 document.body.classList.toggle('lefty-mode', leftyMode);
 }
 if (config.steeringRange !== undefined) {
 steeringRange = config.steeringRange;
 }
}

// --- Editor ---
document.getElementById('btn-edit-mode').addEventListener('click', function() {
 var modal = document.getElementById('editor-modal');
 modal.style.display = 'flex';
 document.getElementById('edit-lefty-toggle').checked = leftyMode;
 document.getElementById('edit-steering-range').value = steeringRange;
 loadEditorButtons();
});

document.getElementById('btn-close-editor').addEventListener('click', function() {
 document.getElementById('editor-modal').style.display = 'none';
});

document.getElementById('btn-save-preset').addEventListener('click', function() {
 var name = document.getElementById('preset-name').value || 'custom';
 var config = {
 leftyMode: document.getElementById('edit-lefty-toggle').checked,
 steeringRange: parseInt(document.getElementById('edit-steering-range').value) || 180
 };
 socket.emit('saveWheelPreset', { name: name, config: config });
 document.getElementById('editor-modal').style.display = 'none';
});

function loadEditorButtons() {
 var list = document.getElementById('editor-buttons-list');
 list.innerHTML = '';
 // Buttons can be added here
}

// --- Connection Management ---
socket.on('connect', function() {
 log('info', 'Connected to server');
 socket.emit('connectWheelNoClutch');
});

socket.on('wheelConnected', function(data) {
 connected = true;
 padId = data.padId;
 document.getElementById('wheel-player-banner').className = 'wheel-player-banner wheel-player-connected';
 document.getElementById('wheel-player-banner').textContent = 'Wheel ' + (padId + 1);
 document.getElementById('wheel-connection-status').className = 'wheel-connection-status wheel-status-connected';
 document.getElementById('wheel-connection-status').textContent = '● Connected';
 loadPresetsList();
});

socket.on('disconnect', function() {
 connected = false;
 padId = null;
 location.reload();
});

// Initialize all components
initWheel();
initSlider('slider-throttle');
initSlider('slider-brake');

// Paddles
initPaddle('zone-paddle-left', BTN_TOP);
initPaddle('zone-paddle-right', BTN_TOP2);

// Initialize camera joystick after DOM ready
initCameraJoystick();

// Init
loadPresetsList();

// Fullscreen popup
document.getElementById('btn-fullscreen-yes').addEventListener('click', function() {
 toggleFullscreen();
 document.getElementById('fullscreen-popup').style.display = 'none';
});
document.getElementById('btn-fullscreen-no').addEventListener('click', function() {
 document.getElementById('fullscreen-popup').style.display = 'none';
});

})();
