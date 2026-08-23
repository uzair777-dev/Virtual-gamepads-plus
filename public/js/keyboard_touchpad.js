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
        speed: 1.0,
        acceleration: 1.2,
        scrollSensitivity: 1.0,
        naturalScrolling: false,
        leftHandMode: false,
        pinchToZoom: true,
        horizontalScroll: true,
        threeFingerSwipes: true,
        inertialScrolling: true,
        dragLock: true,
        edgeScroll: 'none', // 'none' | 'right' | 'left' | 'both'
        edgeScrollThickness: 12 // Percentage (5 to 30)
    };

    var LS_KEY = 'touchpadSettings';
    var localStorageOK = (typeof Storage !== 'undefined');

    var tpSettings = {
        speed: DEFAULTS.speed,
        acceleration: DEFAULTS.acceleration,
        scrollSensitivity: DEFAULTS.scrollSensitivity,
        naturalScrolling: DEFAULTS.naturalScrolling,
        leftHandMode: DEFAULTS.leftHandMode,
        pinchToZoom: DEFAULTS.pinchToZoom,
        horizontalScroll: DEFAULTS.horizontalScroll,
        threeFingerSwipes: DEFAULTS.threeFingerSwipes,
        inertialScrolling: DEFAULTS.inertialScrolling,
        dragLock: DEFAULTS.dragLock,
        edgeScroll: DEFAULTS.edgeScroll,
        edgeScrollThickness: DEFAULTS.edgeScrollThickness
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
            if (p.scrollSensitivity != null && !isNaN(p.scrollSensitivity))
                tpSettings.scrollSensitivity = parseFloat(p.scrollSensitivity);
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
            if (p.inertialScrolling != null)
                tpSettings.inertialScrolling = !!p.inertialScrolling;
            if (p.dragLock != null)
                tpSettings.dragLock = !!p.dragLock;
            if (p.edgeScroll != null)
                tpSettings.edgeScroll = p.edgeScroll;
            if (p.edgeScrollThickness != null && !isNaN(p.edgeScrollThickness))
                tpSettings.edgeScrollThickness = parseInt(p.edgeScrollThickness, 10);
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
                scrollSensitivity: tpSettings.scrollSensitivity,
                naturalScrolling: tpSettings.naturalScrolling,
                leftHandMode: tpSettings.leftHandMode,
                pinchToZoom: tpSettings.pinchToZoom,
                horizontalScroll: tpSettings.horizontalScroll,
                threeFingerSwipes: tpSettings.threeFingerSwipes,
                inertialScrolling: tpSettings.inertialScrolling,
                dragLock: tpSettings.dragLock,
                edgeScroll: tpSettings.edgeScroll,
                edgeScrollThickness: tpSettings.edgeScrollThickness
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

    // ==============================
    // PRECISION TOUCH ENGINE (1€ Filter, Ballistics, Inertial Scroll)
    // ==============================
    function LowPassFilter(alpha, initVal) {
        this.y = initVal != null ? initVal : 0;
        this.s = this.y;
        this.alpha = alpha || 1.0;
        this.hasInit = initVal != null;
    }
    LowPassFilter.prototype.filter = function (value, alpha) {
        if (alpha != null) this.alpha = alpha;
        if (!this.hasInit) {
            this.y = value;
            this.s = value;
            this.hasInit = true;
            return value;
        }
        this.y = value;
        this.s = this.alpha * value + (1.0 - this.alpha) * this.s;
        return this.s;
    };
    LowPassFilter.prototype.reset = function (val) {
        this.hasInit = false;
        if (val != null) {
            this.y = val;
            this.s = val;
            this.hasInit = true;
        }
    };

    function OneEuroFilter(minCutoff, beta, dCutoff) {
        this.minCutoff = minCutoff || 1.0;
        this.beta = beta || 0.008;
        this.dCutoff = dCutoff || 1.0;
        this.xFilter = new LowPassFilter();
        this.dxFilter = new LowPassFilter();
        this.lastTime = 0;
    }
    OneEuroFilter.prototype.alpha = function (cutoff, dt) {
        var tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    };
    OneEuroFilter.prototype.filter = function (x, timestamp) {
        if (!this.lastTime || timestamp <= this.lastTime) {
            this.lastTime = timestamp;
            return this.xFilter.filter(x, 1.0);
        }
        var dt = (timestamp - this.lastTime) / 1000.0;
        if (dt <= 0 || dt > 0.1) dt = 0.016;
        this.lastTime = timestamp;

        var prevX = this.xFilter.s;
        var dx = (this.xFilter.hasInit) ? (x - prevX) / dt : 0;
        var edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));
        var cutoff = this.minCutoff + this.beta * Math.abs(edx);
        return this.xFilter.filter(x, this.alpha(cutoff, dt));
    };
    OneEuroFilter.prototype.reset = function (x) {
        this.lastTime = 0;
        this.xFilter.reset(x);
        this.dxFilter.reset(0);
    };

    var filter1X = new OneEuroFilter(1.2, 0.008, 1.0);
    var filter1Y = new OneEuroFilter(1.2, 0.008, 1.0);

    function applyBallistics(dx, dy, dt, speed, accelCurve) {
        if (dt <= 0 || dt > 0.1) dt = 0.016;
        var dist = Math.hypot(dx, dy);
        if (dist < 0.001) return { x: 0, y: 0 };

        var v = dist / (dt * 1000); // px/ms
        var vThresh = 0.38;
        var accelFactor = (accelCurve > 1.0)
            ? (1.0 + (accelCurve - 1.0) * (Math.pow(v, 1.7) / (Math.pow(vThresh, 1.7) + Math.pow(v, 1.7))))
            : 1.0;

        var gain = speed * accelFactor;
        return {
            x: dx * gain,
            y: dy * gain
        };
    }

    // Inertial momentum scrolling
    var momentumAnimId = null;
    var momentumVelX = 0;
    var momentumVelY = 0;
    var recentScrollDeltas = [];

    function recordScrollVelocity(dx, dy, now) {
        recentScrollDeltas.push({ dx: dx, dy: dy, t: now });
        if (recentScrollDeltas.length > 5) recentScrollDeltas.shift();
    }

    function cancelInertialScroll() {
        if (momentumAnimId != null) {
            cancelAnimationFrame(momentumAnimId);
            momentumAnimId = null;
        }
        momentumVelX = 0;
        momentumVelY = 0;
        recentScrollDeltas = [];
    }

    function startInertialScroll(onStep) {
        cancelInertialScroll();
        if (!recentScrollDeltas.length) return;
        var now = Date.now();
        var valid = recentScrollDeltas.filter(function (s) { return (now - s.t) < 110; });
        if (valid.length < 2) return;

        var sumDx = 0, sumDy = 0, sumDt = 0;
        for (var i = 1; i < valid.length; i++) {
            var dt = valid[i].t - valid[i - 1].t;
            if (dt > 0) {
                sumDx += valid[i].dx;
                sumDy += valid[i].dy;
                sumDt += dt;
            }
        }
        if (sumDt <= 0) return;
        momentumVelX = (sumDx / sumDt) * 16;
        momentumVelY = (sumDy / sumDt) * 16;

        if (Math.hypot(momentumVelX, momentumVelY) < 1.6) return;

        function step() {
            momentumVelX *= 0.94;
            momentumVelY *= 0.94;
            if (Math.abs(momentumVelX) < 0.2 && Math.abs(momentumVelY) < 0.2) {
                cancelInertialScroll();
                return;
            }
            onStep(momentumVelX, momentumVelY);
            momentumAnimId = requestAnimationFrame(step);
        }
        momentumAnimId = requestAnimationFrame(step);
    }

    // ==============================
    // DOUBLE-TAP & DRAG STATE MACHINE
    // ==============================
    var TAP_STATE_IDLE = 0;
    var TAP_STATE_FIRST_DOWN = 1;
    var TAP_STATE_PENDING_SECOND = 2;
    var TAP_STATE_DRAGGING = 3;
    var TAP_STATE_DRAG_REPOSITION = 4;

    var tapState = TAP_STATE_IDLE;
    var tapTimer = null;
    var dragRepositionTimer = null;
    var firstTapX = 0;
    var firstTapY = 0;
    var firstTapTime = 0;
    var firstTapMoved = false;

    function clearTapTimers() {
        if (tapTimer != null) {
            clearTimeout(tapTimer);
            tapTimer = null;
        }
        if (dragRepositionTimer != null) {
            clearTimeout(dragRepositionTimer);
            dragRepositionTimer = null;
        }
    }

    function cancelTapDragState(sendRelease) {
        clearTapTimers();
        if (tapState === TAP_STATE_DRAGGING || tapState === TAP_STATE_DRAG_REPOSITION) {
            if (sendRelease) emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
        }
        tapState = TAP_STATE_IDLE;
        firstTapMoved = false;
    }

    var lastTouchCount = 0;
    var lastMultiTouchLiftTime = 0;
    var isThreeFingerDragging = false;
    var isChordingMiddle = false;

    // 1-Finger Tracking
    var oneFingerStartTime = 0;
    var oneFingerStartX = 0;
    var oneFingerStartY = 0;
    var prevOneX = 0;
    var prevOneY = 0;
    var prevOneTime = 0;
    var oneFingerMoved = false;

    // 2-Finger Tracking
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
    var touch0PrevX = 0, touch0PrevY = 0;
    var touch1PrevX = 0, touch1PrevY = 0;

    // 3-Finger Tracking
    var threeFingerStartTime = 0;
    var threeFingerStartX = 0;
    var threeFingerStartY = 0;
    var prevCentroidX = 0;
    var prevCentroidY = 0;
    var threeFingerMoved = false;

    // Accumulators
    var accumX = 0.0;
    var accumY = 0.0;
    var scrollAccumY = 0.0;
    var scrollAccumX = 0.0;
    var zoomAccum = 0.0;

    // Edge scrolling state
    var isEdgeScrolling = false;
    var edgeScrollAccumY = 0.0;

    // Desktop mouse fallback
    var mouseDown = false;
    var mouseMoved = false;

    // DOM Elements
    var toggleBtn, toggleIcon, overlay, kbContainer;
    var tpArea, btnLeft, btnRight;

    function updateEdgeScrollGuide() {
        if (!tpArea) return;
        tpArea.style.setProperty('--edge-zone-width', (tpSettings.edgeScrollThickness || 12) + '%');
        tpArea.classList.remove('edge-scroll-right', 'edge-scroll-left', 'edge-scroll-both', 'edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
        if (tpSettings.edgeScroll === 'right') {
            tpArea.classList.add('edge-scroll-right');
        } else if (tpSettings.edgeScroll === 'left') {
            tpArea.classList.add('edge-scroll-left');
        } else if (tpSettings.edgeScroll === 'both') {
            tpArea.classList.add('edge-scroll-both');
        }
    }

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

    // ==============================
    // DEDICATED BOTTOM BUTTONS (with Left+Right Middle Click Chording)
    // ==============================
    function onLeftStart(e) {
        if (e && e.cancelable) e.preventDefault();
        cancelInertialScroll();
        cancelTapDragState(true);
        haptic(30);
        clicks |= 1;
        if (btnLeft) btnLeft.classList.add('active');
        if ((clicks & 3) === 3) {
            isChordingMiddle = true;
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
            emitTP(1 /* EV_KEY */, rightBtnCode(), 0);
            emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
            haptic(45);
        } else if (!isThreeFingerDragging) {
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
        } else if (!isThreeFingerDragging) {
            emitTP(1 /* EV_KEY */, leftBtnCode(), 0);
        }
    }

    function onRightStart(e) {
        if (e && e.cancelable) e.preventDefault();
        cancelInertialScroll();
        cancelTapDragState(true);
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
        cancelInertialScroll();
        var num = e.targetTouches.length;
        lastTouchCount = num;
        var now = Date.now();

        if (num === 1) {
            var t = e.targetTouches[0];

            // ── Check if touch starts in Edge Scroll Zone ──
            isEdgeScrolling = false;
            if (tpSettings.edgeScroll === 'right' || tpSettings.edgeScroll === 'left' || tpSettings.edgeScroll === 'both') {
                var rect = tpArea ? tpArea.getBoundingClientRect() : null;
                var padW = rect ? rect.width : window.innerWidth;
                var relX = rect ? (t.clientX - rect.left) : t.clientX;
                var thicknessPct = (tpSettings.edgeScrollThickness || 12) / 100;
                var zoneW = Math.max(24, padW * thicknessPct);

                if ((tpSettings.edgeScroll === 'right' || tpSettings.edgeScroll === 'both') && relX >= (padW - zoneW)) {
                    isEdgeScrolling = true;
                    if (tpArea) tpArea.classList.add('edge-scrolling-right', 'edge-scrolling');
                } else if ((tpSettings.edgeScroll === 'left' || tpSettings.edgeScroll === 'both') && relX <= zoneW) {
                    isEdgeScrolling = true;
                    if (tpArea) tpArea.classList.add('edge-scrolling-left', 'edge-scrolling');
                }
            }

            // ── Double-Tap & Drag State Machine Evaluation ──
            if (tapState === TAP_STATE_PENDING_SECOND) {
                var dist = Math.hypot(t.pageX - firstTapX, t.pageY - firstTapY);
                if (dist < 45 && !isEdgeScrolling) {
                    clearTapTimers();
                    tapState = TAP_STATE_DRAGGING;
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                    haptic(30);
                } else {
                    cancelTapDragState(true);
                    tapState = TAP_STATE_FIRST_DOWN;
                    firstTapX = t.pageX;
                    firstTapY = t.pageY;
                    firstTapTime = now;
                    firstTapMoved = false;
                }
            } else if (tapState === TAP_STATE_DRAG_REPOSITION) {
                clearTapTimers();
                tapState = TAP_STATE_DRAGGING;
            } else {
                clearTapTimers();
                tapState = TAP_STATE_FIRST_DOWN;
                firstTapX = t.pageX;
                firstTapY = t.pageY;
                firstTapTime = now;
                firstTapMoved = false;
            }

            oneFingerStartTime = now;
            oneFingerStartX = t.pageX;
            oneFingerStartY = t.pageY;
            prevOneX = t.pageX;
            prevOneY = t.pageY;
            prevOneTime = now;
            oneFingerMoved = false;
            filter1X.reset(t.pageX);
            filter1Y.reset(t.pageY);
            accumX = 0;
            accumY = 0;
            edgeScrollAccumY = 0;

        } else if (num === 2) {
            cancelTapDragState(true);
            isEdgeScrolling = false;
            if (tpArea) tpArea.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

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
            touch0PrevX = t0.pageX; touch0PrevY = t0.pageY;
            touch1PrevX = t1.pageX; touch1PrevY = t1.pageY;
            twoFingerMoved = false;
            isPinching = false;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;
            recentScrollDeltas = [];

        } else if (num === 3) {
            cancelTapDragState(true);
            isEdgeScrolling = false;
            if (tpArea) tpArea.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

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
        var scrSens = tpSettings.scrollSensitivity || 1.0;
        var now = Date.now();

        // ── Seamless Transition Anchor Check ──
        if (num !== lastTouchCount) {
            lastTouchCount = num;
            if (num === 1) {
                var tr = e.targetTouches[0];
                prevOneX = tr.pageX;
                prevOneY = tr.pageY;
                prevOneTime = now;
                filter1X.reset(tr.pageX);
                filter1Y.reset(tr.pageY);
                accumX = 0;
                accumY = 0;
                edgeScrollAccumY = 0;
                if (isPinching) { emitKB(29, 0); isPinching = false; }
                return;
            } else if (num === 2) {
                cancelTapDragState(true);
                isEdgeScrolling = false;
                if (tpArea) tpArea.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
                var t0a = e.targetTouches[0];
                var t1a = e.targetTouches[1];
                twoFingerSpan0 = Math.hypot(t1a.pageX - t0a.pageX, t1a.pageY - t0a.pageY);
                prevSpan = twoFingerSpan0;
                prevMidX = (t0a.pageX + t1a.pageX) / 2;
                prevMidY = (t0a.pageY + t1a.pageY) / 2;
                touch0PrevX = t0a.pageX; touch0PrevY = t0a.pageY;
                touch1PrevX = t1a.pageX; touch1PrevY = t1a.pageY;
                scrollAccumY = 0; scrollAccumX = 0; zoomAccum = 0;
                recentScrollDeltas = [];
                return;
            } else if (num === 3) {
                cancelTapDragState(true);
                isEdgeScrolling = false;
                if (tpArea) tpArea.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
                var taa = e.targetTouches[0];
                var tba = e.targetTouches[1];
                var tca = e.targetTouches[2];
                prevCentroidX = (taa.pageX + tba.pageX + tca.pageX) / 3;
                prevCentroidY = (taa.pageY + tba.pageY + tca.pageY) / 3;
                accumX = 0; accumY = 0;
                return;
            }
        }

        if (num === 1) {
            var t = e.targetTouches[0];
            if (!t) return;

            var dt = (now - prevOneTime) / 1000.0;
            prevOneTime = now;

            // Anti-Jitter Filtered Position
            var filtX = filter1X.filter(t.pageX, now);
            var filtY = filter1Y.filter(t.pageY, now);
            var dx = filtX - filter1X.xFilter.s + (t.pageX - prevOneX);
            var dy = filtY - filter1Y.yFilter.s + (t.pageY - prevOneY);

            // Raw deltas for threshold checks
            var rawDx = t.pageX - prevOneX;
            var rawDy = t.pageY - prevOneY;
            prevOneX = t.pageX;
            prevOneY = t.pageY;

            if (tapState === TAP_STATE_FIRST_DOWN) {
                if (Math.hypot(t.pageX - firstTapX, t.pageY - firstTapY) > 12) {
                    firstTapMoved = true;
                }
            }

            // ── 1-Finger Edge Scrolling Mode ──
            if (isEdgeScrolling) {
                if (Math.abs(rawDy) > 2) oneFingerMoved = true;
                var scrollSign = tpSettings.naturalScrolling ? 1 : -1;
                edgeScrollAccumY += (rawDy * scrollSign * 0.15 * spd * scrSens);
                var wheelY = Math.trunc(edgeScrollAccumY);
                if (wheelY !== 0) {
                    edgeScrollAccumY -= wheelY;
                    emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelY);
                }
                return;
            }

            if (Math.hypot(rawDx, rawDy) > 3) oneFingerMoved = true;

            // Continuous Ballistic Acceleration
            var delta = applyBallistics(rawDx, rawDy, dt, spd, acc);
            accumX += delta.x;
            accumY += delta.y;

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

            // Per-touch velocity vectors
            var v0x = t0.pageX - touch0PrevX;
            var v0y = t0.pageY - touch0PrevY;
            var v1x = t1.pageX - touch1PrevX;
            var v1y = t1.pageY - touch1PrevY;
            var mag0 = Math.hypot(v0x, v0y);
            var mag1 = Math.hypot(v1x, v1y);
            var dot = v0x * v1x + v0y * v1y;
            var alignment = (mag0 > 0.5 && mag1 > 0.5) ? (dot / (mag0 * mag1)) : 1.0;

            prevSpan = currentSpan;
            prevMidX = midX;
            prevMidY = midY;
            touch0PrevX = t0.pageX; touch0PrevY = t0.pageY;
            touch1PrevX = t1.pageX; touch1PrevY = t1.pageY;

            var spanDeltaTotal = Math.abs(currentSpan - twoFingerSpan0);
            var midDeltaTotal = Math.hypot(midX - twoFingerStartX, midY - twoFingerStartY);

            if (spanDeltaTotal > 12 || midDeltaTotal > 6) {
                twoFingerMoved = true;
            }

            // Vector Dot-Product Pinch vs Scroll Disambiguation
            var isOpposingMotion = alignment < -0.2;
            var isSpanDominant = spanDeltaTotal > 24 && spanDeltaTotal > 1.5 * midDeltaTotal;

            if (tpSettings.pinchToZoom && (isPinching || isOpposingMotion || isSpanDominant)) {
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

                // 2D Scroll Orthogonal Axis Locking
                if (Math.abs(moveY) > 2.0 * Math.abs(moveX)) {
                    moveX = 0;
                } else if (Math.abs(moveX) > 2.0 * Math.abs(moveY)) {
                    moveY = 0;
                }

                recordScrollVelocity(moveX, moveY, now);

                scrollAccumY += (moveY * scrollSign * 0.15 * spd * scrSens);
                if (tpSettings.horizontalScroll) {
                    scrollAccumX += (moveX * scrollSign * 0.15 * spd * scrSens);
                }

                var wheelY = Math.trunc(scrollAccumY);
                var wheelX = Math.trunc(scrollAccumX);

                if (wheelY !== 0) {
                    scrollAccumY -= wheelY;
                    emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelY);
                }
                if (wheelX !== 0 && tpSettings.horizontalScroll !== false) {
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

            var elapsed = now - threeFingerStartTime;

            // If sustained continuous drag or swipes disabled -> 3-Finger Drag & Drop
            if (!tpSettings.threeFingerSwipes || elapsed > 220) {
                if (!isThreeFingerDragging && clicks === 0) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                    isThreeFingerDragging = true;
                    haptic(30);
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
                    if (sendX !== 0) emitTP(2 /* EV_REL */, 0 /* REL_X */, sendX);
                    if (sendY !== 0) emitTP(2 /* EV_REL */, 1 /* REL_Y */, sendY);
                }
            }
        }
    }

    function onAreaTouchEnd(e) {
        if (e.cancelable) e.preventDefault();
        var remaining = e.targetTouches.length;
        lastTouchCount = remaining;
        var now = Date.now();

        // Release Ctrl if pinch-to-zoom was active
        if (isPinching) {
            emitKB(29 /* KEY_LEFTCTRL */, 0);
            isPinching = false;
        }
        if (tpArea) tpArea.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

        if (remaining === 1) {
            isEdgeScrolling = false;
            var tRem = e.targetTouches[0];
            prevOneX = tRem.pageX;
            prevOneY = tRem.pageY;
            prevOneTime = now;
            filter1X.reset(tRem.pageX);
            filter1Y.reset(tRem.pageY);
            accumX = 0;
            accumY = 0;
            oneFingerMoved = true;
            lastMultiTouchLiftTime = now;

        } else if (remaining === 2) {
            isEdgeScrolling = false;
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
            lastMultiTouchLiftTime = now;
            if (isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isThreeFingerDragging = false;
            }

        } else if (remaining === 0) {
            // ── Double-Tap & Drag Release State Handling ──
            if (tapState === TAP_STATE_DRAGGING) {
                if (tpSettings.dragLock !== false) {
                    tapState = TAP_STATE_DRAG_REPOSITION;
                    dragRepositionTimer = setTimeout(function () {
                        if (tapState === TAP_STATE_DRAG_REPOSITION) {
                            emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                            tapState = TAP_STATE_IDLE;
                        }
                    }, 250);
                } else {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                    tapState = TAP_STATE_IDLE;
                }

            } else if (isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                isThreeFingerDragging = false;
                cancelTapDragState(false);

            } else if (isEdgeScrolling) {
                if (!oneFingerMoved && (now - oneFingerStartTime < 300) && clicks === 0) {
                    if (now - lastMultiTouchLiftTime > 160) {
                        emitClick(0x110 /* BTN_LEFT */, 25);
                    }
                }
                isEdgeScrolling = false;
                edgeScrollAccumY = 0;
                cancelTapDragState(false);

            } else if (threeFingerStartTime > 0 && threeFingerMoved) {
                // Check 3-Finger Navigation Swipes
                var dur3 = now - threeFingerStartTime;
                var total3X = prevCentroidX - threeFingerStartX;
                var total3Y = prevCentroidY - threeFingerStartY;
                var dist3 = Math.hypot(total3X, total3Y);

                if (tpSettings.threeFingerSwipes && dur3 < 380 && dist3 > 45) {
                    if (Math.abs(total3Y) > 1.4 * Math.abs(total3X)) {
                        if (total3Y < 0) {
                            emitKeyCombo([125 /* KEY_LEFTMETA */]);
                            haptic(50);
                        } else {
                            emitKeyCombo([125 /* KEY_LEFTMETA */, 32 /* KEY_D */]);
                            haptic(50);
                        }
                    } else if (Math.abs(total3X) > 1.4 * Math.abs(total3Y)) {
                        if (total3X > 0) {
                            emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 105 /* Left */]);
                            haptic(50);
                        } else {
                            emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 106 /* Right */]);
                            haptic(50);
                        }
                    }
                }
                threeFingerStartTime = 0;
                cancelTapDragState(false);

            } else if (threeFingerStartTime > 0 && !threeFingerMoved && (now - threeFingerStartTime < 320)) {
                // ── 3-Finger Tap -> Middle Click ──
                emitClick(0x112 /* BTN_MIDDLE */, 45);
                threeFingerStartTime = 0;
                cancelTapDragState(false);

            } else if (twoFingerStartTime > 0 && twoFingerMoved) {
                // Check 2-Finger Fast Horizontal Swipe (Browser Back / Forward)
                var dur2 = now - twoFingerStartTime;
                var total2X = prevMidX - twoFingerStartX;
                var total2Y = prevMidY - twoFingerStartY;

                if (dur2 < 320 && Math.abs(total2X) > 75 && Math.abs(total2X) > 2.5 * Math.abs(total2Y)) {
                    if (total2X > 0) {
                        emitKeyCombo([56 /* KEY_LEFTALT */, 105 /* KEY_LEFT */]);
                        haptic(40);
                    } else {
                        emitKeyCombo([56 /* KEY_LEFTALT */, 106 /* KEY_RIGHT */]);
                        haptic(40);
                    }
                } else if (tpSettings.inertialScrolling !== false && !isPinching) {
                    var spd = tpSettings.speed;
                    var scrSens = tpSettings.scrollSensitivity || 1.0;
                    var scrollSign = tpSettings.naturalScrolling ? 1 : -1;
                    startInertialScroll(function (vx, vy) {
                        scrollAccumY += (vy * scrollSign * 0.15 * spd * scrSens);
                        if (tpSettings.horizontalScroll) {
                            scrollAccumX += (vx * scrollSign * 0.15 * spd * scrSens);
                        }
                        var wy = Math.trunc(scrollAccumY);
                        var wx = Math.trunc(scrollAccumX);
                        if (wy !== 0) {
                            scrollAccumY -= wy;
                            emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wy);
                        }
                        if (wx !== 0 && tpSettings.horizontalScroll !== false) {
                            scrollAccumX -= wx;
                            emitTP(2 /* EV_REL */, 6 /* REL_HWHEEL */, wx);
                        }
                    });
                }
                twoFingerStartTime = 0;
                cancelTapDragState(false);

            } else if (twoFingerStartTime > 0 && !twoFingerMoved && (now - twoFingerStartTime < 320)) {
                // ── 2-Finger Tap / Double-Tap ──
                var timeSinceLast2Tap = now - lastTwoFingerTapTime;
                if (timeSinceLast2Tap < 300) {
                    emitClick(0x112 /* BTN_MIDDLE */, 45);
                    lastTwoFingerTapTime = 0;
                } else {
                    emitClick(0x111 /* BTN_RIGHT */, 35);
                    lastTwoFingerTapTime = now;
                }
                twoFingerStartTime = 0;
                cancelTapDragState(false);

            } else if (tapState === TAP_STATE_FIRST_DOWN) {
                var tapDur = now - firstTapTime;
                var totalDist = Math.hypot(prevOneX - firstTapX, prevOneY - firstTapY);

                if (!firstTapMoved && tapDur < 300 && totalDist < 14 && clicks === 0 && (now - lastMultiTouchLiftTime > 160)) {
                    tapState = TAP_STATE_PENDING_SECOND;
                    tapTimer = setTimeout(function () {
                        if (tapState === TAP_STATE_PENDING_SECOND) {
                            emitClick(0x110 /* BTN_LEFT */, 25);
                            tapState = TAP_STATE_IDLE;
                        }
                    }, 260);
                } else {
                    tapState = TAP_STATE_IDLE;
                }
                oneFingerStartTime = 0;

            } else {
                cancelTapDragState(false);
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
            cancelTapDragState(false);
            cancelInertialScroll();
            isThreeFingerDragging = false;
            isPinching = false;
            isEdgeScrolling = false;
            mouseDown = false;
            mouseMoved = false;
            accumX = 0;
            accumY = 0;
            scrollAccumY = 0;
            scrollAccumX = 0;
            zoomAccum = 0;
            edgeScrollAccumY = 0;

            updateEdgeScrollGuide();
            bindListeners();
        });

        socket.emit('connectTouchpad', null);
    }

    function disable() {
        if (!isEnabled && !isConnecting) return;
        haptic(50);
        unbindListeners();

        cancelTapDragState(true);
        cancelInertialScroll();
        if (isThreeFingerDragging) {
            emitTP(1, 0x110, 0);
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
        el = document.getElementById('settings-scroll-sensitivity');
        if (el) el.value = tpSettings.scrollSensitivity || 1.0;
        el = document.getElementById('settings-scroll-sensitivity-output');
        if (el) el.value = tpSettings.scrollSensitivity || 1.0;
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
        el = document.getElementById('settings-inertial-scroll');
        if (el) el.checked = tpSettings.inertialScrolling !== false;
        el = document.getElementById('settings-drag-lock');
        if (el) el.checked = tpSettings.dragLock !== false;
        el = document.getElementById('settings-edge-scroll');
        if (el) el.value = tpSettings.edgeScroll || 'none';
        el = document.getElementById('settings-edge-scroll-thickness');
        if (el) el.value = tpSettings.edgeScrollThickness || 12;
        el = document.getElementById('settings-edge-scroll-thickness-output');
        if (el) el.value = (tpSettings.edgeScrollThickness || 12) + '%';
        updateEdgeScrollGuide();
    }

    function initSettingsListeners() {
        var speedSlider = document.getElementById('settings-speed');
        var speedOut    = document.getElementById('settings-speed-output');
        var accelSlider = document.getElementById('settings-acceleration');
        var accelOut    = document.getElementById('settings-acceleration-output');
        var sensSlider  = document.getElementById('settings-scroll-sensitivity');
        var sensOut     = document.getElementById('settings-scroll-sensitivity-output');
        var thickSlider = document.getElementById('settings-edge-scroll-thickness');
        var thickOut    = document.getElementById('settings-edge-scroll-thickness-output');
        var form        = document.getElementById('settings-form');

        if (speedSlider && speedOut) {
            speedSlider.addEventListener('input', function () { speedOut.value = this.value; });
        }
        if (accelSlider && accelOut) {
            accelSlider.addEventListener('input', function () { accelOut.value = this.value; });
        }
        if (sensSlider && sensOut) {
            sensSlider.addEventListener('input', function () { sensOut.value = this.value; });
        }
        if (thickSlider && thickOut) {
            thickSlider.addEventListener('input', function () { thickOut.value = this.value + '%'; });
        }

        if (form) {
            form.addEventListener('submit', function () {
                if (speedSlider) tpSettings.speed = parseFloat(speedSlider.value);
                if (accelSlider) tpSettings.acceleration = parseFloat(accelSlider.value);
                if (sensSlider) tpSettings.scrollSensitivity = parseFloat(sensSlider.value);
                if (thickSlider) tpSettings.edgeScrollThickness = parseInt(thickSlider.value, 10);
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
                var inEl = document.getElementById('settings-inertial-scroll');
                if (inEl) tpSettings.inertialScrolling = inEl.checked;
                var dlEl = document.getElementById('settings-drag-lock');
                if (dlEl) tpSettings.dragLock = dlEl.checked;
                var esEl = document.getElementById('settings-edge-scroll');
                if (esEl) tpSettings.edgeScroll = esEl.value;
                updateEdgeScrollGuide();
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
