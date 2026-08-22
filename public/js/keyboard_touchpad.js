/**
 * Keyboard Touchpad Extension
 * Adds toggleable touchpad + gesture functionality to keyboard.html.
 *
 * Bugs fixed from v1:
 *   - emit() infinite recursion on non-array calls (broke dedicated buttons)
 *   - No movement threshold → taps misclassified as drags
 *   - Scroll axes swapped (horizontal movement → vertical scroll)
 *   - Scroll sensitivity too high (same power curve as cursor)
 * New features:
 *   - Natural scrolling toggle
 *   - Left-hand mode toggle (swaps button areas)
 */
(function () {
    'use strict';

    // ==============================
    // CONSTANTS
    // ==============================
    var MOVE_THRESHOLD = 8;    // px – min movement before counting as drag (not tap)
    var SCROLL_DAMPING = 0.15; // scale factor to tame scroll vs cursor sensitivity

    var DEFAULTS = {
        speed: 2.0,
        acceleration: 1.5,
        naturalScrolling: false,
        leftHandMode: false
    };

    var LS_KEY = 'touchpadSettings'; // shared with standalone touchpad page

    // ==============================
    // SETTINGS
    // ==============================
    var localStorageOK = (typeof Storage !== 'undefined');

    var tpSettings = {
        speed: DEFAULTS.speed,
        acceleration: DEFAULTS.acceleration,
        naturalScrolling: DEFAULTS.naturalScrolling,
        leftHandMode: DEFAULTS.leftHandMode
    };

    function loadSettings() {
        if (!localStorageOK) return;
        try {
            var raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            var p = JSON.parse(raw);
            if (p.speed != null && !isNaN(p.speed))
                tpSettings.speed = parseFloat(p.speed);
            if (p.acceleration != null && !isNaN(p.acceleration))
                tpSettings.acceleration = parseFloat(p.acceleration);
            if (p.naturalScrolling != null)
                tpSettings.naturalScrolling = !!p.naturalScrolling;
            if (p.leftHandMode != null)
                tpSettings.leftHandMode = !!p.leftHandMode;
        } catch (e) {
            console.warn('[KBTouchpad] loadSettings:', e);
        }
    }

    function saveSettings() {
        if (!localStorageOK) return;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                speed: tpSettings.speed,
                acceleration: tpSettings.acceleration,
                naturalScrolling: tpSettings.naturalScrolling,
                leftHandMode: tpSettings.leftHandMode
            }));
        } catch (e) {
            console.warn('[KBTouchpad] saveSettings:', e);
        }
    }

    // ==============================
    // HAPTIC FEEDBACK
    // ==============================
    function haptic(ms) {
        try { navigator.vibrate && navigator.vibrate(ms || 40); } catch (e) {}
    }

    // ==============================
    // STATE
    // ==============================
    var isEnabled = false;
    var isConnecting = false;
    var socket = null;
    var touchpadId = null;

    var clicks = 0;           // bitmask: bit 0 = left held, bit 1 = right held
    var touches = 0;          // finger count in the main area
    var touchindex = 0;       // index of tracked finger
    var isTouchMove = false;  // true once movement exceeds threshold
    var totalMoveDist = 0;    // accumulated px since touchstart
    var current_x = 0;
    var current_y = 0;
    var drag = 0;             // 1 = currently in 3-finger drag

    // Desktop mouse fallback
    var mouseDown = false;
    var mouseMoved = false;

    // DOM refs
    var toggleBtn, toggleIcon, overlay, kbContainer;
    var tpArea, btnLeft, btnRight;

    // ==============================
    // EMIT HELPER (fixed – no recursion)
    // ==============================
    function emitTP(evType, code, value) {
        if (!socket) return;
        var payload = { type: evType, code: code, value: value };
        if (touchpadId != null) payload.touchpadId = touchpadId;
        socket.emit('touchpadEvent', payload);
    }

    // ==============================
    // LEFT-HAND MODE HELPERS
    // ==============================
    function leftBtnCode()  { return tpSettings.leftHandMode ? 0x111 : 0x110; }
    function rightBtnCode() { return tpSettings.leftHandMode ? 0x110 : 0x111; }

    // ==============================
    // DEDICATED BUTTON HANDLERS
    // ==============================
    function onLeftStart(e) {
        if (e && e.cancelable) e.preventDefault();
        haptic(30);
        if (btnLeft) btnLeft.classList.add('active');
        if (drag === 0) emitTP(1 /* EV_KEY */, leftBtnCode(), 1);
        clicks |= 1;
    }

    function onLeftEnd(e) {
        if (e && e.cancelable) e.preventDefault();
        if (btnLeft) btnLeft.classList.remove('active');
        if (drag === 0) emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
        clicks &= ~1;
    }

    function onRightStart(e) {
        if (e && e.cancelable) e.preventDefault();
        haptic(30);
        if (btnRight) btnRight.classList.add('active');
        emitTP(1 /* EV_KEY */, rightBtnCode(), 1);
        clicks |= 2;
    }

    function onRightEnd(e) {
        if (e && e.cancelable) e.preventDefault();
        if (btnRight) btnRight.classList.remove('active');
        emitTP(1 /* EV_KEY */, rightBtnCode(), 0);
        clicks &= ~2;
    }

    // ==============================
    // TOUCH AREA HANDLERS
    // ==============================
    function onAreaTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        // Count only area touches (subtract button-area touches)
        touches = e.touches.length - (clicks & 1) - ((clicks & 2) >> 1);
        touchindex = e.touches.length - 1;
        isTouchMove = false;
        totalMoveDist = 0;
        var t = e.touches[touchindex];
        if (t) {
            current_x = t.pageX;
            current_y = t.pageY;
        }
    }

    function onAreaTouchMove(e) {
        if (e.cancelable) e.preventDefault();

        // Handle finger lift during multi-touch
        if (touchindex + 1 > e.touches.length) {
            touchindex = e.touches.length - 1;
            return;
        }

        var t = e.touches[touchindex];
        if (!t) return;

        var dx = t.pageX - current_x;
        var dy = t.pageY - current_y;
        current_x = t.pageX;
        current_y = t.pageY;

        // Accumulate movement for tap/drag discrimination
        totalMoveDist += Math.abs(dx) + Math.abs(dy);
        if (totalMoveDist < MOVE_THRESHOLD) return; // still within "tap" zone

        isTouchMove = true;

        // Apply speed & non-linear acceleration
        var spd = tpSettings.speed;
        var acc = tpSettings.acceleration;
        var x = (dx >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dx), acc);
        var y = (dy >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dy), acc);

        if (touches >= 3) {
            // ── 3-finger drag & drop ──
            if (drag === 0 && (clicks & 1) === 0) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
            }
            drag = 1;
            emitTP(2 /* EV_REL */, 0 /* REL_X */, x);
            emitTP(2 /* EV_REL */, 1 /* REL_Y */, y);

        } else if (touches === 2) {
            // ── 2-finger scroll ──
            // FIXED: vertical finger movement → REL_WHEEL (vertical scroll)
            //        horizontal finger movement → REL_HWHEEL (horizontal scroll)
            var scrollSign = tpSettings.naturalScrolling ? 1 : -1;
            var sy = scrollSign * y * SCROLL_DAMPING;
            var sx = scrollSign * x * SCROLL_DAMPING;
            emitTP(2 /* EV_REL */, 8 /* REL_WHEEL  */, sy);
            emitTP(2 /* EV_REL */, 6 /* REL_HWHEEL */, sx);

        } else {
            // ── 1-finger cursor move ──
            emitTP(2 /* EV_REL */, 0 /* REL_X */, x);
            emitTP(2 /* EV_REL */, 1 /* REL_Y */, y);
        }
    }

    function onAreaTouchEnd(e) {
        if (e.cancelable) e.preventDefault();

        if (isTouchMove) {
            // End of a drag gesture
            if (drag === 1 && (clicks & 1) === 0) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
            }
            drag = 0;
        } else if (clicks === 0) {
            // ── Pure tap (no movement, no button-area touches) ──
            if (touches === 1) {
                haptic(25);
                emitTP(1, 0x110, 1); // BTN_LEFT press
                emitTP(1, 0x110, 0); // BTN_LEFT release
            } else if (touches === 2) {
                haptic(35);
                emitTP(1, 0x111, 1); // BTN_RIGHT press
                emitTP(1, 0x111, 0); // BTN_RIGHT release
            } else if (touches === 3) {
                haptic(45);
                emitTP(1, 0x112, 1); // BTN_MIDDLE press
                emitTP(1, 0x112, 0); // BTN_MIDDLE release
            } else if (touches >= 4) {
                haptic(50);
                emitTP(1, 0x113, 3); // BTN_SIDE (matches original driver value)
                emitTP(1, 0x113, 3);
            }
        }
        touches = 0;
    }

    // ==============================
    // DESKTOP MOUSE FALLBACK
    // ==============================
    function onMouseDown(e) {
        if (e.button !== 0) return;
        mouseDown = true;
        mouseMoved = false;
        current_x = e.pageX;
        current_y = e.pageY;
    }

    function onMouseMove(e) {
        if (!mouseDown) return;
        var dx = e.pageX - current_x;
        var dy = e.pageY - current_y;
        var spd = tpSettings.speed;
        var acc = tpSettings.acceleration;
        emitTP(2, 0, (dx >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dx), acc));
        emitTP(2, 1, (dy >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dy), acc));
        current_x = e.pageX;
        current_y = e.pageY;
        mouseMoved = true;
    }

    function onMouseUp(e) {
        if (!mouseDown) return;
        mouseDown = false;
        if (!mouseMoved && e.button === 0) {
            emitTP(1, 0x110, 1);
            emitTP(1, 0x110, 0);
        }
    }

    // ==============================
    // LISTENER MANAGEMENT
    // ==============================
    function bindListeners() {
        if (tpArea) {
            tpArea.addEventListener('touchstart', onAreaTouchStart, { passive: false });
            tpArea.addEventListener('touchmove',  onAreaTouchMove,  { passive: false });
            tpArea.addEventListener('touchend',   onAreaTouchEnd,   { passive: false });
            tpArea.addEventListener('touchcancel', onAreaTouchEnd,  { passive: false });
            tpArea.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        if (btnLeft) {
            btnLeft.addEventListener('touchstart', onLeftStart,  { passive: false });
            btnLeft.addEventListener('touchend',   onLeftEnd,    { passive: false });
            btnLeft.addEventListener('touchcancel', onLeftEnd,   { passive: false });
            btnLeft.addEventListener('mousedown', onLeftStart);
            btnLeft.addEventListener('mouseup',   onLeftEnd);
        }
        if (btnRight) {
            btnRight.addEventListener('touchstart', onRightStart, { passive: false });
            btnRight.addEventListener('touchend',   onRightEnd,   { passive: false });
            btnRight.addEventListener('touchcancel', onRightEnd,  { passive: false });
            btnRight.addEventListener('mousedown', onRightStart);
            btnRight.addEventListener('mouseup',   onRightEnd);
        }
    }

    function unbindListeners() {
        if (tpArea) {
            tpArea.removeEventListener('touchstart', onAreaTouchStart);
            tpArea.removeEventListener('touchmove',  onAreaTouchMove);
            tpArea.removeEventListener('touchend',   onAreaTouchEnd);
            tpArea.removeEventListener('touchcancel', onAreaTouchEnd);
            tpArea.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup',   onMouseUp);
        }
        if (btnLeft) {
            btnLeft.removeEventListener('touchstart', onLeftStart);
            btnLeft.removeEventListener('touchend',   onLeftEnd);
            btnLeft.removeEventListener('touchcancel', onLeftEnd);
            btnLeft.removeEventListener('mousedown', onLeftStart);
            btnLeft.removeEventListener('mouseup',   onLeftEnd);
            btnLeft.classList.remove('active');
        }
        if (btnRight) {
            btnRight.removeEventListener('touchstart', onRightStart);
            btnRight.removeEventListener('touchend',   onRightEnd);
            btnRight.removeEventListener('touchcancel', onRightEnd);
            btnRight.removeEventListener('mousedown', onRightStart);
            btnRight.removeEventListener('mouseup',   onRightEnd);
            btnRight.classList.remove('active');
        }
    }

    // ==============================
    // TOGGLE
    // ==============================
    function enable() {
        if (isConnecting || isEnabled || !socket) return;
        isConnecting = true;
        haptic(50);

        socket.once('touchpadConnected', function (data) {
            touchpadId = data ? data.touchpadId : null;
            isConnecting = false;
            isEnabled = true;

            if (kbContainer) kbContainer.classList.add('hidden');
            if (overlay) overlay.classList.remove('hidden');
            if (toggleBtn) toggleBtn.classList.add('active');
            if (toggleIcon) toggleIcon.src = 'images/icons/touchpad-disable.svg';

            // Reset state
            clicks = 0; touches = 0; drag = 0;
            isTouchMove = false; totalMoveDist = 0;
            mouseDown = false; mouseMoved = false;

            bindListeners();
        });

        socket.emit('connectTouchpad', null);
    }

    function disable() {
        if (!isEnabled && !isConnecting) return;
        haptic(50);
        unbindListeners();

        // Release any held drag
        if (drag === 1) {
            emitTP(1, 0x110, 0);
            drag = 0;
        }

        if (overlay) overlay.classList.add('hidden');
        if (kbContainer) kbContainer.classList.remove('hidden');
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (toggleIcon) toggleIcon.src = 'images/icons/touchpad-enable.svg';

        if (touchpadId != null && socket) {
            socket.emit('disconnectController', { type: 'touchpad', padId: touchpadId });
            touchpadId = null;
        }
        isEnabled = false;
        isConnecting = false;
    }

    // ==============================
    // SETTINGS UI
    // ==============================
    function syncSettingsUI() {
        loadSettings();
        var el;
        el = document.getElementById('settings-speed');
        if (el) el.value = tpSettings.speed;
        el = document.getElementById('settings-speed-output');
        if (el) el.value = tpSettings.speed;
        el = document.getElementById('settings-acceleration');
        if (el) el.value = tpSettings.acceleration;
        el = document.getElementById('settings-acceleration-output');
        if (el) el.value = tpSettings.acceleration;
        el = document.getElementById('settings-natural-scroll');
        if (el) el.checked = tpSettings.naturalScrolling;
        el = document.getElementById('settings-left-hand');
        if (el) el.checked = tpSettings.leftHandMode;
    }

    function initSettingsListeners() {
        var speedSlider = document.getElementById('settings-speed');
        var speedOut    = document.getElementById('settings-speed-output');
        var accelSlider = document.getElementById('settings-acceleration');
        var accelOut    = document.getElementById('settings-acceleration-output');
        var form        = document.getElementById('settings-form');

        if (speedSlider && speedOut) {
            speedSlider.addEventListener('input', function () { speedOut.value = this.value; });
        }
        if (accelSlider && accelOut) {
            accelSlider.addEventListener('input', function () { accelOut.value = this.value; });
        }

        if (form) {
            form.addEventListener('submit', function () {
                if (speedSlider) tpSettings.speed = parseFloat(speedSlider.value);
                if (accelSlider) tpSettings.acceleration = parseFloat(accelSlider.value);
                var natEl = document.getElementById('settings-natural-scroll');
                if (natEl) tpSettings.naturalScrolling = natEl.checked;
                var lhEl = document.getElementById('settings-left-hand');
                if (lhEl) tpSettings.leftHandMode = lhEl.checked;
                saveSettings();
            });
        }

        // Reload values whenever settings modal opens
        var settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) settingsBtn.addEventListener('click', syncSettingsUI);
    }

    // ==============================
    // INIT
    // ==============================
    function init() {
        loadSettings();

        toggleBtn   = document.getElementById('btn-touchpad-toggle');
        toggleIcon  = document.getElementById('btn-touchpad-icon');
        overlay     = document.getElementById('keyboard-touchpad-overlay');
        kbContainer = document.getElementById('keyboard-container');
        tpArea      = document.getElementById('kb-touchpad-area');
        btnLeft     = document.getElementById('kb-touchpad-btn_left');
        btnRight    = document.getElementById('kb-touchpad-btn_right');

        if (toggleBtn) {
            toggleBtn.disabled = true;
            toggleBtn.style.opacity = '0.4';
            toggleBtn.addEventListener('click', function () {
                if (isEnabled) disable(); else enable();
            });
        }

        // Prevent context menu on the overlay
        if (overlay) {
            overlay.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                return false;
            });
        }

        initSettingsListeners();
        syncSettingsUI();

        // Socket discovery
        function onSocket(s) {
            socket = s;
            if (toggleBtn) {
                toggleBtn.disabled = false;
                toggleBtn.style.opacity = '1';
            }
        }

        if (window._kbSocket) {
            onSocket(window._kbSocket);
        } else {
            window.addEventListener('kbSocketReady', function (e) {
                if (e && e.detail) onSocket(e.detail);
                else if (window._kbSocket) onSocket(window._kbSocket);
            });
            // Polling fallback
            var n = 0;
            var poll = setInterval(function () {
                if (window._kbSocket) { onSocket(window._kbSocket); clearInterval(poll); }
                else if (++n > 100) clearInterval(poll);
            }, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
