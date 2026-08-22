/**
 * Keyboard Touchpad Extension
 * Adds toggleable touchpad + gesture functionality to keyboard.html.
 *
 * Supported Gestures & Drag Modes:
 *   - 1-Finger Instant Subpixel Motion: 0ms lag, zero deadzone, smooth 60fps cursor
 *   - 1-Finger Tap-to-Drag: Quick tap + touch down and drag to hold left mouse button
 *   - Two-Handed Drag: Hold physical left button + drag with another finger
 *   - 3-Finger Drag & Drop: Move with 3 fingers to hold left click and drag
 *   - 2-Finger Vertical Scroll: Smooth integer detent scrolling (supports Natural Scrolling)
 *   - Multi-Touch Taps: 1-tap (left click), 2-tap (right click), 3-tap (middle click), 4-tap (side button)
 *   - Left-Hand Mode: Swaps left and right mouse buttons
 *   - Shared settings with standalone touchpad.html via localStorage
 */
(function () {
    'use strict';

    // ==============================
    // CONFIGURATION & DEFAULTS
    // ==============================
    var DEFAULTS = {
        speed: 2.0,
        acceleration: 1.5,
        naturalScrolling: false,
        leftHandMode: false
    };

    var LS_KEY = 'touchpadSettings';
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
        try {
            if (navigator.vibrate) navigator.vibrate(ms || 35);
        } catch (e) {}
    }

    // ==============================
    // STATE
    // ==============================
    var isEnabled = false;
    var isConnecting = false;
    var socket = null;
    var touchpadId = null;

    // Physical button clicks
    var clicks = 0; // bitmask: 1 = left button, 2 = right button

    // Gesture tracking state machine
    var maxTouches = 0;
    var gestureStartTime = 0;
    var gestureStartX = 0;
    var gestureStartY = 0;
    var prevX = 0;
    var prevY = 0;
    var hasMoved = false;
    var totalMoveDist = 0;

    // Tap-to-drag state
    var lastTapTime = 0;
    var lastTapX = 0;
    var lastTapY = 0;
    var isTapDragging = false;

    // 3-finger drag state
    var isThreeFingerDragging = false;

    // Subpixel & scroll accumulators
    var accumX = 0.0;
    var accumY = 0.0;
    var scrollAccumY = 0.0;

    // Desktop mouse fallback state
    var mouseDown = false;
    var mouseMoved = false;

    // DOM Elements
    var toggleBtn, toggleIcon, overlay, kbContainer;
    var tpArea, btnLeft, btnRight;

    // ==============================
    // EMIT HELPER
    // ==============================
    function emitTP(evType, code, value) {
        if (!socket) return;
        var payload = {
            type: evType,
            code: code,
            value: value
        };
        if (touchpadId != null) payload.touchpadId = touchpadId;
        socket.emit('touchpadEvent', payload);
    }

    // ==============================
    // BUTTON CODE MAPPING (Left-Hand Mode)
    // ==============================
    function leftBtnCode() {
        return tpSettings.leftHandMode ? 0x111 /* BTN_RIGHT */ : 0x110 /* BTN_LEFT */;
    }
    function rightBtnCode() {
        return tpSettings.leftHandMode ? 0x110 /* BTN_LEFT */ : 0x111 /* BTN_RIGHT */;
    }

    // ==============================
    // DEDICATED BOTTOM BUTTONS
    // ==============================
    function onLeftStart(e) {
        if (e && e.cancelable) e.preventDefault();
        haptic(30);
        if (btnLeft) btnLeft.classList.add('active');
        if (!isTapDragging && !isThreeFingerDragging) {
            emitTP(1 /* EV_KEY */, leftBtnCode(), 1);
        }
        clicks |= 1;
    }

    function onLeftEnd(e) {
        if (e && e.cancelable) e.preventDefault();
        if (btnLeft) btnLeft.classList.remove('active');
        if (!isTapDragging && !isThreeFingerDragging) {
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
        }
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
    // TOUCHPAD AREA GESTURES (e.targetTouches)
    // ==============================
    function onAreaTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        var numTouches = e.targetTouches.length;
        var t = e.targetTouches[0];
        if (!t) return;

        var now = Date.now();

        if (numTouches === 1) {
            var timeSinceLastTap = now - lastTapTime;
            var distFromLastTap = Math.hypot(t.pageX - lastTapX, t.pageY - lastTapY);

            // Double-tap and hold -> Activate Tap-to-Drag
            if (timeSinceLastTap < 320 && distFromLastTap < 40) {
                isTapDragging = true;
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                haptic(30);
            } else {
                isTapDragging = false;
            }

            gestureStartTime = now;
            gestureStartX = t.pageX;
            gestureStartY = t.pageY;
            prevX = t.pageX;
            prevY = t.pageY;
            hasMoved = false;
            totalMoveDist = 0;
            maxTouches = 1;
            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;
        } else {
            // Multi-finger touch active
            if (isTapDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isTapDragging = false;
            }
            maxTouches = Math.max(maxTouches, numTouches);
            prevX = t.pageX;
            prevY = t.pageY;
        }
    }

    function onAreaTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        var numTouches = e.targetTouches.length;
        maxTouches = Math.max(maxTouches, numTouches);

        var t = e.targetTouches[0];
        if (!t) return;

        var dx = t.pageX - prevX;
        var dy = t.pageY - prevY;
        prevX = t.pageX;
        prevY = t.pageY;

        totalMoveDist += Math.abs(dx) + Math.abs(dy);
        if (totalMoveDist > 3) {
            hasMoved = true;
        }

        var spd = tpSettings.speed;
        var acc = tpSettings.acceleration;

        if (numTouches >= 3) {
            // ── 3-Finger Drag & Drop ──
            if (!isThreeFingerDragging && clicks === 0 && !isTapDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                isThreeFingerDragging = true;
            }

            var rawX = (dx >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dx), acc);
            var rawY = (dy >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dy), acc);
            accumX += rawX;
            accumY += rawY;

            var sendX = Math.trunc(accumX);
            var sendY = Math.trunc(accumY);
            if (sendX !== 0 || sendY !== 0) {
                accumX -= sendX;
                accumY -= sendY;
                if (sendX !== 0) emitTP(2 /* EV_REL */, 0 /* REL_X */, sendX);
                if (sendY !== 0) emitTP(2 /* EV_REL */, 1 /* REL_Y */, sendY);
            }

        } else if (numTouches === 2) {
            // ── 2-Finger Vertical Scroll ──
            var scrollSign = tpSettings.naturalScrolling ? 1 : -1;
            scrollAccumY += (dy * scrollSign * 0.15 * spd);
            var wheelSteps = Math.trunc(scrollAccumY);
            if (wheelSteps !== 0) {
                scrollAccumY -= wheelSteps;
                emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelSteps);
            }

        } else if (numTouches === 1) {
            // ── 1-Finger Motion (Instant Subpixel Cursor Move / Tap-Drag) ──
            var rawX = (dx >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dx), acc);
            var rawY = (dy >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dy), acc);
            accumX += rawX;
            accumY += rawY;

            var sendX = Math.trunc(accumX);
            var sendY = Math.trunc(accumY);
            if (sendX !== 0 || sendY !== 0) {
                accumX -= sendX;
                accumY -= sendY;
                if (sendX !== 0) emitTP(2 /* EV_REL */, 0 /* REL_X */, sendX);
                if (sendY !== 0) emitTP(2 /* EV_REL */, 1 /* REL_Y */, sendY);
            }
        }
    }

    function onAreaTouchEnd(e) {
        if (e.cancelable) e.preventDefault();

        // Only evaluate when all touches on the touchpad area have lifted
        if (e.targetTouches.length === 0) {
            var duration = Date.now() - gestureStartTime;

            if (isTapDragging) {
                // Release Tap-to-Drag
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isTapDragging = false;
                lastTapTime = 0;
            } else if (isThreeFingerDragging) {
                // Release 3-Finger Drag
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isThreeFingerDragging = false;
                lastTapTime = 0;
            } else if (!hasMoved && duration < 320 && clicks === 0) {
                // Clean Tap Gesture
                if (maxTouches === 1) {
                    // 1-Finger Tap -> Left Click (and remember for double-tap)
                    haptic(25);
                    emitTP(1, 0x110, 1);
                    emitTP(1, 0x110, 0);
                    lastTapTime = Date.now();
                    lastTapX = gestureStartX;
                    lastTapY = gestureStartY;
                } else if (maxTouches === 2) {
                    // 2-Finger Tap -> Right Click
                    haptic(35);
                    emitTP(1, 0x111, 1);
                    emitTP(1, 0x111, 0);
                    lastTapTime = 0;
                } else if (maxTouches === 3) {
                    // 3-Finger Tap -> Middle Click
                    haptic(45);
                    emitTP(1, 0x112, 1);
                    emitTP(1, 0x112, 0);
                    lastTapTime = 0;
                } else if (maxTouches >= 4) {
                    // 4-Finger Tap -> Side Button
                    haptic(50);
                    emitTP(1, 0x113, 3);
                    emitTP(1, 0x113, 3);
                    lastTapTime = 0;
                }
            } else {
                lastTapTime = 0;
            }

            hasMoved = false;
            maxTouches = 0;
            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;
        }
    }

    // ==============================
    // DESKTOP MOUSE FALLBACK
    // ==============================
    function onMouseDown(e) {
        if (e.button !== 0) return;
        mouseDown = true;
        mouseMoved = false;
        prevX = e.pageX;
        prevY = e.pageY;
        accumX = 0;
        accumY = 0;
    }

    function onMouseMove(e) {
        if (!mouseDown) return;
        var dx = e.pageX - prevX;
        var dy = e.pageY - prevY;
        prevX = e.pageX;
        prevY = e.pageY;

        var spd = tpSettings.speed;
        var acc = tpSettings.acceleration;
        var rawX = (dx >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dx), acc);
        var rawY = (dy >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dy), acc);
        accumX += rawX;
        accumY += rawY;

        var sendX = Math.trunc(accumX);
        var sendY = Math.trunc(accumY);
        if (sendX !== 0 || sendY !== 0) {
            accumX -= sendX;
            accumY -= sendY;
            if (sendX !== 0) emitTP(2, 0, sendX);
            if (sendY !== 0) emitTP(2, 1, sendY);
        }
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
            tpArea.addEventListener('touchmove', onAreaTouchMove, { passive: false });
            tpArea.addEventListener('touchend', onAreaTouchEnd, { passive: false });
            tpArea.addEventListener('touchcancel', onAreaTouchEnd, { passive: false });
            tpArea.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        if (btnLeft) {
            btnLeft.addEventListener('touchstart', onLeftStart, { passive: false });
            btnLeft.addEventListener('touchend', onLeftEnd, { passive: false });
            btnLeft.addEventListener('touchcancel', onLeftEnd, { passive: false });
            btnLeft.addEventListener('mousedown', onLeftStart);
            btnLeft.addEventListener('mouseup', onLeftEnd);
        }
        if (btnRight) {
            btnRight.addEventListener('touchstart', onRightStart, { passive: false });
            btnRight.addEventListener('touchend', onRightEnd, { passive: false });
            btnRight.addEventListener('touchcancel', onRightEnd, { passive: false });
            btnRight.addEventListener('mousedown', onRightStart);
            btnRight.addEventListener('mouseup', onRightEnd);
        }
    }

    function unbindListeners() {
        if (tpArea) {
            tpArea.removeEventListener('touchstart', onAreaTouchStart);
            tpArea.removeEventListener('touchmove', onAreaTouchMove);
            tpArea.removeEventListener('touchend', onAreaTouchEnd);
            tpArea.removeEventListener('touchcancel', onAreaTouchEnd);
            tpArea.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }
        if (btnLeft) {
            btnLeft.removeEventListener('touchstart', onLeftStart);
            btnLeft.removeEventListener('touchend', onLeftEnd);
            btnLeft.removeEventListener('touchcancel', onLeftEnd);
            btnLeft.removeEventListener('mousedown', onLeftStart);
            btnLeft.removeEventListener('mouseup', onLeftEnd);
            btnLeft.classList.remove('active');
        }
        if (btnRight) {
            btnRight.removeEventListener('touchstart', onRightStart);
            btnRight.removeEventListener('touchend', onRightEnd);
            btnRight.removeEventListener('touchcancel', onRightEnd);
            btnRight.removeEventListener('mousedown', onRightStart);
            btnRight.removeEventListener('mouseup', onRightEnd);
            btnRight.classList.remove('active');
        }
    }

    // ==============================
    // TOGGLE TOUCHPAD ON / OFF
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

            clicks = 0;
            maxTouches = 0;
            hasMoved = false;
            isTapDragging = false;
            isThreeFingerDragging = false;
            mouseDown = false;
            mouseMoved = false;
            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;

            bindListeners();
        });

        socket.emit('connectTouchpad', null);
    }

    function disable() {
        if (!isEnabled && !isConnecting) return;
        haptic(50);
        unbindListeners();

        if (isTapDragging || isThreeFingerDragging) {
            emitTP(1, 0x110, 0);
            isTapDragging = false;
            isThreeFingerDragging = false;
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
    // SETTINGS MODAL INTEGRATION
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

        var settingsBtn = document.getElementById('btn-settings');
        if (settingsBtn) settingsBtn.addEventListener('click', syncSettingsUI);
    }

    // ==============================
    // INITIALIZATION
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

        if (overlay) {
            overlay.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                return false;
            });
        }

        initSettingsListeners();
        syncSettingsUI();

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
