/* ============================================
   XInput Gamepad — Client-side logic
   Self-contained, no VirtualJoystick dependency
   Supports multiple parallel controllers
   ============================================ */
(function() {
  'use strict';

  var socket = io();
  var ledBitField = null;
  var connected = false;
  var padId = null;  // Our assigned controller slot

  // ---- Event constants ----
  var EV_KEY = 0x01;
  var EV_ABS = 0x03;
  var ABS_X    = 0x00;
  var ABS_Y    = 0x01;
  var ABS_Z    = 0x02;
  var ABS_RX   = 0x03;
  var ABS_RY   = 0x04;
  var ABS_RZ   = 0x05;
  var ABS_HAT0X = 0x10;
  var ABS_HAT0Y = 0x11;

  // ---- Emit helper — includes padId for server-side routing ----
  function emit(type, code, value) {
    if (!connected || padId === null) return;
    socket.emit('xinputPadEvent', { padId: padId, type: type, code: code, value: value });
  }

  // ==============================
  //  ANALOG STICK TOUCH TRACKING
  // ==============================
  function initStick(zoneId, knobId, absCodeX, absCodeY) {
    var zone = document.getElementById(zoneId);
    var knob = document.getElementById(knobId);
    var tracking = null; // touchId or 'mouse'
    var centerX, centerY, radius;

    function recalc() {
      var rect = zone.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top  + rect.height / 2;
      radius  = Math.min(rect.width, rect.height) / 2;
    }
    recalc();
    window.addEventListener('resize', recalc);

    function update(clientX, clientY) {
      var dx = clientX - centerX;
      var dy = clientY - centerY;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > radius) {
        dx = dx / dist * radius;
        dy = dy / dist * radius;
        dist = radius;
      }
      // Move the knob visually
      knob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      // Map to -32768 .. 32767
      var valX = Math.round((dx / radius) * 32767);
      var valY = Math.round((dy / radius) * 32767);
      emit(EV_ABS, absCodeX, valX);
      emit(EV_ABS, absCodeY, valY);
    }

    function release() {
      tracking = null;
      knob.style.transform = 'translate(0px, 0px)';
      emit(EV_ABS, absCodeX, 0);
      emit(EV_ABS, absCodeY, 0);
    }

    // Touch events
    zone.addEventListener('touchstart', function(e) {
      if (tracking !== null) return;
      e.preventDefault();
      var t = e.changedTouches[0];
      tracking = t.identifier;
      recalc();
      update(t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', function(e) {
      if (tracking === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tracking) {
          e.preventDefault();
          update(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          return;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', function(e) {
      if (tracking === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tracking) {
          release();
          return;
        }
      }
    });
    window.addEventListener('touchcancel', function(e) {
      if (tracking === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tracking) {
          release();
          return;
        }
      }
    });

    // Mouse support (for desktop testing)
    zone.addEventListener('mousedown', function(e) {
      if (tracking !== null) return;
      e.preventDefault();
      tracking = 'mouse';
      recalc();
      update(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function(e) {
      if (tracking !== 'mouse') return;
      update(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function(e) {
      if (tracking !== 'mouse') return;
      release();
    });
  }

  // ==============================
  //  BUTTON BINDING
  // ==============================
  navigator.vibrate = navigator.vibrate || navigator.webkitVibrate || navigator.mozVibrate || navigator.msVibrate;
  function vibrate() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (e) {}
  }

  function bindButtons() {
    // Face, bumper, menu, guide buttons (EV_KEY)
    var keyBtns = document.querySelectorAll('.xbtn[data-code]');
    keyBtns.forEach(function(btn) {
      var code = parseInt(btn.getAttribute('data-code'), 16);
      if (isNaN(code)) return;

      function press(e) {
        e.preventDefault();
        e.stopPropagation();
        vibrate();
        btn.classList.add('xbtn-pressed');
        emit(EV_KEY, code, 1);
      }
      function release(e) {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('xbtn-pressed');
        emit(EV_KEY, code, 0);
      }

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend',   release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown',  press);
      btn.addEventListener('mouseup',    release);
      btn.addEventListener('mouseleave', function() { btn.classList.remove('xbtn-pressed'); });
    });

    // Trigger buttons (EV_ABS: ABS_Z / ABS_RZ → 0 or 255)
    var triggerBtns = document.querySelectorAll('.xbtn-trigger[data-axis]');
    triggerBtns.forEach(function(btn) {
      var axis = parseInt(btn.getAttribute('data-axis'), 16);
      var val  = parseInt(btn.getAttribute('data-val'), 10);
      if (isNaN(axis) || isNaN(val)) return;

      function press(e) {
        e.preventDefault();
        vibrate();
        btn.classList.add('xbtn-pressed');
        emit(EV_ABS, axis, val);
      }
      function release(e) {
        e.preventDefault();
        btn.classList.remove('xbtn-pressed');
        emit(EV_ABS, axis, 0);
      }

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend',   release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown',  press);
      btn.addEventListener('mouseup',    release);
      btn.addEventListener('mouseleave', function() {
        if (btn.classList.contains('xbtn-pressed')) {
          btn.classList.remove('xbtn-pressed');
          emit(EV_ABS, axis, 0);
        }
      });
    });

    // D-Pad buttons (EV_ABS: hat axes → -1, 0, 1)
    var dpadBtns = document.querySelectorAll('.xbtn-dpad[data-hat-axis]');
    dpadBtns.forEach(function(btn) {
      var axis = parseInt(btn.getAttribute('data-hat-axis'), 16);
      var val  = parseInt(btn.getAttribute('data-hat-val'), 10);
      if (isNaN(axis) || isNaN(val)) return;

      function press(e) {
        e.preventDefault();
        vibrate();
        btn.classList.add('xbtn-pressed');
        emit(EV_ABS, axis, val);
      }
      function release(e) {
        e.preventDefault();
        btn.classList.remove('xbtn-pressed');
        emit(EV_ABS, axis, 0);
      }

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend',   release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown',  press);
      btn.addEventListener('mouseup',    release);
      btn.addEventListener('mouseleave', function() {
        if (btn.classList.contains('xbtn-pressed')) {
          btn.classList.remove('xbtn-pressed');
          emit(EV_ABS, axis, 0);
        }
      });
    });
  }

  // ==============================
  //  SLOT INDICATOR
  // ==============================
  function updateSlotIndicator() {
    var ids = ['xinput_ind_1','xinput_ind_2','xinput_ind_3','xinput_ind_4'];
    if (ledBitField != null) {
      for (var i = 0; i < 4; i++) {
        var el = document.getElementById(ids[i]);
        if (ledBitField & (1 << i)) {
          el.classList.add('xinput-ind-on');
        } else {
          el.classList.remove('xinput-ind-on');
        }
      }
    } else {
      // Blink all
      var on = true;
      var blink = setInterval(function() {
        for (var i = 0; i < 4; i++) {
          var el = document.getElementById(ids[i]);
          if (on) el.classList.add('xinput-ind-on');
          else    el.classList.remove('xinput-ind-on');
        }
        on = !on;
        if (ledBitField != null) {
          clearInterval(blink);
          updateSlotIndicator();
        }
      }, 500);
    }
  }

  // ==============================
  //  PLAYER BANNER
  // ==============================
  function updatePlayerBanner() {
    var banner = document.getElementById('xinput-player-banner');
    if (!banner) return;

    if (connected && padId !== null) {
      banner.textContent = 'Player ' + (padId + 1);
      banner.className = 'xinput-player-banner xinput-player-connected';
    } else {
      banner.textContent = 'Connecting…';
      banner.className = 'xinput-player-banner xinput-player-connecting';
    }
  }

  // ==============================
  //  CONNECTION STATUS
  // ==============================
  function updateConnectionStatus() {
    var statusEl = document.getElementById('xinput-connection-status');
    if (!statusEl) return;

    if (connected) {
      statusEl.textContent = '● Connected';
      statusEl.className = 'xinput-connection-status xinput-status-connected';
    } else {
      statusEl.textContent = '○ Disconnected';
      statusEl.className = 'xinput-connection-status xinput-status-disconnected';
    }
  }

  // ==============================
  //  DARK MODE
  // ==============================
  var themes = ['light', 'dark', 'amoled'];
  var currentTheme = 0;
  var themeIcons = ['☀️', '🌙', '🌑'];

  window.toggleDarkMode = function() {
    currentTheme = (currentTheme + 1) % themes.length;
    var btn = document.getElementById('xinput-btn-dark');
    if (btn) btn.innerText = themeIcons[currentTheme];

    document.body.classList.remove('xinput-dark', 'xinput-amoled');
    if (themes[currentTheme] === 'dark') {
      document.body.classList.add('xinput-dark');
    } else if (themes[currentTheme] === 'amoled') {
      document.body.classList.add('xinput-amoled');
    }
  };

  // ==============================
  //  WAKE LOCK (Keep Screen Awake)
  // ==============================
  var wakeLock = null;
  var requestWakeLock = function() {
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen')
        .then(function(lock) {
          wakeLock = lock;
          wakeLock.addEventListener('release', function() {
            console.log('Wake Lock released');
          });
          console.log('Wake Lock is active');
        })
        .catch(function(err) {
          console.error(err.name + ', ' + err.message);
        });
    }
  };

  document.addEventListener('visibilitychange', function() {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });

  document.body.addEventListener('click', requestWakeLock, { once: true });
  document.body.addEventListener('touchstart', requestWakeLock, { once: true });

  // ==============================
  //  FULLSCREEN
  // ==============================
  window.toggleFullscreen = function() {
    var doc = window.document;
    var docEl = doc.documentElement;
    var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (requestFullScreen) requestFullScreen.call(docEl).catch(function(){});
    } else {
      if (cancelFullScreen) cancelFullScreen.call(doc);
    }
  };

  // ==============================
  //  DISABLE CONTEXT MENU
  // ==============================
  window.addEventListener('contextmenu', function(e) { e.preventDefault(); });

  // ==============================
  //  INIT ON LOAD
  // ==============================
  window.addEventListener('load', function() {
    updateSlotIndicator();
    updatePlayerBanner();
    updateConnectionStatus();

    socket.on('xinputGamepadConnected', function(data) {
      connected = true;
      padId = data.padId;
      ledBitField = data.ledBitField;
      updateSlotIndicator();
      updatePlayerBanner();
      updateConnectionStatus();

      // Init sticks now that we're connected
      initStick('xinput-left-stick',  'xinput-left-stick-knob',  ABS_X, ABS_Y);
      initStick('xinput-right-stick', 'xinput-right-stick-knob', ABS_RX, ABS_RY);

      // Bind buttons
      bindButtons();
    });

    socket.on('connect', function() {
      socket.emit('connectXInputGamepad', null);
    });

    socket.on('disconnect', function() {
      connected = false;
      padId = null;
      updatePlayerBanner();
      updateConnectionStatus();
      location.reload();
    });
  });

})();
