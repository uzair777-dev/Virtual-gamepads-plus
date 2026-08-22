/**
 * Keyboard Touchpad Extension
 * Full-featured Multi-Touch Touchpad & Gesture Engine for keyboard.html.
 *
 * ✌️ Two-Finger Gestures:
 *   - 2-Finger Tap: Right Click (BTN_RIGHT)
 *   - 2-Finger Vertical Scroll: Smooth integer detent scrolling (Natural Scrolling option)
 *   - 2-Finger Horizontal Scroll: Horizontal panning (REL_HWHEEL) with axis locking
 *   - 2-Finger Pinch In / Out: Zoom in and out (Ctrl + REL_WHEEL)
 *   - 2-Finger Horizontal Swipe: Browser Back (Alt+Left) / Forward (Alt+Right)
 *   - 2-Finger Double-Tap: Middle Click (BTN_MIDDLE)
 *
 * 🖐️ Three-Finger Gestures:
 *   - 3-Finger Tap: Middle Click (BTN_MIDDLE)
 *   - 3-Finger Continuous Drag: 3-Finger Drag & Drop (BTN_LEFT hold + move)
 *   - 3-Finger Swipe Up: Window Overview / Mission Control (Super key)
 *   - 3-Finger Swipe Down: Show Desktop / Minimize All (Super + D)
 *   - 3-Finger Swipe Left / Right: Switch Workspace (Ctrl + Alt + Left/Right)
 *
 * 👆 One-Finger Gestures:
 *   - 1-Finger Instant Subpixel Cursor Move: 0ms lag, zero deadzone, jump-free transitions
 *   - 1-Finger Tap-to-Drag: Double-tap and hold to drag
 *   - 1-Finger Tap: Left Click (BTN_LEFT)
 *   - Two-Handed Drag: Hold Left Button + move finger on touchpad
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
        leftHandMode: false,
        pinchToZoom: true,
        horizontalScroll: true,
        threeFingerSwipes: true
    };

    var LS_KEY = 'touchpadSettings';
    var localStorageOK = (typeof Storage !== 'undefined');

    var tpSettings = {
        speed: DEFAULTS.speed,
        acceleration: DEFAULTS.acceleration,
        naturalScrolling: DEFAULTS.naturalScrolling,
        leftHandMode: DEFAULTS.leftHandMode,
        pinchToZoom: DEFAULTS.pinchToZoom,
        horizontalScroll: DEFAULTS.horizontalScroll,
        threeFingerSwipes: DEFAULTS.threeFingerSwipes
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
            if (p.pinchToZoom != null)
                tpSettings.pinchToZoom = !!p.pinchToZoom;
            if (p.horizontalScroll != null)
                tpSettings.horizontalScroll = !!p.horizontalScroll;
            if (p.threeFingerSwipes != null)
                tpSettings.threeFingerSwipes = !!p.threeFingerSwipes;
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
                leftHandMode: tpSettings.leftHandMode,
                pinchToZoom: tpSettings.pinchToZoom,
                horizontalScroll: tpSettings.horizontalScroll,
                threeFingerSwipes: tpSettings.threeFingerSwipes
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
    var clicks = 0; // bitmask: 1 = left, 2 = right

    // Dynamic Touch Transition Tracker
    var lastTouchCount = 0;

    // 1-Finger state
    var oneFingerStartTime = 0;
    var oneFingerStartX = 0;
    var oneFingerStartY = 0;
    var prevOneX = 0;
    var prevOneY = 0;
    var oneFingerMoved = false;
    var totalOneDist = 0;

    // Tap-to-drag state
    var lastTapTime = 0;
    var lastTapX = 0;
    var lastTapY = 0;
    var isTapDragging = false;

    // 2-Finger state
    var twoFingerStartTime = 0;
    var twoFingerStartX = 0;
    var twoFingerStartY = 0;
    var twoFingerSpan0 = 0;
    var prevMidX = 0;
    var prevMidY = 0;
    var prevSpan = 0;
    var twoFingerMoved = false;
    var isPinching = false;
    var lastTwoFingerTapTime = 0;

    // 3-Finger state
    var threeFingerStartTime = 0;
    var threeFingerStartX = 0;
    var threeFingerStartY = 0;
    var prevCentroidX = 0;
    var prevCentroidY = 0;
    var threeFingerMoved = false;
    var isThreeFingerDragging = false;

    // Accumulators
    var accumX = 0.0;
    var accumY = 0.0;
    var scrollAccumY = 0.0;
    var scrollAccumX = 0.0;
    var zoomAccum = 0.0;

    // Desktop mouse fallback
    var mouseDown = false;
    var mouseMoved = false;

    // DOM Elements
    var toggleBtn, toggleIcon, overlay, kbContainer;
    var tpArea, btnLeft, btnRight;

    // ==============================
    // EMIT HELPERS
    // ==============================
    function emitTP(evType, code, value) {
        if (!socket) return;
        var payload = {
            type: evType,
            code: code,
            value: Math.round(value) || 0
        };
        if (touchpadId != null) payload.touchpadId = touchpadId;
        socket.emit('touchpadEvent', payload);
    }

    function emitClick(code, hapticMs) {
        haptic(hapticMs || 35);
        emitTP(1 /* EV_KEY */, code, 1);
        setTimeout(function () {
            emitTP(1 /* EV_KEY */, code, 0);
        }, 45);
    }

    function emitKB(code, value) {
        if (!socket) return;
        var ev = {
            type: 0x01,
            code: code,
            value: value,
            hardware: false
        };
        socket.emit('boardEvent', ev);
        socket.emit('keyboardEvent', ev);
    }

    function emitKeyCombo(keys) {
        if (!socket || !keys || !keys.length) return;
        for (var i = 0; i < keys.length; i++) {
            emitKB(keys[i], 1);
        }
        setTimeout(function () {
            for (var j = keys.length - 1; j >= 0; j--) {
                emitKB(keys[j], 0);
            }
        }, 50);
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

    var isChordingMiddle = false;

    // ==============================
    // DEDICATED BOTTOM BUTTONS (with Left+Right Middle Click Chording)
    // ==============================
    function onLeftStart(e) {
        if (e && e.cancelable) e.preventDefault();
        haptic(30);
        clicks |= 1;
        if (btnLeft) btnLeft.classList.add('active');
        if ((clicks & 3) === 3) {
            isChordingMiddle = true;
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
            emitTP(1 /* EV_KEY */, rightBtnCode(), 0);
            emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
            haptic(45);
        } else if (!isTapDragging && !isThreeFingerDragging) {
            emitTP(1 /* EV_KEY */, leftBtnCode(), 1);
        }
    }

    function onLeftEnd(e) {
        if (e && e.cancelable) e.preventDefault();
        clicks &= ~1;
        if (btnLeft) btnLeft.classList.remove('active');
        if (isChordingMiddle) {
            emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
            isChordingMiddle = false;
            if (clicks & 2) emitTP(1 /* EV_KEY */, rightBtnCode(), 1);
        } else if (!isTapDragging && !isThreeFingerDragging) {
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
        }
    }

    function onRightStart(e) {
        if (e && e.cancelable) e.preventDefault();
        haptic(30);
        clicks |= 2;
        if (btnRight) btnRight.classList.add('active');
        if ((clicks & 3) === 3) {
            isChordingMiddle = true;
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
            emitTP(1 /* EV_KEY */, rightBtnCode(), 0);
            emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
            haptic(45);
        } else {
            emitTP(1 /* EV_KEY */, rightBtnCode(), 1);
        }
    }

    function onRightEnd(e) {
        if (e && e.cancelable) e.preventDefault();
        clicks &= ~2;
        if (btnRight) btnRight.classList.remove('active');
        if (isChordingMiddle) {
            emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
            isChordingMiddle = false;
            if (clicks & 1) emitTP(1 /* EV_KEY */, leftBtnCode(), 1);
        } else {
            emitTP(1 /* EV_KEY */, rightBtnCode(), 0);
        }
    }

    // ==============================
    // TOUCHPAD AREA GESTURES (e.targetTouches)
    // ==============================
    function onAreaTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        var num = e.targetTouches.length;
        lastTouchCount = num;
        var now = Date.now();

        if (num === 1) {
            var t = e.targetTouches[0];
            var timeSinceLastTap = now - lastTapTime;
            var distFromLastTap = Math.hypot(t.pageX - lastTapX, t.pageY - lastTapY);

            // Double-tap and hold -> Tap-to-Drag
            if (timeSinceLastTap < 320 && distFromLastTap < 40) {
                isTapDragging = true;
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                haptic(30);
            } else {
                isTapDragging = false;
            }

            oneFingerStartTime = now;
            oneFingerStartX = t.pageX;
            oneFingerStartY = t.pageY;
            prevOneX = t.pageX;
            prevOneY = t.pageY;
            oneFingerMoved = false;
            totalOneDist = 0;
            accumX = 0;
            accumY = 0;

        } else if (num === 2) {
            if (isTapDragging) {
                emitTP(1, 0x110, 0);
                isTapDragging = false;
            }
            var t0 = e.targetTouches[0];
            var t1 = e.targetTouches[1];
            twoFingerStartTime = now;
            twoFingerSpan0 = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
            prevSpan = twoFingerSpan0;
            var midX = (t0.pageX + t1.pageX) / 2;
            var midY = (t0.pageY + t1.pageY) / 2;
            twoFingerStartX = midX;
            twoFingerStartY = midY;
            prevMidX = midX;
            prevMidY = midY;
            twoFingerMoved = false;
            isPinching = false;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;

        } else if (num === 3) {
            if (isTapDragging) {
                emitTP(1, 0x110, 0);
                isTapDragging = false;
            }
            var ta = e.targetTouches[0];
            var tb = e.targetTouches[1];
            var tc = e.targetTouches[2];
            threeFingerStartTime = now;
            var cX = (ta.pageX + tb.pageX + tc.pageX) / 3;
            var cY = (ta.pageY + tb.pageY + tc.pageY) / 3;
            threeFingerStartX = cX;
            threeFingerStartY = cY;
            prevCentroidX = cX;
            prevCentroidY = cY;
            threeFingerMoved = false;
            isThreeFingerDragging = false;
            accumX = 0;
            accumY = 0;
        }
    }

    function onAreaTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        var num = e.targetTouches.length;
        var spd = tpSettings.speed;
        var acc = tpSettings.acceleration;

        // ── Seamless Transition Anchor Check ──
        if (num !== lastTouchCount) {
            lastTouchCount = num;
            if (num === 1) {
                var tr = e.targetTouches[0];
                prevOneX = tr.pageX;
                prevOneY = tr.pageY;
                accumX = 0;
                accumY = 0;
                if (isPinching) { emitKB(29, 0); isPinching = false; }
                return;
            } else if (num === 2) {
                var t0 = e.targetTouches[0];
                var t1 = e.targetTouches[1];
                twoFingerSpan0 = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
                prevSpan = twoFingerSpan0;
                prevMidX = (t0.pageX + t1.pageX) / 2;
                prevMidY = (t0.pageY + t1.pageY) / 2;
                scrollAccumY = 0; scrollAccumX = 0; zoomAccum = 0;
                return;
            } else if (num === 3) {
                var ta = e.targetTouches[0];
                var tb = e.targetTouches[1];
                var tc = e.targetTouches[2];
                prevCentroidX = (ta.pageX + tb.pageX + tc.pageX) / 3;
                prevCentroidY = (ta.pageY + tb.pageY + tc.pageY) / 3;
                accumX = 0; accumY = 0;
                return;
            }
        }

        if (num === 1) {
            // ── 1-Finger Instant Subpixel Cursor Movement ──
            var t = e.targetTouches[0];
            if (!t) return;
            var dx = t.pageX - prevOneX;
            var dy = t.pageY - prevOneY;
            prevOneX = t.pageX;
            prevOneY = t.pageY;

            totalOneDist += Math.abs(dx) + Math.abs(dy);
            if (totalOneDist > 3) oneFingerMoved = true;

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

        } else if (num === 2) {
            // ── 2-Finger Scrolling & Pinch-to-Zoom ──
            var t0 = e.targetTouches[0];
            var t1 = e.targetTouches[1];
            if (!t0 || !t1) return;

            var currentSpan = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
            var midX = (t0.pageX + t1.pageX) / 2;
            var midY = (t0.pageY + t1.pageY) / 2;
            var dSpan = currentSpan - prevSpan;
            var dMidX = midX - prevMidX;
            var dMidY = midY - prevMidY;
            prevSpan = currentSpan;
            prevMidX = midX;
            prevMidY = midY;

            var spanDeltaTotal = Math.abs(currentSpan - twoFingerSpan0);
            var midDeltaTotal = Math.hypot(midX - twoFingerStartX, midY - twoFingerStartY);

            if (spanDeltaTotal > 15 || midDeltaTotal > 6) {
                twoFingerMoved = true;
            }

            if (tpSettings.pinchToZoom && (isPinching || (spanDeltaTotal > 25 && spanDeltaTotal > 1.3 * midDeltaTotal))) {
                // ── Pinch-to-Zoom Mode (Ctrl + Wheel) ──
                isPinching = true;
                zoomAccum += dSpan * 0.09;
                var zoomSteps = Math.trunc(zoomAccum);
                if (zoomSteps !== 0) {
                    zoomAccum -= zoomSteps;
                    emitKB(29 /* KEY_LEFTCTRL */, 1);
                    emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, zoomSteps);
                }

            } else {
                // ── 2D Scroll / Pan Mode (with Axis Locking) ──
                var scrollSign = tpSettings.naturalScrolling ? 1 : -1;
                var moveY = dMidY;
                var moveX = dMidX;

                // Axis locking: lock to pure vertical or horizontal if movement is predominantly in one axis
                if (Math.abs(moveY) > 2.2 * Math.abs(moveX)) {
                    moveX = 0;
                } else if (Math.abs(moveX) > 2.2 * Math.abs(moveY)) {
                    moveY = 0;
                }

                scrollAccumY += (moveY * scrollSign * 0.15 * spd);
                if (tpSettings.horizontalScroll) {
                    scrollAccumX += (moveX * scrollSign * 0.15 * spd);
                }

                var wheelY = Math.trunc(scrollAccumY);
                var wheelX = Math.trunc(scrollAccumX);

                if (wheelY !== 0) {
                    scrollAccumY -= wheelY;
                    emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelY);
                }
                if (wheelX !== 0) {
                    scrollAccumX -= wheelX;
                    emitTP(2 /* EV_REL */, 6 /* REL_HWHEEL */, wheelX);
                }
            }

        } else if (num === 3) {
            // ── 3-Finger Gesture (Drag & Drop vs. Navigation Swipe) ──
            var ta = e.targetTouches[0];
            var tb = e.targetTouches[1];
            var tc = e.targetTouches[2];
            if (!ta || !tb || !tc) return;

            var cX = (ta.pageX + tb.pageX + tc.pageX) / 3;
            var cY = (ta.pageY + tb.pageY + tc.pageY) / 3;
            var dCentroidX = cX - prevCentroidX;
            var dCentroidY = cY - prevCentroidY;
            prevCentroidX = cX;
            prevCentroidY = cY;

            var totalCentroidDist = Math.hypot(cX - threeFingerStartX, cY - threeFingerStartY);
            if (totalCentroidDist > 8) threeFingerMoved = true;

            var elapsed = Date.now() - threeFingerStartTime;

            // If sustained continuous drag or swipes disabled -> 3-Finger Drag & Drop
            if (!tpSettings.threeFingerSwipes || elapsed > 220) {
                if (!isThreeFingerDragging && clicks === 0 && !isTapDragging) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                    isThreeFingerDragging = true;
                }

                var rawX = (dCentroidX >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dCentroidX), acc);
                var rawY = (dCentroidY >= 0 ? 1 : -1) * Math.pow(Math.abs(spd * dCentroidY), acc);
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
            }
        }
    }

    function onAreaTouchEnd(e) {
        if (e.cancelable) e.preventDefault();
        var remaining = e.targetTouches.length;
        lastTouchCount = remaining;

        // Release Ctrl if pinch-to-zoom was active
        if (isPinching) {
            emitKB(29 /* KEY_LEFTCTRL */, 0);
            isPinching = false;
        }

        if (remaining === 1) {
            // Re-anchor remaining finger so continuing to drag won't cause cursor jumps
            var tRem = e.targetTouches[0];
            prevOneX = tRem.pageX;
            prevOneY = tRem.pageY;
            accumX = 0;
            accumY = 0;
            oneFingerMoved = true; // don't fire tap-click on final release

        } else if (remaining === 2) {
            var t0 = e.targetTouches[0];
            var t1 = e.targetTouches[1];
            twoFingerSpan0 = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
            prevSpan = twoFingerSpan0;
            prevMidX = (t0.pageX + t1.pageX) / 2;
            prevMidY = (t0.pageY + t1.pageY) / 2;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;
            twoFingerMoved = true;
            if (isThreeFingerDragging) {
                emitTP(1, 0x110, 0);
                isThreeFingerDragging = false;
            }

        } else if (remaining === 0) {
            // All fingers lifted
            var now = Date.now();

            if (isTapDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isTapDragging = false;
                lastTapTime = 0;

            } else if (isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isThreeFingerDragging = false;
                lastTapTime = 0;

            } else if (threeFingerStartTime > 0 && threeFingerMoved) {
                // Check 3-Finger Navigation Swipes
                var dur3 = now - threeFingerStartTime;
                var total3X = prevCentroidX - threeFingerStartX;
                var total3Y = prevCentroidY - threeFingerStartY;
                var dist3 = Math.hypot(total3X, total3Y);

                if (tpSettings.threeFingerSwipes && dur3 < 380 && dist3 > 45) {
                    if (Math.abs(total3Y) > 1.4 * Math.abs(total3X)) {
                        if (total3Y < 0) {
                            // 3-Finger Swipe Up -> Overview / Mission Control (Super)
                            emitKeyCombo([125 /* KEY_LEFTMETA */]);
                            haptic(50);
                        } else {
                            // 3-Finger Swipe Down -> Show Desktop (Super + D)
                            emitKeyCombo([125 /* KEY_LEFTMETA */, 32 /* KEY_D */]);
                            haptic(50);
                        }
                    } else if (Math.abs(total3X) > 1.4 * Math.abs(total3Y)) {
                        if (total3X > 0) {
                            // 3-Finger Swipe Right -> Switch Workspace Left (Ctrl + Alt + Left)
                            emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 105 /* Left */]);
                            haptic(50);
                        } else {
                            // 3-Finger Swipe Left -> Switch Workspace Right (Ctrl + Alt + Right)
                            emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 106 /* Right */]);
                            haptic(50);
                        }
                    }
                }
                threeFingerStartTime = 0;

            } else if (threeFingerStartTime > 0 && !threeFingerMoved && (now - threeFingerStartTime < 320)) {
                // ── 3-Finger Tap -> Middle Click ──
                emitClick(0x112 /* BTN_MIDDLE */, 45);
                threeFingerStartTime = 0;
                lastTapTime = 0;

            } else if (twoFingerStartTime > 0 && twoFingerMoved) {
                // Check 2-Finger Fast Horizontal Swipe (Browser Back / Forward)
                var dur2 = now - twoFingerStartTime;
                var total2X = prevMidX - twoFingerStartX;
                var total2Y = prevMidY - twoFingerStartY;

                if (dur2 < 320 && Math.abs(total2X) > 75 && Math.abs(total2X) > 2.5 * Math.abs(total2Y)) {
                    if (total2X > 0) {
                        // Swipe Left-to-Right -> Browser Back (Alt + Left)
                        emitKeyCombo([56 /* KEY_LEFTALT */, 105 /* KEY_LEFT */]);
                        haptic(40);
                    } else {
                        // Swipe Right-to-Left -> Browser Forward (Alt + Right)
                        emitKeyCombo([56 /* KEY_LEFTALT */, 106 /* KEY_RIGHT */]);
                        haptic(40);
                    }
                }
                twoFingerStartTime = 0;

            } else if (twoFingerStartTime > 0 && !twoFingerMoved && (now - twoFingerStartTime < 320)) {
                // ── 2-Finger Tap / Double-Tap ──
                var timeSinceLast2Tap = now - lastTwoFingerTapTime;
                if (timeSinceLast2Tap < 300) {
                    // 2-Finger Double-Tap -> Middle Click
                    emitClick(0x112 /* BTN_MIDDLE */, 45);
                    lastTwoFingerTapTime = 0;
                } else {
                    // 2-Finger Tap -> Right Click
                    emitClick(0x111 /* BTN_RIGHT */, 35);
                    lastTwoFingerTapTime = now;
                }
                twoFingerStartTime = 0;
                lastTapTime = 0;

            } else if (oneFingerStartTime > 0 && !oneFingerMoved && (now - oneFingerStartTime < 320) && clicks === 0) {
                // ── 1-Finger Tap -> Left Click ──
                emitClick(0x110 /* BTN_LEFT */, 25);
                lastTapTime = now;
                lastTapX = oneFingerStartX;
                lastTapY = oneFingerStartY;
                oneFingerStartTime = 0;

            } else {
                lastTapTime = 0;
                oneFingerStartTime = 0;
                twoFingerStartTime = 0;
                threeFingerStartTime = 0;
            }

            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;
        }
    }

    // ==============================
    // DESKTOP MOUSE FALLBACK
    // ==============================
    function onMouseDown(e) {
        if (e.button !== 0) return;
        mouseDown = true;
        mouseMoved = false;
        prevOneX = e.pageX;
        prevOneY = e.pageY;
        accumX = 0;
        accumY = 0;
    }

    function onMouseMove(e) {
        if (!mouseDown) return;
        var dx = e.pageX - prevOneX;
        var dy = e.pageY - prevOneY;
        prevOneX = e.pageX;
        prevOneY = e.pageY;

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
            lastTouchCount = 0;
            oneFingerMoved = false;
            twoFingerMoved = false;
            threeFingerMoved = false;
            isTapDragging = false;
            isThreeFingerDragging = false;
            isPinching = false;
            mouseDown = false;
            mouseMoved = false;
            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;

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
        if (isPinching) {
            emitKB(29, 0);
            isPinching = false;
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
        el = document.getElementById('settings-pinch-zoom');
        if (el) el.checked = tpSettings.pinchToZoom;
        el = document.getElementById('settings-horizontal-scroll');
        if (el) el.checked = tpSettings.horizontalScroll;
        el = document.getElementById('settings-3finger-swipes');
        if (el) el.checked = tpSettings.threeFingerSwipes;
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
                var pzEl = document.getElementById('settings-pinch-zoom');
                if (pzEl) tpSettings.pinchToZoom = pzEl.checked;
                var hsEl = document.getElementById('settings-horizontal-scroll');
                if (hsEl) tpSettings.horizontalScroll = hsEl.checked;
                var swEl = document.getElementById('settings-3finger-swipes');
                if (swEl) tpSettings.threeFingerSwipes = swEl.checked;
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
