(function() {
  'use strict';

  var socket = io();
  var connected = false;
  var padId = null;

  var EV_KEY = 0x01;
  var EV_ABS = 0x03;
  var ABS_X = 0x00; // Steering
  var ABS_Z = 0x02; // Throttle
  var ABS_RZ = 0x05; // Brake
  var ABS_Y = 0x01; // Clutch

  var currentPreset = null;

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

  // Prevent context menu and gestures
  window.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  document.body.addEventListener('touchmove', function(e) {
    // Only prevent default if we are touching a control
    if (e.target.closest('.slider-container') || e.target.closest('.steering-wheel')) {
      e.preventDefault();
    }
  }, { passive: false });

  // --- Fullscreen Popup ---
  var fsPopup = document.getElementById('fullscreen-popup');
  document.getElementById('btn-fullscreen-yes').addEventListener('click', function() {
    toggleFullscreen();
    fsPopup.style.display = 'none';
  });
  document.getElementById('btn-fullscreen-no').addEventListener('click', function() {
    fsPopup.style.display = 'none';
  });
  // Show popup on load if not fullscreen
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
      // Y is inverted (bottom is 0, top is max)
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
  initSlider('slider-clutch');

  // --- Steering Wheel (Rotary Dial) ---
  var wheelKnob = document.getElementById('steering-wheel-knob');
  var wheelTrackingId = null;
  var currentAngle = 0; // Total accumulated angle in degrees
  var lastTouchAngle = 0; // Angle of touch from previous frame
  
  function getTouchAngle(clientX, clientY) {
    var rect = wheelKnob.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    // atan2 returns -PI to PI
    var rad = Math.atan2(clientY - centerY, clientX - centerX);
    // Convert to degrees, add 90 so 0 is top
    var deg = (rad * 180 / Math.PI) + 90;
    // Normalize to -180 to 180
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
        
        // Calculate delta and handle the -180/180 boundary wrap
        var delta = newAngle - lastTouchAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;

        currentAngle += delta;
        lastTouchAngle = newAngle;

        // Clamp total rotation based on preset (e.g. 900 degrees = -450 to 450)
        var maxAngle = (currentPreset && currentPreset.steering && currentPreset.steering.range) ? currentPreset.steering.range / 2 : 450;
        currentAngle = Math.max(-maxAngle, Math.min(maxAngle, currentAngle));

        wheelKnob.style.transform = 'rotate(' + currentAngle + 'deg)';

        // Map to -32768 .. 32767
        var val = Math.round((currentAngle / maxAngle) * 32767);
        emit(EV_ABS, ABS_X, val);
      }
    }
  }, { passive: false });

  function releaseWheel() {
    wheelTrackingId = null;
    // Auto-center (Optional, could be disabled in preset)
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

  // Also release on touchcancel (phone call, system interrupt, etc.)
  window.addEventListener('touchcancel', function(e) {
    if (wheelTrackingId === null) return;
    for (var i=0; i<e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === wheelTrackingId) releaseWheel();
    }
  });

  // --- Dynamic Buttons ---
  function renderButtons(buttons) {
    // Clear zones
    const zoneIds = [
      'zone-paddle-left', 'zone-paddle-right', 'zone-wheel-center',
      'slot-left-top', 'slot-left-bot', 'slot-left-mid-bot',
      'slot-right-mid-top', 'slot-right-mid-bot',
      'slot-right-top', 'slot-right-mid', 'slot-right-bot'
    ];
    zoneIds.forEach(id => {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

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
        renderButtons(data.buttons || []);
        
        // Show/hide clutch
        var hasClutch = data.sliders && data.sliders.some(s => s.id === 'clutch' && s.visible);
        document.getElementById('slider-clutch').style.display = hasClutch ? 'flex' : 'none';
        document.getElementById('edit-clutch-toggle').checked = hasClutch;
        
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
    if(!currentPreset || !currentPreset.buttons) return;
    
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
          <option value="slot-left-mid-bot" ${btn.position==='slot-left-mid-bot'?'selected':''}>Left-Mid (Bottom)</option>
          <option value="slot-right-mid-top" ${btn.position==='slot-right-mid-top'?'selected':''}>Right-Mid (Top)</option>
          <option value="slot-right-mid-bot" ${btn.position==='slot-right-mid-bot'?'selected':''}>Right-Mid (Bottom)</option>
          <option value="slot-right-top" ${btn.position==='slot-right-top'?'selected':''}>Right (Top)</option>
          <option value="slot-right-mid" ${btn.position==='slot-right-mid'?'selected':''}>Right (Middle)</option>
          <option value="slot-right-bot" ${btn.position==='slot-right-bot'?'selected':''}>Right (Bottom)</option>
        </select>
        <button onclick="deleteBtn(${idx})">X</button>
      `;
      list.appendChild(row);
    });
  }

  window.updateBtn = function(idx, field, val) {
    currentPreset.buttons[idx][field] = val;
  };
  window.deleteBtn = function(idx) {
    currentPreset.buttons.splice(idx, 1);
    renderEditorList();
  };

  document.getElementById('btn-add-button').addEventListener('click', function() {
    if(!currentPreset.buttons) currentPreset.buttons = [];
    if(currentPreset.buttons.length >= 6) return alert('Maximum 6 buttons allowed');
    currentPreset.buttons.push({ id: 'btn_'+Date.now(), label: 'Btn', code: '0x126', position: 'slot-right-top' });
    renderEditorList();
  });

  document.getElementById('btn-save-preset').addEventListener('click', function() {
    var name = document.getElementById('preset-name').value || 'Custom';
    currentPreset.name = name;
    
    // Update clutch
    var hasClutch = document.getElementById('edit-clutch-toggle').checked;
    if(!currentPreset.sliders) currentPreset.sliders = [
      { id: "throttle", label: "Throttle", axis: "0x05", visible: true },
      { id: "brake", label: "Brake", axis: "0x02", visible: true },
      { id: "clutch", label: "Clutch", axis: "0x01", visible: false }
    ];
    var c = currentPreset.sliders.find(s=>s.id==='clutch');
    if(c) c.visible = hasClutch;

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
  });

  socket.on('connect', function() {
    socket.emit('connectWheel');
  });

  socket.on('disconnect', function() {
    connected = false;
    padId = null;
    location.reload();
  });

  // Init
  loadPresetsList();

})();
