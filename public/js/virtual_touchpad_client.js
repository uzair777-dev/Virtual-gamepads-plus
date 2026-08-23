var TOUCHPAD = 'touchpad';
var JOYSTICK = 'joystick';

// ==============================
// HAPTIC VIBRATION HELPER
// ==============================
function haptic(ms) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
            navigator.vibrate(ms);
        } catch (e) {}
    }
}

// ==============================
// SETTINGS MANAGER
// ==============================
var settings = (function () {
    var settings = {};
    settings.modal = {};
    settings.modal.isOpen = false;

    var localStorageAvailable = typeof Storage !== "undefined";

    settings.speed = 1.0;
    settings.acceleration = 1.2;
    settings.scrollSensitivity = 1.0;
    settings.naturalScrolling = false;
    settings.leftHandMode = false;
    settings.pinchToZoom = true;
    settings.horizontalScroll = true;
    settings.threeFingerSwipes = true;
    settings.inertialScrolling = true;
    settings.dragLock = true;
    settings.edgeScroll = 'none'; // 'none' | 'right' | 'left' | 'both'
    settings.edgeScrollThickness = 12; // Percentage (5 to 30)

    function applyUIAttributes() {
        var lblLeft = document.getElementById("label-btn_left");
        var lblRight = document.getElementById("label-btn_right");
        if (lblLeft && lblRight) {
            if (settings.leftHandMode) {
                lblLeft.textContent = "Right";
                lblRight.textContent = "Left";
            } else {
                lblLeft.textContent = "Left";
                lblRight.textContent = "Right";
            }
        }
        if (typeof updateEdgeScrollGuide === 'function') {
            updateEdgeScrollGuide();
        }
    }

    settings.update = function (update) {
        if (update.hasOwnProperty('speed')) settings.speed = Math.max(0.1, parseFloat(update.speed) || 1.0);
        if (update.hasOwnProperty('acceleration')) settings.acceleration = Math.max(1.0, parseFloat(update.acceleration) || 1.2);
        if (update.hasOwnProperty('scrollSensitivity')) settings.scrollSensitivity = Math.max(0.1, parseFloat(update.scrollSensitivity) || 1.0);
        if (update.hasOwnProperty('naturalScrolling')) settings.naturalScrolling = !!update.naturalScrolling;
        if (update.hasOwnProperty('leftHandMode')) settings.leftHandMode = !!update.leftHandMode;
        if (update.hasOwnProperty('pinchToZoom')) settings.pinchToZoom = !!update.pinchToZoom;
        if (update.hasOwnProperty('horizontalScroll')) settings.horizontalScroll = !!update.horizontalScroll;
        if (update.hasOwnProperty('threeFingerSwipes')) settings.threeFingerSwipes = !!update.threeFingerSwipes;
        if (update.hasOwnProperty('inertialScrolling')) settings.inertialScrolling = !!update.inertialScrolling;
        if (update.hasOwnProperty('dragLock')) settings.dragLock = !!update.dragLock;
        if (update.hasOwnProperty('edgeScroll')) settings.edgeScroll = update.edgeScroll || 'none';
        if (update.hasOwnProperty('edgeScrollThickness')) settings.edgeScrollThickness = Math.max(5, Math.min(30, parseInt(update.edgeScrollThickness, 10) || 12));

        applyUIAttributes();

        if (localStorageAvailable) {
            window.localStorage.setItem('touchpadSettings', JSON.stringify({
                speed: settings.speed,
                acceleration: settings.acceleration,
                scrollSensitivity: settings.scrollSensitivity,
                naturalScrolling: settings.naturalScrolling,
                leftHandMode: settings.leftHandMode,
                pinchToZoom: settings.pinchToZoom,
                horizontalScroll: settings.horizontalScroll,
                threeFingerSwipes: settings.threeFingerSwipes,
                inertialScrolling: settings.inertialScrolling,
                dragLock: settings.dragLock,
                edgeScroll: settings.edgeScroll,
                edgeScrollThickness: settings.edgeScrollThickness
            }));
        }
    };

    function defaultSettings() {
        return {
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
            edgeScroll: 'none',
            edgeScrollThickness: 12
        };
    }

    function initSettings() {
        if (localStorageAvailable) {
            var raw = window.localStorage.getItem("touchpadSettings");
            if (raw) {
                try {
                    settings.update(JSON.parse(raw));
                } catch (e) {
                    settings.update(defaultSettings());
                }
            } else {
                settings.update(defaultSettings());
            }
        }
    }

    $(document).ready(function () {
        var settingsModal = $("#settings-modal");

        $('#settings-speed').on('input', function () {
            $('#settings-speed-output').val($(this).val());
        });
        $('#settings-acceleration').on('input', function () {
            $('#settings-acceleration-output').val($(this).val());
        });
        $('#settings-scroll-sensitivity').on('input', function () {
            $('#settings-scroll-sensitivity-output').val($(this).val());
        });
        $('#settings-edge-scroll-thickness').on('input', function () {
            $('#settings-edge-scroll-thickness-output').val($(this).val() + '%');
        });

        settings.modal.open = function () {
            initDialog();
            settingsModal.removeClass('closed');
            settings.modal.isOpen = true;
        };
        settings.modal.close = function () {
            settingsModal.addClass('closed');
            settings.modal.isOpen = false;
        };

        function initDialog() {
            $('#settings-speed').val(settings.speed);
            $('#settings-speed-output').val(settings.speed);
            $('#settings-acceleration').val(settings.acceleration);
            $('#settings-acceleration-output').val(settings.acceleration);
            $('#settings-scroll-sensitivity').val(settings.scrollSensitivity || 1.0);
            $('#settings-scroll-sensitivity-output').val(settings.scrollSensitivity || 1.0);
            $('#settings-natural-scroll').prop('checked', !!settings.naturalScrolling);
            $('#settings-left-hand').prop('checked', !!settings.leftHandMode);
            $('#settings-pinch-zoom').prop('checked', settings.pinchToZoom !== false);
            $('#settings-horizontal-scroll').prop('checked', settings.horizontalScroll !== false);
            $('#settings-3finger-swipes').prop('checked', settings.threeFingerSwipes !== false);
            $('#settings-inertial-scroll').prop('checked', settings.inertialScrolling !== false);
            $('#settings-drag-lock').prop('checked', settings.dragLock !== false);
            $('#settings-edge-scroll').val(settings.edgeScroll || 'none');
            $('#settings-edge-scroll-thickness').val(settings.edgeScrollThickness || 12);
            $('#settings-edge-scroll-thickness-output').val((settings.edgeScrollThickness || 12) + '%');
        }

        function bindSubmit() {
            $('#settings-form').submit(function (event) {
                var formData = {};
                $(this).find(':input').each(function (i, e) {
                    e = $(e);
                    var name = e.attr('name');
                    if (name == null) return;
                    var val;
                    if (e.attr('type') === 'checkbox') {
                        val = e.prop('checked');
                    } else {
                        val = e.val();
                    }
                    formData[name] = val;
                });
                settings.update(formData);
                settings.modal.close();
                event.preventDefault();
                event.stopPropagation();
            });
        }

        function bindClose() {
            settingsModal.find(".close").addBack().click(function () {
                settings.modal.close();
            });
            $(".modal").click(function (event) {
                event.stopPropagation();
            });
        }

        initDialog();
        bindClose();
        bindSubmit();
        applyUIAttributes();
    });

    initSettings();
    return settings;
})();

