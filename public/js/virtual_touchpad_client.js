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
    settings.naturalScrolling = false;
    settings.leftHandMode = false;
    settings.pinchToZoom = true;
    settings.horizontalScroll = true;
    settings.threeFingerSwipes = true;

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
    }

    settings.update = function (update) {
        if (update.hasOwnProperty('speed')) settings.speed = Math.max(0.1, parseFloat(update.speed) || 1.0);
        if (update.hasOwnProperty('acceleration')) settings.acceleration = Math.max(1.0, parseFloat(update.acceleration) || 1.2);
        if (update.hasOwnProperty('naturalScrolling')) settings.naturalScrolling = !!update.naturalScrolling;
        if (update.hasOwnProperty('leftHandMode')) settings.leftHandMode = !!update.leftHandMode;
        if (update.hasOwnProperty('pinchToZoom')) settings.pinchToZoom = !!update.pinchToZoom;
        if (update.hasOwnProperty('horizontalScroll')) settings.horizontalScroll = !!update.horizontalScroll;
        if (update.hasOwnProperty('threeFingerSwipes')) settings.threeFingerSwipes = !!update.threeFingerSwipes;

        applyUIAttributes();

        if (localStorageAvailable) {
            window.localStorage.setItem('touchpadSettings', JSON.stringify({
                speed: settings.speed,
                acceleration: settings.acceleration,
                naturalScrolling: settings.naturalScrolling,
                leftHandMode: settings.leftHandMode,
                pinchToZoom: settings.pinchToZoom,
                horizontalScroll: settings.horizontalScroll,
                threeFingerSwipes: settings.threeFingerSwipes
            }));
        }
    };

    function defaultSettings() {
        return {
            speed: 1.0,
            acceleration: 1.2,
            naturalScrolling: false,
            leftHandMode: false,
            pinchToZoom: true,
            horizontalScroll: true,
            threeFingerSwipes: true
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
            $('#settings-natural-scroll').prop('checked', !!settings.naturalScrolling);
            $('#settings-left-hand').prop('checked', !!settings.leftHandMode);
            $('#settings-pinch-zoom').prop('checked', settings.pinchToZoom !== false);
            $('#settings-horizontal-scroll').prop('checked', settings.horizontalScroll !== false);
            $('#settings-3finger-swipes').prop('checked', settings.threeFingerSwipes !== false);
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

        var lastTouchCount = 0;
        var lastMultiTouchLiftTime = 0; // Staggered lift cooldown timer
        var isTapDragging = false;
        var isThreeFingerDragging = false;
        var isChordingMiddle = false;
        var lastTapTime = 0;
        var lastTapX = 0;
        var lastTapY = 0;

        // 1-Finger
        var oneFingerStartTime = 0;
        var oneFingerStartX = 0;
        var oneFingerStartY = 0;
        var prevOneX = 0;
        var prevOneY = 0;
        var oneFingerMoved = false;

        // 2-Finger
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

        // 3-Finger
        var threeFingerStartTime = 0;
        var threeFingerStartX = 0;
        var threeFingerStartY = 0;
        var prevCentroidX = 0;
        var prevCentroidY = 0;
        var threeFingerMoved = false;

        // 4-Finger
        var fourFingerStartTime = 0;
        var fourFingerMoved = false;

        // Desktop mouse fallback
        var mouseDown = false;
        var mouseMoved = false;

        // Accumulators for smooth subpixel math
        var accumX = 0.0;
        var accumY = 0.0;
        var scrollAccumY = 0.0;
        var scrollAccumX = 0.0;
        var zoomAccum = 0.0;

        // ==============================
        // DEDICATED BOTTOM BUTTONS
        // ==============================
        options.btn_left && options.btn_left.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            haptic(30);
            app.clicks |= 1;
            options.btn_left.classList.add('active');
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /* EV_KEY */, leftCode(), 0);
                emitTP(1 /* EV_KEY */, rightCode(), 0);
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
                haptic(45);
            } else if (!isTapDragging && !isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, leftCode(), 1);
            }
        });
        options.btn_left && options.btn_left.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~1;
            options.btn_left.classList.remove('active');
            if (isChordingMiddle) {
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
                isChordingMiddle = false;
                if (app.clicks & 2) emitTP(1 /* EV_KEY */, rightCode(), 1);
            } else if (!isTapDragging && !isThreeFingerDragging) {
                emitTP(1 /* EV_KEY */, leftCode(), 0);
            }
        });

        options.btn_right && options.btn_right.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            haptic(30);
            app.clicks |= 2;
            options.btn_right.classList.add('active');
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /* EV_KEY */, leftCode(), 0);
                emitTP(1 /* EV_KEY */, rightCode(), 0);
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 1);
                haptic(45);
            } else {
                emitTP(1 /* EV_KEY */, rightCode(), 1);
            }
        });
        options.btn_right && options.btn_right.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~2;
            options.btn_right.classList.remove('active');
            if (isChordingMiddle) {
                emitTP(1 /* EV_KEY */, 0x112 /* BTN_MIDDLE */, 0);
                isChordingMiddle = false;
                if (app.clicks & 1) emitTP(1 /* EV_KEY */, leftCode(), 1);
            } else {
                emitTP(1 /* EV_KEY */, rightCode(), 0);
            }
        });

        // ==============================
        // TOUCHPAD AREA TOUCH GESTURES
        // ==============================
        options.area && options.area.addEventListener('touchstart', function (e) {
            if (e.cancelable) e.preventDefault();
            var num = e.targetTouches.length;
            lastTouchCount = num;
            var now = Date.now();

            if (num === 1) {
                var t = e.targetTouches[0];
                var timeSinceLastTap = now - lastTapTime;
                var distFromLastTap = Math.hypot(t.pageX - lastTapX, t.pageY - lastTapY);

                if (timeSinceLastTap < 320 && distFromLastTap < 40) {
                    isTapDragging = true;
                    haptic(20);
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                } else {
                    isTapDragging = false;
                }

                oneFingerStartTime = now;
                oneFingerStartX = t.pageX;
                oneFingerStartY = t.pageY;
                prevOneX = t.pageX;
                prevOneY = t.pageY;
                oneFingerMoved = false;
                accumX = 0;
                accumY = 0;

            } else if (num === 2) {
                if (isTapDragging) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
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
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
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

            } else if (num === 4) {
                fourFingerStartTime = now;
                fourFingerMoved = false;
            }
        });

        options.area && options.area.addEventListener('touchmove', function (e) {
            if (e.cancelable) e.preventDefault();
            var num = e.targetTouches.length;
            var spd = settings.speed;
            var acc = settings.acceleration;

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
                    var t0a = e.targetTouches[0];
                    var t1a = e.targetTouches[1];
                    twoFingerSpan0 = Math.hypot(t1a.pageX - t0a.pageX, t1a.pageY - t0a.pageY);
                    prevSpan = twoFingerSpan0;
                    prevMidX = (t0a.pageX + t1a.pageX) / 2;
                    prevMidY = (t0a.pageY + t1a.pageY) / 2;
                    scrollAccumY = 0; scrollAccumX = 0; zoomAccum = 0;
                    return;
                } else if (num === 3) {
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

                var dx = t.pageX - prevOneX;
                var dy = t.pageY - prevOneY;
                prevOneX = t.pageX;
                prevOneY = t.pageY;

                if (Math.abs(dx) + Math.abs(dy) > 3) oneFingerMoved = true;

                var rawX = (dx >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dx), acc);
                var rawY = (dy >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dy), acc);
                accumX += rawX;
                accumY += rawY;

                var sendX = Math.trunc(accumX);
                var sendY = Math.trunc(accumY);
                if (sendX !== 0 || sendY !== 0) {
                    accumX -= sendX;
                    accumY -= sendY;
                    emitTP(2 /* EV_REL */, 0 /* REL_X */, sendX);
                    emitTP(2 /* EV_REL */, 1 /* REL_Y */, sendY);
                }

            } else if (num === 2) {
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

                // Pinch vs Scroll Disambiguation
                if (settings.pinchToZoom !== false && (isPinching || (spanDeltaTotal > 28 && spanDeltaTotal > 1.4 * midDeltaTotal))) {
                    isPinching = true;
                    zoomAccum += dSpan * 0.09;
                    var zoomSteps = Math.trunc(zoomAccum);
                    if (zoomSteps !== 0) {
                        zoomAccum -= zoomSteps;
                        emitKB(29 /* KEY_LEFTCTRL */, 1);
                        emitTP(2 /* EV_REL */, 8 /* REL_WHEEL */, zoomSteps);
                    }
                } else {
                    var scrollSign = settings.naturalScrolling ? 1 : -1;
                    var moveY = dMidY;
                    var moveX = dMidX;

                    // 2D Scroll Axis Locking
                    if (Math.abs(moveY) > 2.2 * Math.abs(moveX)) {
                        moveX = 0;
                    } else if (Math.abs(moveX) > 2.2 * Math.abs(moveY)) {
                        moveY = 0;
                    }

                    scrollAccumY += (moveY * scrollSign * 0.15 * spd);
                    scrollAccumX += (moveX * scrollSign * 0.15 * spd);

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

                if (Math.hypot(cX - threeFingerStartX, cY - threeFingerStartY) > 8) {
                    threeFingerMoved = true;
                }

                var elapsed = Date.now() - threeFingerStartTime;
                if (elapsed > 220) {
                    if (!isThreeFingerDragging && app.clicks === 0 && !isTapDragging) {
                        emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 1);
                        isThreeFingerDragging = true;
                        haptic(30);
                    }

                    var raw3X = (dCentroidX >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dCentroidX), acc);
                    var raw3Y = (dCentroidY >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dCentroidY), acc);
                    accumX += raw3X;
                    accumY += raw3Y;

                    var send3X = Math.trunc(accumX);
                    var send3Y = Math.trunc(accumY);
                    if (send3X !== 0 || send3Y !== 0) {
                        accumX -= send3X;
                        accumY -= send3Y;
                        emitTP(2 /* EV_REL */, 0 /* REL_X */, send3X);
                        emitTP(2 /* EV_REL */, 1 /* REL_Y */, send3Y);
                    }
                }

            } else if (num === 4) {
                fourFingerMoved = true;
            }
        });

        options.area && options.area.addEventListener('touchend', function (e) {
            if (e.cancelable) e.preventDefault();
            var remaining = e.targetTouches.length;
            lastTouchCount = remaining;
            var now = Date.now();

            if (isPinching) {
                emitKB(29 /* KEY_LEFTCTRL */, 0);
                isPinching = false;
            }

            if (remaining === 1) {
                var tRem = e.targetTouches[0];
                prevOneX = tRem.pageX;
                prevOneY = tRem.pageY;
                accumX = 0;
                accumY = 0;
                oneFingerMoved = true;
                lastMultiTouchLiftTime = now;

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
                lastMultiTouchLiftTime = now;
                if (isThreeFingerDragging) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                    isThreeFingerDragging = false;
                }

            } else if (remaining === 0) {
                if (isTapDragging) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                    isTapDragging = false;
                    lastTapTime = 0;

                } else if (isThreeFingerDragging) {
                    emitTP(1 /* EV_KEY */, 0x110 /* BTN_LEFT */, 0);
                    isThreeFingerDragging = false;
                    lastTapTime = 0;

                } else if (fourFingerStartTime > 0 && !fourFingerMoved && (now - fourFingerStartTime < 320)) {
                    // ── 4-Finger Tap -> Side Click / Context Menu ──
                    emitClick(0x113 /* BTN_SIDE */, 45);
                    fourFingerStartTime = 0;
                    lastTapTime = 0;

                } else if (threeFingerStartTime > 0 && threeFingerMoved) {
                    // ── 3-Finger Swipes ──
                    var dur3 = now - threeFingerStartTime;
                    var total3X = prevCentroidX - threeFingerStartX;
                    var total3Y = prevCentroidY - threeFingerStartY;
                    var dist3 = Math.hypot(total3X, total3Y);

                    if (dur3 < 380 && dist3 > 45 && settings.threeFingerSwipes !== false) {
                        if (Math.abs(total3Y) > 1.4 * Math.abs(total3X)) {
                            if (total3Y < 0) {
                                // Swipe Up -> Overview / App Switcher (Super)
                                emitKeyCombo([125 /* KEY_LEFTMETA / Super */]);
                                haptic(50);
                            } else {
                                // Swipe Down -> Show Desktop (Super + D)
                                emitKeyCombo([125 /* KEY_LEFTMETA */, 32 /* KEY_D */]);
                                haptic(50);
                            }
                        } else if (Math.abs(total3X) > 1.4 * Math.abs(total3Y)) {
                            if (total3X > 0) {
                                // Swipe Left -> Workspace Left (Ctrl + Alt + Left)
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 105 /* Left */]);
                                haptic(45);
                            } else {
                                // Swipe Right -> Workspace Right (Ctrl + Alt + Right)
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 106 /* Right */]);
                                haptic(45);
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
                    // ── 2-Finger Fast Horizontal Swipe (Browser Back / Forward) ──
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

                } else if (oneFingerStartTime > 0 && !oneFingerMoved && (now - oneFingerStartTime < 320) && app.clicks === 0) {
                    // ── 1-Finger Tap -> Left Click (with staggered lift ghost click suppression) ──
                    if (now - lastMultiTouchLiftTime > 160) {
                        emitClick(0x110 /* BTN_LEFT */, 25);
                        lastTapTime = now;
                        lastTapX = oneFingerStartX;
                        lastTapY = oneFingerStartY;
                    }
                    oneFingerStartTime = 0;

                } else {
                    lastTapTime = 0;
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
        });

        // ==============================
        // DESKTOP MOUSE / POINTER FALLBACK
        // ==============================
        options.area && options.area.addEventListener('mousedown', function (e) {
            mouseDown = true;
            mouseMoved = false;
            prevOneX = e.pageX;
            prevOneY = e.pageY;
            accumX = 0;
            accumY = 0;
        });

        window.addEventListener('mousemove', function (e) {
            if (!mouseDown) return;
            var dx = e.pageX - prevOneX;
            var dy = e.pageY - prevOneY;
            prevOneX = e.pageX;
            prevOneY = e.pageY;

            if (Math.abs(dx) + Math.abs(dy) > 2) mouseMoved = true;

            var spd = settings.speed;
            var acc = settings.acceleration;
            var rawX = (dx >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dx), acc);
            var rawY = (dy >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dy), acc);
            accumX += rawX;
            accumY += rawY;

            var sendX = Math.trunc(accumX);
            var sendY = Math.trunc(accumY);
            if (sendX !== 0 || sendY !== 0) {
                accumX -= sendX;
                accumY -= sendY;
                emitTP(2 /* EV_REL */, 0 /* REL_X */, sendX);
                emitTP(2 /* EV_REL */, 1 /* REL_Y */, sendY);
            }
        });

        window.addEventListener('mouseup', function () {
            if (mouseDown && !mouseMoved) {
                emitClick(0x110 /* BTN_LEFT */, 25);
            }
            mouseDown = false;
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
