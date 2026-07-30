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

// Wheel axes (ABS) - No clutch slider, but ABS_RX still needed for camera joystick
var ABS_X = 0x00; // Steering
var ABS_Y = 0x01; // Throttle
var ABS_Z = 0x02; // Brake
var ABS_RX = 0x03; // (unused for clutch, but needed for camera joystick X)
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

  function emit(type, code, value) {
    if (!connected || padId === null) return;
    socket.emit('wheelEvent', { padId: padId, type: type, code: code, value: value });
  }

  // --- Utility ---
  window.toggleFullscreen = function() {
    var doc = window.document;
    var docEl = doc.documentElement;
    var request = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
    var cancel = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (request) request.call(docEl).catch(function(){});
    } else {
      if (cancel) cancel.call(doc);
    }
  };

  window.toggleDarkMode = function() {
    document.body.classList.toggle('wheel-dark');
  };

  window.toggleAmoledMode = function() {
    document.body.classList.toggle('wheel-amoled');
  };

  // Prevent context menu
  window.addEventListener('contextmenu', function(e) { e.preventDefault(); });

  // Theme toggle functionality
  document.addEventListener('DOMContentLoaded', function() {
    var themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function(e) {
        if (e.target.classList.contains('theme-btn')) {
          var theme = e.target.getAttribute('data-theme');
          var allButtons = themeToggle.querySelectorAll('.theme-btn');
          allButtons.forEach(function(btn) {
            btn.classList.remove('active');
          });
          e.target.classList.add('active');
          
          document.body.classList.remove('wheel-dark', 'wheel-amoled');
          if (theme !== 'light') {
            document.body.classList.add('wheel-' + theme);
          }
        }
      });
    }
  });

  // --- Fullscreen Popup ---
  var fsPopup = document.getElementById('fullscreen-popup');
  document.getElementById('btn-fullscreen-yes').addEventListener('click', function() {
    toggleFullscreen();
    fsPopup.style.display = 'none';
  });
  document.getElementById('btn-fullscreen-no').addEventListener('click', function() {
    fsPopup.style.display = 'none';
  });
  setTimeout(function() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      fsPopup.style.display = 'flex';
    } else {
      fsPopup.style.display = 'none';
    }
  }, 500);

  // --- Sliders ---
  function initSlider(id) {
    var container = document.getElementById(id);
    var fill = container.querySelector('.slider-fill');
    var track = container.querySelector('.slider-track');
    var axis = parseInt(container.getAttribute('data-axis'), 16);
    var trackingId = null;

    function update(clientY) {
      var rect = track.getBoundingClientRect();
      var val = 1 - ((clientY - rect.top) / rect.height);
      val = Math.max(0, Math.min(1, val));
      fill.style.height = (val * 100) + '%';
      emit(EV_ABS, axis, Math.round(val * 255));
    }

    container.addEventListener('touchstart', function(e) {
      if (trackingId !== null) return;
      e.preventDefault();
      var t = e.changedTouches[0];
      trackingId = t.identifier;
      update(t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', function(e) {
      if (trackingId === null) return;
      for (var i=0; i<e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === trackingId) {
          e.preventDefault();
          update(e.changedTouches[i].clientY);
        }
      }
    }, { passive: false });

    function release() {
      trackingId = null;
      fill.style.height = '0%';
      emit(EV_ABS, axis, 0);
    }

    window.addEventListener('touchend', function(e) {
      if (trackingId === null) return;
      for (var i=0; i<e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === trackingId) release();
      }
    });
    window.addEventListener('touchcancel', function(e) {
      if (trackingId === null) return;
      for (var i=0; i<e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === trackingId) release();
      }
    });
  }

  initSlider('slider-throttle');
  initSlider('slider-brake');

  // --- Steering Wheel (Rotary Dial) ---
  var wheelKnob = document.getElementById('steering-wheel-knob');
  var wheelTrackingId = null;
  var currentAngle = 0;
  var lastTouchAngle = 0;
  
  function getTouchAngle(clientX, clientY) {
    var rect = wheelKnob.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var rad = Math.atan2(clientY - centerY, clientX - centerX);
    var deg = (rad * 180 / Math.PI) + 90;
    if (deg > 180) deg -= 360;
    return deg;
  }

  wheelKnob.addEventListener('touchstart', function(e) {
    if (wheelTrackingId !== null) return;
    e.preventDefault();
    var t = e.changedTouches[0];
    wheelTrackingId = t.identifier;
    lastTouchAngle = getTouchAngle(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('touchmove', function(e) {
    if (wheelTrackingId === null) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === wheelTrackingId) {
        e.preventDefault();
        var newAngle = getTouchAngle(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        
        var delta = newAngle - lastTouchAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;

        currentAngle += delta;
        lastTouchAngle = newAngle;

        var maxAngle = (currentPreset && currentPreset.steeringRange) ? currentPreset.steeringRange / 2 : 90;
        currentAngle = Math.max(-maxAngle, Math.min(maxAngle, currentAngle));

        wheelKnob.style.transform = 'rotate(' + currentAngle + 'deg)';

        var val = Math.round((currentAngle / maxAngle) * 32767);
        emit(EV_ABS, ABS_X, val);
      }
    }
  }, { passive: false });

  function releaseWheel() {
    wheelTrackingId = null;
    currentAngle = 0;
    wheelKnob.style.transition = 'transform 0.2s ease-out';
    wheelKnob.style.transform = 'rotate(0deg)';
    emit(EV_ABS, ABS_X, 0);
    setTimeout(function() {
      wheelKnob.style.transition = '';
    }, 200);
  }

  window.addEventListener('touchend', function(e) {
    if (wheelTrackingId === null) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === wheelTrackingId) releaseWheel();
    }
  });

  window.addEventListener('touchcancel', function(e) {
    if (wheelTrackingId === null) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === wheelTrackingId) releaseWheel();
    }
  });

  // --- Camera Joystick (positionable module) ---
  var camJoyActiveId = null;
  var camJoyKnobEl = null;
  var camJoyRadius = 0;
  var camJoyCenterX = 0;
  var camJoyCenterY = 0;
  var camJoyZone = null;

  // Clean up previous camera joystick listeners
  var camJoyListeners = [];
  function removeCamJoyListeners() {
    camJoyListeners.forEach(function(l) {
      l.target.removeEventListener(l.event, l.fn, l.opts);
    });
    camJoyListeners = [];
    camJoyActiveId = null;
    camJoyKnobEl = null;
    camJoyZone = null;
  }

  function createCameraJoystick(zone) {
    if (!zone) return;
    removeCamJoyListeners();
    camJoyZone = zone;

    // Mark zone as joystick container
    zone.classList.add('camera-joystick-zone');

    // Create visual knob
    camJoyKnobEl = document.createElement('div');
    camJoyKnobEl.className = 'camera-knob';
    zone.appendChild(camJoyKnobEl);

    // Add label
    var label = document.createElement('div');
    label.className = 'camera-joystick-label';
    label.textContent = '📷';
    zone.appendChild(label);

    var updateGeometry = function() {
      var rect = zone.getBoundingClientRect();
      camJoyCenterX = rect.width / 2;
      camJoyCenterY = rect.height / 2;
      camJoyRadius = Math.min(rect.width, rect.height) / 2 * 0.75;
    };
    updateGeometry();

    function addListener(target, event, fn, opts) {
      target.addEventListener(event, fn, opts);
      camJoyListeners.push({ target: target, event: event, fn: fn, opts: opts });
    }

    addListener(window, 'resize', updateGeometry);
    addListener(window, 'orientationchange', updateGeometry);

    addListener(zone, 'touchstart', function(e) {
      if (camJoyActiveId !== null) return;
      var t = e.changedTouches[0];
      camJoyActiveId = t.identifier;
      if (camJoyKnobEl) camJoyKnobEl.classList.add('active');
      updateGeometry();
      var dx = t.clientX - zone.getBoundingClientRect().left - camJoyCenterX;
      var dy = t.clientY - zone.getBoundingClientRect().top - camJoyCenterY;
      updateKnobPosition(dx, dy);
      e.preventDefault();
    }, { passive: false });

    addListener(window, 'touchmove', function(e) {
      if (camJoyActiveId === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === camJoyActiveId) {
          var rect = zone.getBoundingClientRect();
          var dx = e.changedTouches[i].clientX - rect.left - camJoyCenterX;
          var dy = e.changedTouches[i].clientY - rect.top - camJoyCenterY;

          var nx = Math.max(-1, Math.min(1, dx / camJoyRadius));
          var ny = Math.max(-1, Math.min(1, dy / camJoyRadius));

          if (Math.abs(nx) < 0.15) nx = 0;
          if (Math.abs(ny) < 0.15) ny = 0;

          var wheelMain = document.querySelector('.wheel-main');
          if (wheelMain && wheelMain.classList.contains('lefty-mode')) {
            nx = -nx;
          }

          emit(EV_ABS, ABS_RY, Math.round(nx * 32767));
          emit(EV_ABS, ABS_RZ, Math.round(-ny * 32767));

          updateKnobPosition(dx, dy);
          e.preventDefault();
          break;
        }
      }
    }, { passive: false });

    function releaseCamJoy() {
      if (camJoyActiveId === null) return;
      camJoyActiveId = null;
      if (camJoyKnobEl) {
        camJoyKnobEl.classList.remove('active');
        camJoyKnobEl.style.transform = 'translate(-50%, -50%)';
      }
      emit(EV_ABS, ABS_RY, 0);
      emit(EV_ABS, ABS_RZ, 0);
    }

    addListener(window, 'touchend', function(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === camJoyActiveId) {
          releaseCamJoy();
          break;
        }
      }
    });

    addListener(window, 'touchcancel', function(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === camJoyActiveId) {
          releaseCamJoy();
          break;
        }
      }
    });
  }

  function updateKnobPosition(dx, dy) {
    if (!camJoyKnobEl || !camJoyZone) return;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > camJoyRadius) {
      dx = dx / dist * camJoyRadius;
      dy = dy / dist * camJoyRadius;
    }
    camJoyKnobEl.style.transform = 'translate(calc(-50% + ' + Math.round(dx) + 'px), calc(-50% + ' + Math.round(dy) + 'px))';
  }

  // --- Dynamic Buttons & Modules ---
  function renderButtons(buttons, modules) {
    const zoneIds = [
      'zone-paddle-left', 'zone-paddle-right', 'zone-wheel-center',
      'slot-left-top', 'slot-left-bot',
      'slot-left-mid-top', 'slot-left-mid-mid', 'slot-left-mid-bot',
      'slot-right-mid-top', 'slot-right-mid-mid', 'slot-right-mid-bot',
      'slot-right-top', 'slot-right-mid'
    ];
    // Clean up old camera joystick & clear all zone contents
    removeCamJoyListeners();
    zoneIds.forEach(id => {
      var el = document.getElementById(id);
      if (el) {
        el.innerHTML = '';
        el.classList.remove('camera-joystick-zone');
      }
    });

    // Render camera joystick module(s)
    var camJoyPlaced = false;
    if (modules && modules.length) {
      modules.forEach(function(mod) {
        if (mod.type === 'camera-joystick') {
          var zoneId = mod.position.startsWith('slot-') ? mod.position : 'zone-' + mod.position;
          var zone = document.getElementById(zoneId);
          if (zone) {
            createCameraJoystick(zone);
            camJoyPlaced = true;
          }
        }
      });
    }
    if (!camJoyPlaced) {
      var defaultZone = document.getElementById('zone-wheel-center');
      if (defaultZone) createCameraJoystick(defaultZone);
    }

    // Render buttons
    buttons.forEach(function(btnData) {
      var el = document.createElement('div');
      el.textContent = btnData.label;
      var isPaddle = btnData.position.indexOf('paddle') !== -1;
      el.className = isPaddle ? 'paddle-btn' : 'wheel-btn';
      
      var code = parseInt(btnData.code, 16);

      function press(e) {
        e.preventDefault();
        el.classList.add('pressed');
        if(navigator.vibrate) navigator.vibrate(20);
        emit(EV_KEY, code, 1);
      }
      function release(e) {
        e.preventDefault();
        el.classList.remove('pressed');
        emit(EV_KEY, code, 0);
      }

      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);

      var zoneId = btnData.position.startsWith('slot-') ? btnData.position : 'zone-' + btnData.position;
      var zone = document.getElementById(zoneId);
      if (zone) zone.appendChild(el);
    });
  }

  // --- Presets ---
  function loadPresetsList() {
    fetch('/api/wheel-presets')
      .then(r => r.json())
      .then(presets => {
        var sel = document.getElementById('preset-select');
        var val = sel.value;
        sel.innerHTML = '';
        presets.forEach(p => {
          var opt = document.createElement('option');
          opt.value = p; opt.textContent = p;
          sel.appendChild(opt);
        });
        if (presets.includes(val)) sel.value = val;
        else if (presets.includes('default')) sel.value = 'default';
        else if (presets.length > 0) sel.value = presets[0];
        
        if (sel.value) applyPreset(sel.value);
      });
  }

  function applyPreset(name) {
    fetch('/api/wheel-presets/' + name)
      .then(r => r.json())
      .then(data => {
        currentPreset = data;
        renderButtons(data.buttons || [], data.modules || []);
        
        // Guard: slider-clutch and edit-clutch-toggle don't exist in no-clutch page
        var sliderClutch = document.getElementById('slider-clutch');
        var editClutchToggle = document.getElementById('edit-clutch-toggle');
        var hasClutch = data.sliders && data.sliders.some(s => s.id === 'clutch' && s.visible);
        if (sliderClutch) sliderClutch.style.display = hasClutch ? 'flex' : 'none';
        if (editClutchToggle) editClutchToggle.checked = hasClutch;
        
        document.getElementById('edit-lefty-toggle').checked = !!data.leftyMode;
        var wheelMain = document.querySelector('.wheel-main');
        if(data.leftyMode) wheelMain.classList.add('lefty-mode');
        else wheelMain.classList.remove('lefty-mode');

        document.getElementById('edit-steering-range').value = data.steeringRange || 180;
        
        document.getElementById('preset-name').value = name;
      });
  }

  document.getElementById('preset-select').addEventListener('change', function(e) {
    applyPreset(e.target.value);
  });

  // --- Editor ---
  document.getElementById('btn-edit-mode').addEventListener('click', function() {
    document.getElementById('editor-modal').style.display = 'flex';
    renderEditorList();
  });
  document.getElementById('btn-close-editor').addEventListener('click', function() {
    document.getElementById('editor-modal').style.display = 'none';
  });

  function renderEditorList() {
    var list = document.getElementById('editor-buttons-list');
    list.innerHTML = '';
    if(!currentPreset) return;

    // Camera joystick position editor
    var modules = currentPreset.modules || [];
    var camMod = modules.find(function(m) { return m.type === 'camera-joystick'; });
    var camRow = document.createElement('div');
    camRow.className = 'edit-btn-row';
    var camPos = camMod ? camMod.position : '';
    camRow.innerHTML = `
      <label style="font-weight:bold; min-width:80px">📷 Camera Joystick</label>
      <select onchange="updateCamJoyPos(this.value)">
        <option value="" ${!camPos?'selected':''}>None (disabled)</option>
        <option value="wheel-center" ${camPos==='wheel-center'?'selected':''}>Wheel Center</option>
        <option value="slot-left-top" ${camPos==='slot-left-top'?'selected':''}>Left (Top)</option>
        <option value="slot-left-bot" ${camPos==='slot-left-bot'?'selected':''}>Left (Bottom)</option>
        <option value="slot-left-mid-mid" ${camPos==='slot-left-mid-mid'?'selected':''}>Left-Mid (Middle)</option>
        <option value="slot-left-mid-bot" ${camPos==='slot-left-mid-bot'?'selected':''}>Left-Mid (Bottom)</option>
        <option value="slot-right-mid-top" ${camPos==='slot-right-mid-top'?'selected':''}>Right-Mid (Top)</option>
        <option value="slot-right-mid-mid" ${camPos==='slot-right-mid-mid'?'selected':''}>Right-Mid (Middle)</option>
        <option value="slot-right-mid-bot" ${camPos==='slot-right-mid-bot'?'selected':''}>Right-Mid (Bottom)</option>
        <option value="slot-right-top" ${camPos==='slot-right-top'?'selected':''}>Right (Top)</option>
        <option value="slot-right-mid" ${camPos==='slot-right-mid'?'selected':''}>Right (Middle)</option>
      </select>
    `;
    list.appendChild(camRow);

    // Separator
    var sep = document.createElement('hr');
    list.appendChild(sep);

    // Button editors
    if(!currentPreset.buttons) return;
    
    currentPreset.buttons.forEach((btn, idx) => {
      var row = document.createElement('div');
      row.className = 'edit-btn-row';
      row.innerHTML = `
        <input type="text" value="${btn.label}" onchange="updateBtn(${idx}, 'label', this.value)" placeholder="Label">
        <select onchange="updateBtn(${idx}, 'code', this.value)">
          <option value="0x120" ${btn.code==='0x120'?'selected':''}>Trigger</option>
          <option value="0x121" ${btn.code==='0x121'?'selected':''}>Thumb</option>
          <option value="0x123" ${btn.code==='0x123'?'selected':''}>Top (Gear ↑)</option>
          <option value="0x124" ${btn.code==='0x124'?'selected':''}>Top2 (Gear ↓)</option>
          <option value="0x126" ${btn.code==='0x126'?'selected':''}>Base 1</option>
          <option value="0x127" ${btn.code==='0x127'?'selected':''}>Base 2</option>
          <option value="0x128" ${btn.code==='0x128'?'selected':''}>Base 3</option>
          <option value="0x129" ${btn.code==='0x129'?'selected':''}>Base 4</option>
        </select>
        <select onchange="updateBtn(${idx}, 'position', this.value)">
          <option value="paddle-left" ${btn.position==='paddle-left'?'selected':''}>Left Paddle</option>
          <option value="paddle-right" ${btn.position==='paddle-right'?'selected':''}>Right Paddle</option>
          <option value="wheel-center" ${btn.position==='wheel-center'?'selected':''}>Wheel Center</option>
          <option value="slot-left-top" ${btn.position==='slot-left-top'?'selected':''}>Left (Top)</option>
          <option value="slot-left-bot" ${btn.position==='slot-left-bot'?'selected':''}>Left (Bottom)</option>
          <option value="slot-left-mid-mid" ${btn.position==='slot-left-mid-mid'?'selected':''}>Left-Mid (Middle)</option>
          <option value="slot-left-mid-bot" ${btn.position==='slot-left-mid-bot'?'selected':''}>Left-Mid (Bottom)</option>
          <option value="slot-right-mid-top" ${btn.position==='slot-right-mid-top'?'selected':''}>Right-Mid (Top)</option>
          <option value="slot-right-mid-mid" ${btn.position==='slot-right-mid-mid'?'selected':''}>Right-Mid (Middle)</option>
          <option value="slot-right-mid-bot" ${btn.position==='slot-right-mid-bot'?'selected':''}>Right-Mid (Bottom)</option>
          <option value="slot-right-top" ${btn.position==='slot-right-top'?'selected':''}>Right (Top)</option>
          <option value="slot-right-mid" ${btn.position==='slot-right-mid'?'selected':''}>Right (Middle)</option>
        </select>
        <button onclick="deleteBtn(${idx})">X</button>
      `;
      list.appendChild(row);
    });
  }

  window.updateCamJoyPos = function(pos) {
    if (!currentPreset.modules) currentPreset.modules = [];
    currentPreset.modules = currentPreset.modules.filter(function(m) { return m.type !== 'camera-joystick'; });
    if (pos) {
      currentPreset.modules.push({ type: 'camera-joystick', position: pos });
    }
    renderButtons(currentPreset.buttons || [], currentPreset.modules || []);
  };

  window.updateBtn = function(idx, field, val) {
    currentPreset.buttons[idx][field] = val;
    renderButtons(currentPreset.buttons || [], currentPreset.modules || []);
  };
  window.deleteBtn = function(idx) {
    currentPreset.buttons.splice(idx, 1);
    renderButtons(currentPreset.buttons || [], currentPreset.modules || []);
    renderEditorList();
  };

  document.getElementById('btn-add-button').addEventListener('click', function() {
    if(!currentPreset.buttons) currentPreset.buttons = [];
    if(currentPreset.buttons.length >= 6) return alert('Maximum 6 buttons allowed');
    currentPreset.buttons.push({ id: 'btn_'+Date.now(), label: 'Btn', code: '0x126', position: 'slot-right-top' });
    renderButtons(currentPreset.buttons || [], currentPreset.modules || []);
    renderEditorList();
  });

  document.getElementById('btn-save-preset').addEventListener('click', function() {
    var name = document.getElementById('preset-name').value || 'Custom';
    currentPreset.name = name;
    
    var editClutchToggle = document.getElementById('edit-clutch-toggle');
    var hasClutch = editClutchToggle ? editClutchToggle.checked : false;
    if(!currentPreset.sliders) currentPreset.sliders = [
      { id: "throttle", label: "Throttle", axis: "0x01", visible: true },
      { id: "brake", label: "Brake", axis: "0x02", visible: true },
      { id: "clutch", label: "Clutch", axis: "0x05", visible: false }
    ];
    var c = currentPreset.sliders.find(s=>s.id==='clutch');
    if(c) c.visible = hasClutch;

    currentPreset.leftyMode = document.getElementById('edit-lefty-toggle').checked;
    currentPreset.steeringRange = parseInt(document.getElementById('edit-steering-range').value) || 180;

    fetch('/api/wheel-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, config: currentPreset })
    }).then(() => {
      loadPresetsList();
      applyPreset(name);
      document.getElementById('editor-modal').style.display = 'none';
    });
  });

  // --- Socket Events ---
  socket.on('wheelConnected', function(data) {
    connected = true;
    padId = data.padId;
    document.getElementById('wheel-connection-status').textContent = '● Connected';
    document.getElementById('wheel-connection-status').className = 'wheel-connection-status wheel-status-connected';
    document.getElementById('wheel-player-banner').textContent = 'Player ' + (padId + 1);
    document.getElementById('wheel-player-banner').className = 'wheel-player-banner wheel-player-connected';
    
    setTimeout(function() {
      if (currentPreset && currentPreset.sliders) {
        currentPreset.sliders.forEach(function(s) {
          emit(EV_ABS, parseInt(s.axis, 16), 0);
        });
      } else {
        emit(EV_ABS, 0x01, 0);
        emit(EV_ABS, 0x02, 0);
        emit(EV_ABS, 0x05, 0);
      }
    }, 100);
  });

socket.on('connect', function() {
 socket.emit('connectWheelNoClutch');
});

  socket.on('disconnect', function() {
    connected = false;
    padId = null;
    location.reload();
  });

// Theme cycling function
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

// Init
loadPresetsList();

})();