// Prevent context menu anywhere on the page
$(function () {
    $(window).on("contextmenu", function (event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    });
});

// ==============================
// MAIN APP OBJECT
// ==============================
var app = {
    clicks: 0,
    socket: null,
    current_device: TOUCHPAD,

    createJoystickClient: function () {
        // Retain Joystick support if needed
        var menuEl = document.querySelector('body menu');
        var menu_height = menuEl ? menuEl.clientHeight : 0;
        if (typeof Joystick === "undefined") return;

        var stick = new Joystick.CircuralStick({
            start: function () {},
            move: function (abs_coords, rel_coords) {
                app.emit(
                    ["touchpadEvent", 3 /*'EV_ABS'*/, 0 /*'ABS_X'*/, rel_coords.x],
                    ["touchpadEvent", 3 /*'EV_ABS'*/, 1 /*'ABS_Y'*/, rel_coords.y]
                );
            },
            end: function () {},
            analog: true,
            axis_value: 0x7FFF,
            x: document.body.clientWidth / 4,
            y: document.body.clientHeight / 2 + menu_height,
            container: document.getElementById('joystick'),
            autohide: false,
            targeting: true,
            region: function () {
                return [0, menu_height, document.body.clientWidth / 2, document.body.clientHeight];
            }
        });

        var buttons = new Joystick.Buttons({
            x: document.body.clientWidth / 2 + document.body.clientWidth / 4,
            y: document.body.clientHeight / 2,
            container: document.getElementById('joystick'),
            down: function (btn) {
                var code;
                switch (btn) {
                    case 'button_x': code = 0x133; break;
                    case 'button_y': code = 0x134; break;
                    case 'button_a': code = 0x130; break;
                    case 'button_b': code = 0x131; break;
                }
                if (code) app.emit("touchpadEvent", 1 /*'EV_KEY'*/, code, 1);
            },
            up: function (btn) {
                var code;
                switch (btn) {
                    case 'button_x': code = 0x133; break;
                    case 'button_y': code = 0x134; break;
                    case 'button_a': code = 0x130; break;
                    case 'button_b': code = 0x131; break;
                }
                if (code) app.emit("touchpadEvent", 1 /*'EV_KEY'*/, code, 0);
            },
            region: function () {
                return [document.body.clientWidth / 2, menu_height, document.body.clientWidth / 2, document.body.clientHeight];
            }
        });

        window.addEventListener('resize', function () {
            buttons.setPosition(document.body.clientWidth / 2 + document.body.clientWidth / 4, document.body.clientHeight / 2);
        });
    },

    createTouchpadClient: function (options) {
        function leftCode() { return settings.leftHandMode ? 0x111 /* BTN_RIGHT */ : 0x110 /* BTN_LEFT */; }
        function rightCode() { return settings.leftHandMode ? 0x110 /* BTN_LEFT */ : 0x111 /* BTN_RIGHT */; }

        function emitTP(type, code, value) {
            if (!app.socket) return;
            app.socket.emit("touchpadEvent", {
                type: type,
                code: code,
                value: Math.round(value) || 0
            });
        }

        function emitClick(code, hapticMs) {
            haptic(hapticMs || 35);
            emitTP(1 /* EV_KEY */, code, 1);
            setTimeout(function () {
                emitTP(1 /* EV_KEY */, code, 0);
            }, 45);
        }

        function emitKB(code, value) {
            if (!app.socket) return;
            var ev = {
                type: 0x01,
                code: code,
                value: value,
                hardware: false
            };
            app.socket.emit("boardEvent", ev);
            app.socket.emit("keyboardEvent", ev);
        }

        function emitKeyCombo(keys) {
            if (!app.socket || !keys || !keys.length) return;
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
        // PRECISION TOUCH ENGINE (Ballistics & Inertial Scroll)
        // ==============================
        function applyBallistics(dx, dy, dt, speed, accelCurve) {
            if (dt <= 0 || dt > 0.1) dt = 0.016;
            var dist = Math.hypot(dx, dy);
            if (dist < 0.0001) return { x: 0, y: 0 };

            var v = dist / (dt * 1000); // px/ms
            var vThresh = 0.35;
            var accelFactor = (accelCurve > 1.0)
                ? (1.0 + (accelCurve - 1.0) * (Math.pow(v, 1.4) / (Math.pow(vThresh, 1.4) + Math.pow(v, 1.4))))
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
                if (sendRelease) emitTP(1 /* EV_KEY */, leftCode(), 0);
            }
            tapState = TAP_STATE_IDLE;
            firstTapMoved = false;
        }

        var lastTouchCount = 0;
        var lastMultiTouchLiftTime = 0;
        var isThreeFingerDragging = false;
        var isChordingMiddle = false;

        // Edge scrolling state
        var isEdgeScrolling = false;
        var edgeScrollAccumY = 0.0;

        function updateEdgeScrollGuide() {
            if (!options.area) return;
            options.area.style.setProperty('--edge-zone-width', (settings.edgeScrollThickness || 12) + '%');
            options.area.classList.remove('edge-scroll-right', 'edge-scroll-left', 'edge-scroll-both', 'edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
            if (settings.edgeScroll === 'right') {
                options.area.classList.add('edge-scroll-right');
            } else if (settings.edgeScroll === 'left') {
                options.area.classList.add('edge-scroll-left');
            } else if (settings.edgeScroll === 'both') {
                options.area.classList.add('edge-scroll-both');
            }
        }
        window.updateEdgeScrollGuide = updateEdgeScrollGuide;
        updateEdgeScrollGuide();

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

        // 4-Finger Tracking
        var fourFingerStartTime = 0;
        var fourFingerMoved = false;

        // Accumulators for smooth subpixel math
        var accumX = 0.0;
        var accumY = 0.0;
        var scrollAccumY = 0.0;
        var scrollAccumX = 0.0;
        var zoomAccum = 0.0;

        // ==============================
        // DEDICATED BOTTOM BUTTONS
        // ==============================
        function onLeftStart(e) {
            if (e && e.cancelable) e.preventDefault();
            cancelInertialScroll();
            cancelTapDragState(true);
            haptic(30);
            app.clicks |= 1;
            if (options.btn_left) options.btn_left.classList.add('active');
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /* EV_KEY */, leftCode(), 0);
                emitTP(1 /* EV_KEY */, rightCode(), 0);
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
                haptic(45);
            } else if (!isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, leftCode(), 1);
            }
        }

        function onLeftEnd(e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~1;
            if (options.btn_left) options.btn_left.classList.remove('active');
            if (isChordingMiddle) {
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
                isChordingMiddle = false;
                if (app.clicks & 2) emitTP(1 /* EV_KEY */, rightCode(), 1);
            } else if (!isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, leftCode(), 0);
            }
        }

        function onRightStart(e) {
            if (e && e.cancelable) e.preventDefault();
            cancelInertialScroll();
            cancelTapDragState(true);
            haptic(30);
            app.clicks |= 2;
            if (options.btn_right) options.btn_right.classList.add('active');
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /* EV_KEY */, leftCode(), 0);
                emitTP(1 /* EV_KEY */, rightCode(), 0);
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
                haptic(45);
            } else {
                emitTP(1 /* EV_KEY */, rightCode(), 1);
            }
        }

        function onRightEnd(e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~2;
            if (options.btn_right) options.btn_right.classList.remove('active');
            if (isChordingMiddle) {
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
                isChordingMiddle = false;
                if (app.clicks & 1) emitTP(1 /* EV_KEY */, leftCode(), 1);
            } else {
                emitTP(1 /* EV_KEY */, rightCode(), 0);
            }
        }

        if (options.btn_left) {
            options.btn_left.addEventListener('touchstart', onLeftStart, { passive: false });
            options.btn_left.addEventListener('touchend', onLeftEnd, { passive: false });
            options.btn_left.addEventListener('touchcancel', onLeftEnd, { passive: false });
            options.btn_left.addEventListener('mousedown', onLeftStart);
            options.btn_left.addEventListener('mouseup', onLeftEnd);
        }

        if (options.btn_right) {
            options.btn_right.addEventListener('touchstart', onRightStart, { passive: false });
            options.btn_right.addEventListener('touchend', onRightEnd, { passive: false });
            options.btn_right.addEventListener('touchcancel', onRightEnd, { passive: false });
            options.btn_right.addEventListener('mousedown', onRightStart);
            options.btn_right.addEventListener('mouseup', onRightEnd);
        }

        // ==============================
        // TOUCHPAD AREA TOUCH GESTURES
        // ==============================
        function onTouchStart(e) {
            if (e.cancelable) e.preventDefault();
            cancelInertialScroll();
            var touches = (e.targetTouches && e.targetTouches.length > 0) ? e.targetTouches : e.touches;
            var num = touches ? touches.length : 0;
            lastTouchCount = num;
            var now = Date.now();

            if (num === 1) {
                var t = touches[0];

                // Check if touch starts in Edge Scroll Zone
                isEdgeScrolling = false;
                if (settings.edgeScroll === 'right' || settings.edgeScroll === 'left' || settings.edgeScroll === 'both') {
                    var rect = options.area ? options.area.getBoundingClientRect() : null;
                    var padW = rect ? rect.width : window.innerWidth;
                    var relX = rect ? (t.clientX - rect.left) : t.clientX;
                    var thicknessPct = (settings.edgeScrollThickness || 12) / 100;
                    var zoneW = Math.max(24, padW * thicknessPct);

                    if ((settings.edgeScroll === 'right' || settings.edgeScroll === 'both') && relX >= (padW - zoneW)) {
                        isEdgeScrolling = true;
                        if (options.area) options.area.classList.add('edge-scrolling-right', 'edge-scrolling');
                    } else if ((settings.edgeScroll === 'left' || settings.edgeScroll === 'both') && relX <= zoneW) {
                        isEdgeScrolling = true;
                        if (options.area) options.area.classList.add('edge-scrolling-left', 'edge-scrolling');
                    }
                }

                // ── Double-Tap & Drag State Machine Evaluation ──
                if (tapState === TAP_STATE_PENDING_SECOND) {
                    var distFromFirst = Math.hypot(t.pageX - firstTapX, t.pageY - firstTapY);
                    if (distFromFirst < 50 && !isEdgeScrolling) {
                        clearTapTimers();
                        tapState = TAP_STATE_DRAGGING;
                        emitTP(1 /* EV_KEY */, leftCode(), 1);
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
                accumX = 0;
                accumY = 0;
                edgeScrollAccumY = 0;

            } else if (num === 2) {
                cancelTapDragState(true);
                isEdgeScrolling = false;
                if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

                var t0 = touches[0];
                var t1 = touches[1];
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
                if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

                var ta = touches[0];
                var tb = touches[1];
                var tc = touches[2];
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

            } else if (num === 4) {
                cancelTapDragState(true);
                isEdgeScrolling = false;
                if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
                fourFingerStartTime = now;
                fourFingerMoved = false;
            }
        }

        function onTouchMove(e) {
            if (e.cancelable) e.preventDefault();
            var touches = (e.targetTouches && e.targetTouches.length > 0) ? e.targetTouches : e.touches;
            var num = touches ? touches.length : 0;
            var spd = settings.speed;
            var acc = settings.acceleration;
            var scrSens = settings.scrollSensitivity || 1.0;
            var now = Date.now();

            // ── Seamless Transition Anchor Check ──
            if (num !== lastTouchCount) {
                lastTouchCount = num;
                if (num === 1) {
                    var tr = touches[0];
                    prevOneX = tr.pageX;
                    prevOneY = tr.pageY;
                    prevOneTime = now;
                    accumX = 0;
                    accumY = 0;
                    edgeScrollAccumY = 0;
                    if (isPinching) { emitKB(29, 0); isPinching = false; }
                    return;
                } else if (num === 2) {
                    cancelTapDragState(true);
                    isEdgeScrolling = false;
                    if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
                    var t0a = touches[0];
                    var t1a = touches[1];
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
                    if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');
                    var taa = touches[0];
                    var tba = touches[1];
                    var tca = touches[2];
                    prevCentroidX = (taa.pageX + tba.pageX + tca.pageX) / 3;
                    prevCentroidY = (taa.pageY + tba.pageY + tca.pageY) / 3;
                    accumX = 0; accumY = 0;
                    return;
                }
            }

            if (num === 1) {
                var t = touches[0];
                if (!t) return;

                var dt = (now - prevOneTime) / 1000.0;
                prevOneTime = now;

                var dx = t.pageX - prevOneX;
                var dy = t.pageY - prevOneY;
                prevOneX = t.pageX;
                prevOneY = t.pageY;

                if (tapState === TAP_STATE_FIRST_DOWN) {
                    if (Math.hypot(t.pageX - firstTapX, t.pageY - firstTapY) > 8) {
                        firstTapMoved = true;
                    }
                }

                // ── 1-Finger Edge Scrolling Mode ──
                if (isEdgeScrolling) {
                    if (Math.abs(dy) > 2) oneFingerMoved = true;
                    var scrollSign = settings.naturalScrolling ? 1 : -1;
                    edgeScrollAccumY += (dy * scrollSign * 0.15 * spd * scrSens);
                    var wheelY = Math.trunc(edgeScrollAccumY);
                    if (wheelY !== 0) {
                        edgeScrollAccumY -= wheelY;
                        emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelY);
                    }
                    return;
                }

                if (Math.hypot(t.pageX - oneFingerStartX, t.pageY - oneFingerStartY) > 3) {
                    oneFingerMoved = true;
                }

                // Continuous Dynamic Ballistics
                var delta = applyBallistics(dx, dy, dt, spd, acc);
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
                var t0 = touches[0];
                var t1 = touches[1];
                if (!t0 || !t1) return;

                var currentSpan = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
                var midX = (t0.pageX + t1.pageX) / 2;
                var midY = (t0.pageY + t1.pageY) / 2;
                var dSpan = currentSpan - prevSpan;
                var dMidX = midX - prevMidX;
                var dMidY = midY - prevMidY;

                // Per-touch instantaneous velocity vectors
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

                if (spanDeltaTotal > 6 || midDeltaTotal > 3) {
                    twoFingerMoved = true;
                }

                // If fingers move in parallel (alignment > 0.1), lock out pinch
                if (mag0 > 0.4 && mag1 > 0.4 && alignment > 0.1) {
                    if (isPinching) {
                        emitKB(29 /* KEY_LEFTCTRL */, 0);
                        isPinching = false;
                    }
                }

                // Pinch-to-zoom requires opposing motion
                var isPinchGesture = settings.pinchToZoom &&
                    alignment < -0.3 &&
                    Math.abs(dSpan) > 1.2 &&
                    spanDeltaTotal > 24 &&
                    spanDeltaTotal > 2.0 * midDeltaTotal;

                if (isPinchGesture || (isPinching && Math.abs(dSpan) > 0.8)) {
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
                    if (isPinching) {
                        emitKB(29 /* KEY_LEFTCTRL */, 0);
                        isPinching = false;
                    }

                    // ── Fluid 2D Omnidirectional Scrolling with Soft Directional Bias ──
                    var scrollSign = settings.naturalScrolling ? 1 : -1;
                    var moveY = dMidY;
                    var moveX = dMidX;

                    var absX = Math.abs(moveX);
                    var absY = Math.abs(moveY);

                    // Soft Ergonomic Directional Bias (prevents jitter without rigid axis clamping)
                    if (absY > 2.5 * absX) {
                        moveX *= 0.15;
                    } else if (absX > 2.5 * absY) {
                        moveY *= 0.15;
                    }

                    recordScrollVelocity(moveX, moveY, now);

                    scrollAccumY += (moveY * scrollSign * 0.15 * spd * scrSens);
                    if (settings.horizontalScroll) {
                        scrollAccumX += (moveX * scrollSign * 0.15 * spd * scrSens);
                    }

                    var wheelY = Math.trunc(scrollAccumY);
                    var wheelX = Math.trunc(scrollAccumX);

                    if (wheelY !== 0) {
                        scrollAccumY -= wheelY;
                        emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wheelY);
                    }
                    if (wheelX !== 0 && settings.horizontalScroll !== false) {
                        scrollAccumX -= wheelX;
                        emitTP(2 /* EV_REL */, 6 /* REL_HWHEEL */, wheelX);
                    }
                }

            } else if (num === 3) {
                var ta = touches[0];
                var tb = touches[1];
                var tc = touches[2];
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
                if (!settings.threeFingerSwipes || elapsed > 220) {
                    if (!isThreeFingerDragging && app.clicks === 0) {
                        emitTP(1 /* EV_KEY */, leftCode(), 1);
                        isThreeFingerDragging = true;
                        haptic(30);
                    }

                    var delta3 = applyBallistics(dCentroidX, dCentroidY, 0.016, spd, acc);
                    accumX += delta3.x;
                    accumY += delta3.y;

                    var send3X = Math.trunc(accumX);
                    var send3Y = Math.trunc(accumY);
                    if (send3X !== 0 || send3Y !== 0) {
                        accumX -= send3X;
                        accumY -= send3Y;
                        if (send3X !== 0) emitTP(2 /* EV_REL */, 0 /* REL_X */, send3X);
                        if (send3Y !== 0) emitTP(2 /* EV_REL */, 1 /* REL_Y */, send3Y);
                    }
                }
            } else if (num === 4) {
                fourFingerMoved = true;
            }
        }

        function onTouchEnd(e) {
            if (e.cancelable) e.preventDefault();
            var touches = (e.targetTouches && e.targetTouches.length > 0) ? e.targetTouches : e.touches;
            var remaining = touches ? touches.length : 0;
            lastTouchCount = remaining;
            var now = Date.now();

            if (isPinching) {
                emitKB(29 /* KEY_LEFTCTRL */, 0);
                isPinching = false;
            }
            if (options.area) options.area.classList.remove('edge-scrolling', 'edge-scrolling-left', 'edge-scrolling-right');

            if (remaining === 1) {
                isEdgeScrolling = false;
                var tRem = touches[0];
                prevOneX = tRem.pageX;
                prevOneY = tRem.pageY;
                prevOneTime = now;
                accumX = 0;
                accumY = 0;
                oneFingerMoved = true;
                lastMultiTouchLiftTime = now;

            } else if (remaining === 2) {
                isEdgeScrolling = false;
                var t0 = touches[0];
                var t1 = touches[1];
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
                    emitTP(1 /* EV_KEY */, leftCode(), 0);
                    isThreeFingerDragging = false;
                }

            } else if (remaining === 0) {
                // ── Double-Tap & Drag Release State Handling ──
                if (tapState === TAP_STATE_DRAGGING) {
                    if (settings.dragLock !== false) {
                        tapState = TAP_STATE_DRAG_REPOSITION;
                        clearTapTimers();
                        dragRepositionTimer = setTimeout(function () {
                            if (tapState === TAP_STATE_DRAG_REPOSITION) {
                                emitTP(1 /* EV_KEY */, leftCode(), 0);
                                tapState = TAP_STATE_IDLE;
                            }
                        }, 250);
                    } else {
                        emitTP(1 /* EV_KEY */, leftCode(), 0);
                        tapState = TAP_STATE_IDLE;
                    }

                } else if (isThreeFingerDragging) {
                    emitTP(1 /* EV_KEY */, leftCode(), 0);
                    isThreeFingerDragging = false;
                    cancelTapDragState(false);

                } else if (isEdgeScrolling) {
                    if (!oneFingerMoved && (now - oneFingerStartTime < 320) && app.clicks === 0) {
                        if (now - lastMultiTouchLiftTime > 160) {
                            emitClick(leftCode(), 25);
                        }
                    }
                    isEdgeScrolling = false;
                    edgeScrollAccumY = 0;
                    cancelTapDragState(false);

                } else if (fourFingerStartTime > 0 && !fourFingerMoved && (now - fourFingerStartTime < 320)) {
                    // ── 4-Finger Tap -> Side Click / Context Menu ──
                    emitClick(0x113 /* BTN_SIDE */, 45);
                    fourFingerStartTime = 0;
                    cancelTapDragState(false);

                } else if (threeFingerStartTime > 0 && threeFingerMoved) {
                    // ── 3-Finger Swipes ──
                    var dur3 = now - threeFingerStartTime;
                    var total3X = prevCentroidX - threeFingerStartX;
                    var total3Y = prevCentroidY - threeFingerStartY;
                    var dist3 = Math.hypot(total3X, total3Y);

                    if (dur3 < 380 && dist3 > 45 && settings.threeFingerSwipes !== false) {
                        if (Math.abs(total3Y) > 1.4 * Math.abs(total3X)) {
                            if (total3Y < 0) {
                                emitKeyCombo([125 /* KEY_LEFTMETA / Super */]);
                                haptic(50);
                            } else {
                                emitKeyCombo([125 /* KEY_LEFTMETA */, 32 /* KEY_D */]);
                                haptic(50);
                            }
                        } else if (Math.abs(total3X) > 1.4 * Math.abs(total3Y)) {
                            if (total3X > 0) {
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 105 /* Left */]);
                                haptic(45);
                            } else {
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 106 /* Right */]);
                                haptic(45);
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
                    // ── 2-Finger Fast Horizontal Swipe (Browser Back / Forward) ──
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
                    } else if (settings.inertialScrolling !== false && !isPinching) {
                        var spd = settings.speed;
                        var scrSens = settings.scrollSensitivity || 1.0;
                        var scrollSign = settings.naturalScrolling ? 1 : -1;
                        startInertialScroll(function (vx, vy) {
                            scrollAccumY += (vy * scrollSign * 0.15 * spd * scrSens);
                            if (settings.horizontalScroll !== false) {
                                scrollAccumX += (vx * scrollSign * 0.15 * spd * scrSens);
                            }
                            var wy = Math.trunc(scrollAccumY);
                            var wx = Math.trunc(scrollAccumX);
                            if (wy !== 0) {
                                scrollAccumY -= wy;
                                emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, wy);
                            }
                            if (wx !== 0 && settings.horizontalScroll !== false) {
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
                        emitClick(rightCode(), 35);
                        lastTwoFingerTapTime = now;
                    }
                    twoFingerStartTime = 0;
                    cancelTapDragState(false);

                } else if (tapState === TAP_STATE_FIRST_DOWN) {
                    var tapDur = now - firstTapTime;
                    var totalDist = Math.hypot(prevOneX - firstTapX, prevOneY - firstTapY);

                    if (!firstTapMoved && tapDur < 280 && totalDist < 10 && app.clicks === 0 && (now - lastMultiTouchLiftTime > 160)) {
                        // ── Instant Click on Lift (0ms perceived latency) ──
                        emitClick(leftCode(), 25);
                        tapState = TAP_STATE_PENDING_SECOND;
                        clearTapTimers();
                        tapTimer = setTimeout(function () {
                            if (tapState === TAP_STATE_PENDING_SECOND) {
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
                    fourFingerStartTime = 0;
                }

                accumX = 0;
                accumY = 0;
                scrollAccumY = 0;
                scrollAccumX = 0;
                zoomAccum = 0;
            }
        }

        if (options.area) {
            options.area.addEventListener('touchstart', onTouchStart, { passive: false });
            options.area.addEventListener('touchmove', onTouchMove, { passive: false });
            options.area.addEventListener('touchend', onTouchEnd, { passive: false });
            options.area.addEventListener('touchcancel', onTouchEnd, { passive: false });
            options.area.addEventListener('mousedown', function (e) {
                mouseDown = true;
                mouseMoved = false;
                prevOneX = e.pageX;
                prevOneY = e.pageY;
                accumX = 0;
                accumY = 0;
            });
        }

        window.addEventListener('mousemove', function (e) {
            if (!mouseDown) return;
            var dx = e.pageX - prevOneX;
            var dy = e.pageY - prevOneY;
            prevOneX = e.pageX;
            prevOneY = e.pageY;

            if (Math.abs(dx) + Math.abs(dy) > 2) mouseMoved = true;

            var spd = settings.speed;
            var acc = settings.acceleration;
            var delta = applyBallistics(dx, dy, 0.016, spd, acc);
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
        });

        window.addEventListener('mouseup', function (e) {
            if (!mouseDown) return;
            mouseDown = false;
            if (!mouseMoved && e && e.button === 0) {
                emitClick(leftCode(), 25);
            }
        });
    },

    emit: function () {
        if (!(arguments[0] instanceof Array)) {
            app.emit.call(this, Array.prototype.slice.call(arguments));
            return;
        }

        Array.prototype.slice.call(arguments).forEach(function (ev) {
            app.socket && app.socket.emit(ev[0], {
                type: ev[1],
                code: ev[2],
                value: ev[3]
            });
        });
    },

    init: function () {
        app.createJoystickClient();

        app.createTouchpadClient({
            area: document.getElementById('touchpad-area'),
            btn_left: document.getElementById('touchpad-btn_left'),
            btn_right: document.getElementById('touchpad-btn_right')
        });

        var touchpad_screen = document.getElementById('touchpad');
        var joystick_screen = document.getElementById('joystick');

        var setTP = document.getElementById('setTouchpad');
        var setJoy = document.getElementById('setJoystick');
        var gear = document.getElementById('settings-gear');

        if (setTP) {
            setTP.addEventListener('click', function () {
                if (joystick_screen) joystick_screen.style.display = 'none';
                if (touchpad_screen) touchpad_screen.style.display = 'block';
                app.current_device = TOUCHPAD;
            });
        }
        if (setJoy) {
            setJoy.addEventListener('click', function () {
                if (joystick_screen) joystick_screen.style.display = 'block';
                if (touchpad_screen) touchpad_screen.style.display = 'none';
                app.current_device = JOYSTICK;
            });
        }
        if (gear) {
            gear.addEventListener('click', function () {
                settings.modal.open();
            });
        }

        // Socket connection & dual slot allocation
        !function connect() {
            app.socket = io();

            app.socket.on("touchpadConnected", function () {
                var conn = document.getElementById('connecting');
                if (conn) conn.style.display = 'none';
            });

            app.socket.on("connect", function () {
                app.socket.emit("connectTouchpad", null);
                app.socket.emit("connectKeyboard", null);
                var conn = document.getElementById('connecting');
                if (conn) conn.style.display = 'block';
            });

            app.socket.on("disconnect", function () {
                location.reload();
            });
        }();
    }
};
