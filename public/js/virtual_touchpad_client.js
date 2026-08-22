var TOUCHPAD = 'touchpad';

var JOYSTICK = 'joystick';

var settings = function () {

    var settings = {};

    /*
     * Settings modal stuff
     */

    settings.modal = {};
    settings.modal.isOpen = false;

    // initialize settings modal
    $(document).ready(function () {
        var settingsModal = $("#settings-modal");

        $('#settings-speed').on('input', function () {
            $('#settings-speed-output').val($(this).val());
        });
        $('#settings-acceleration').on('input', function () {
            $('#settings-acceleration-output').val($(this).val());
        });

        settings.modal.open = function () {
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
                    if (e.attr('type') == 'checkbox') {
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
            })
        }

        function bindClose() {
            settingsModal.find(".close").addBack().click(function (event) {
                settings.modal.close();
            });
            $(".modal").click(function (event) {
                event.stopPropagation();
            });
        }

        initDialog();
        bindClose();
        bindSubmit();
    });

    /*
     * Rest of the settings
     */

    var localStorageAvailable = (typeof(Storage) !== "undefined");

    settings.speed = 2;
    settings.acceleration = 1.5;
    settings.naturalScrolling = false;
    settings.leftHandMode = false;
    settings.pinchToZoom = true;
    settings.horizontalScroll = true;
    settings.threeFingerSwipes = true;

    settings.update = function(update) {
        if (update.hasOwnProperty('speed')) settings.speed = parseFloat(update.speed);
        if (update.hasOwnProperty('acceleration')) settings.acceleration = parseFloat(update.acceleration);
        if (update.hasOwnProperty('naturalScrolling')) settings.naturalScrolling = !!update.naturalScrolling;
        if (update.hasOwnProperty('leftHandMode')) settings.leftHandMode = !!update.leftHandMode;
        if (update.hasOwnProperty('pinchToZoom')) settings.pinchToZoom = !!update.pinchToZoom;
        if (update.hasOwnProperty('horizontalScroll')) settings.horizontalScroll = !!update.horizontalScroll;
        if (update.hasOwnProperty('threeFingerSwipes')) settings.threeFingerSwipes = !!update.threeFingerSwipes;
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
            speed: 2,
            acceleration: 1.5,
            naturalScrolling: false,
            leftHandMode: false,
            pinchToZoom: true,
            horizontalScroll: true,
            threeFingerSwipes: true
        }
    }

    function init() {
        if (localStorageAvailable) {
            var touchpadSettings = window.localStorage.getItem("touchpadSettings");
            if (touchpadSettings == null) {
                touchpadSettings = defaultSettings();
            } else {
                touchpadSettings = JSON.parse(touchpadSettings);
            }
            settings.update(touchpadSettings);
        } else {
            console.error('localStorage not available. Settings can\'t be stored.')
        }
    }

    init();

    return settings;
}();


// disable context menu e.g. on long touches on android
$(function() {
    $(window).on("contextmenu", function(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    });
});


var app = {

    clicks: 0,

    drag: 0,

    touches: 0,

    toucheindex: 0,

    touchmove: 0,

    current_x: 0,

    current_y: 0,

    current_device: TOUCHPAD,

    socket: null,

    createJoystickClient: function (options) {
        var menu_height = document.querySelector('body menu').clientHeight;

        var stick = new Joystick.CircuralStick({
            start: function (coords) {
            },
            move: function (abs_coords, rel_coords) {
                app.emit(["touchpadEvent", 3 /*'EV_ABS'*/, 0 /*'ABS_X'*/, rel_coords.x],
                    ["touchpadEvent", 3 /*'EV_ABS'*/, 1 /*'ABS_Y'*/, rel_coords.y]);
            },
            end: function () {
            },
            analog: true,
            axis_value: 0x7FFF,
            x: document.body.clientWidth / 4,
            y: document.body.clientHeight / 2 + menu_height,
            container: document.getElementById('joystick'),
            autohide: false,
            targeting: true,
            region: function () {
                return [0, menu_height, document.body.clientWidth / 2, document.body.clientHeight]
            }
        });

        var buttons = new Joystick.Buttons({
            x: document.body.clientWidth / 2 + document.body.clientWidth / 4,
            y: document.body.clientHeight / 2,
            container: document.getElementById('joystick'),

            down: function (btn) {
                var code;
                switch (btn) {
                    case 'button_x' :
                        code = 0x133;
                        /*'BTN_X'*/
                        break;
                    case 'button_y' :
                        code = 0x134;
                        /*'BTN_Y'*/
                        break;
                    case 'button_a' :
                        code = 0x130;
                        /*'BTN_A'*/
                        break;
                    case 'button_b' :
                        code = 0x131;
                        /*'BTN_B'*/
                        break;
                }
                if (code) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, code, 1);
                }
            },

            up: function (btn) {
                var code;
                switch (btn) {
                    case 'button_x' :
                        code = 0x133;
                        /*'BTN_X'*/
                        break;
                    case 'button_y' :
                        code = 0x134;
                        /*'BTN_Y'*/
                        break;
                    case 'button_a' :
                        code = 0x130;
                        /*'BTN_A'*/
                        break;
                    case 'button_b' :
                        code = 0x131;
                        /*'BTN_B'*/
                        break;
                }
                if (code) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, code, 0);
                }
            },

            region: function () {
                return [document.body.clientWidth / 2, menu_height, document.body.clientWidth / 2, document.body.clientHeight]
            }
        });

        window.addEventListener('resize', function () {
            buttons.setPosition(document.body.clientWidth / 2 + document.body.clientWidth / 4, document.body.clientHeight / 2);
        })
    },

    createTouchpadClient: function (options) {
        function leftCode() { return settings.leftHandMode ? 0x111 : 0x110; }
        function rightCode() { return settings.leftHandMode ? 0x110 : 0x111; }

        function emitTP(type, code, value) {
            app.emit("touchpadEvent", type, code, value);
        }

        function emitClick(code) {
            emitTP(1 /* EV_KEY */, code, 1);
            setTimeout(function () {
                emitTP(1 /* EV_KEY */, code, 0);
            }, 45);
        }

        function emitKB(code, value) {
            if (app.socket) {
                var ev = {
                    type: 0x01,
                    code: code,
                    value: value,
                    hardware: false
                };
                app.socket.emit("boardEvent", ev);
                app.socket.emit("keyboardEvent", ev);
            }
        }

        function emitKeyCombo(keys) {
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
        var isTapDragging = false;
        var isThreeFingerDragging = false;
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

        // Accumulators
        var accumX = 0;
        var accumY = 0;
        var scrollAccumY = 0;
        var scrollAccumX = 0;
        var zoomAccum = 0;

        var isChordingMiddle = false;

        options.btn_left && options.btn_left.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks |= 1;
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /*'EV_KEY'*/, leftCode(), 0);
                emitTP(1 /*'EV_KEY'*/, rightCode(), 0);
                emitTP(1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 1);
            } else if (!isTapDragging && !isThreeFingerDragging) {
                emitTP(1 /*'EV_KEY'*/, leftCode(), 1);
            }
        });
        options.btn_left && options.btn_left.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~1;
            if (isChordingMiddle) {
                emitTP(1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 0);
                isChordingMiddle = false;
                if (app.clicks & 2) emitTP(1 /*'EV_KEY'*/, rightCode(), 1);
            } else if (!isTapDragging && !isThreeFingerDragging) {
                emitTP(1 /*'EV_KEY'*/, leftCode(), 0);
            }
        });

        options.btn_right && options.btn_right.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks |= 2;
            if ((app.clicks & 3) === 3) {
                isChordingMiddle = true;
                emitTP(1 /*'EV_KEY'*/, leftCode(), 0);
                emitTP(1 /*'EV_KEY'*/, rightCode(), 0);
                emitTP(1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 1);
            } else {
                emitTP(1 /*'EV_KEY'*/, rightCode(), 1);
            }
        });
        options.btn_right && options.btn_right.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.clicks &= ~2;
            if (isChordingMiddle) {
                emitTP(1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 0);
                isChordingMiddle = false;
                if (app.clicks & 1) emitTP(1 /*'EV_KEY'*/, leftCode(), 1);
            } else {
                emitTP(1 /*'EV_KEY'*/, rightCode(), 0);
            }
        });

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
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 1);
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
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
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
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
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
                    app.emit(
                        ["touchpadEvent", 2 /*'EV_REL'*/, 0 /*'REL_X'*/, sendX],
                        ["touchpadEvent", 2 /*'EV_REL'*/, 1 /*'REL_Y'*/, sendY]
                    );
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

                if (settings.pinchToZoom !== false && (isPinching || (spanDeltaTotal > 25 && spanDeltaTotal > 1.3 * midDeltaTotal))) {
                    isPinching = true;
                    zoomAccum += dSpan * 0.09;
                    var zoomSteps = Math.trunc(zoomAccum);
                    if (zoomSteps !== 0) {
                        zoomAccum -= zoomSteps;
                        emitKB(29 /* KEY_LEFTCTRL */, 1);
                        app.emit("touchpadEvent", 2 /*'EV_REL'*/, 8 /*'REL_WHEEL'*/, zoomSteps);
                    }
                } else {
                    var scrollSign = settings.naturalScrolling ? 1 : -1;
                    var moveY = dMidY;
                    var moveX = dMidX;

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
                        app.emit("touchpadEvent", 2 /*'EV_REL'*/, 8 /*'REL_WHEEL'*/, wheelY);
                    }
                    if (wheelX !== 0) {
                        scrollAccumX -= wheelX;
                        app.emit("touchpadEvent", 2 /*'EV_REL'*/, 6 /*'REL_HWHEEL'*/, wheelX);
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
                        app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 1);
                        isThreeFingerDragging = true;
                    }

                    var rawX = (dCentroidX >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dCentroidX), acc);
                    var rawY = (dCentroidY >= 0 ? 1.0 : -1.0) * Math.pow(Math.abs(spd * dCentroidY), acc);
                    accumX += rawX;
                    accumY += rawY;

                    var sendX = Math.trunc(accumX);
                    var sendY = Math.trunc(accumY);
                    if (sendX !== 0 || sendY !== 0) {
                        accumX -= sendX;
                        accumY -= sendY;
                        app.emit(
                            ["touchpadEvent", 2 /*'EV_REL'*/, 0 /*'REL_X'*/, sendX],
                            ["touchpadEvent", 2 /*'EV_REL'*/, 1 /*'REL_Y'*/, sendY]
                        );
                    }
                }
            }
        });

        options.area && options.area.addEventListener('touchend', function (e) {
            if (e.cancelable) e.preventDefault();
            var remaining = e.targetTouches.length;
            lastTouchCount = remaining;

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
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isThreeFingerDragging = false;
                }

            } else if (remaining === 0) {
                var now = Date.now();

                if (isTapDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isTapDragging = false;
                    lastTapTime = 0;

                } else if (isThreeFingerDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isThreeFingerDragging = false;
                    lastTapTime = 0;

                } else if (threeFingerStartTime > 0 && threeFingerMoved) {
                    var dur3 = now - threeFingerStartTime;
                    var total3X = prevCentroidX - threeFingerStartX;
                    var total3Y = prevCentroidY - threeFingerStartY;
                    var dist3 = Math.hypot(total3X, total3Y);

                    if (dur3 < 380 && dist3 > 45) {
                        if (Math.abs(total3Y) > 1.4 * Math.abs(total3X)) {
                            if (total3Y < 0) {
                                emitKeyCombo([125 /* Super */]);
                            } else {
                                emitKeyCombo([125 /* Super */, 32 /* D */]);
                            }
                        } else if (Math.abs(total3X) > 1.4 * Math.abs(total3Y)) {
                            if (total3X > 0) {
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 105 /* Left */]);
                            } else {
                                emitKeyCombo([29 /* Ctrl */, 56 /* Alt */, 106 /* Right */]);
                            }
                        }
                    }
                    threeFingerStartTime = 0;

                } else if (threeFingerStartTime > 0 && !threeFingerMoved && (now - threeFingerStartTime < 320)) {
                    // ── 3-Finger Tap -> Middle Click ──
                    emitClick(0x112 /* BTN_MIDDLE */);
                    threeFingerStartTime = 0;
                    lastTapTime = 0;

                } else if (twoFingerStartTime > 0 && twoFingerMoved) {
                    var dur2 = now - twoFingerStartTime;
                    var total2X = prevMidX - twoFingerStartX;
                    var total2Y = prevMidY - twoFingerStartY;

                    if (dur2 < 320 && Math.abs(total2X) > 75 && Math.abs(total2X) > 2.5 * Math.abs(total2Y)) {
                        if (total2X > 0) {
                            emitKeyCombo([56 /* Alt */, 105 /* Left */]);
                        } else {
                            emitKeyCombo([56 /* Alt */, 106 /* Right */]);
                        }
                    }
                    twoFingerStartTime = 0;

                } else if (twoFingerStartTime > 0 && !twoFingerMoved && (now - twoFingerStartTime < 320)) {
                    var timeSinceLast2Tap = now - lastTwoFingerTapTime;
                    if (timeSinceLast2Tap < 300) {
                        // 2-Finger Double-Tap -> Middle Click
                        emitClick(0x112 /* BTN_MIDDLE */);
                        lastTwoFingerTapTime = 0;
                    } else {
                        // 2-Finger Tap -> Right Click
                        emitClick(0x111 /* BTN_RIGHT */);
                        lastTwoFingerTapTime = now;
                    }
                    twoFingerStartTime = 0;
                    lastTapTime = 0;

                } else if (oneFingerStartTime > 0 && !oneFingerMoved && (now - oneFingerStartTime < 320) && app.clicks === 0) {
                    // ── 1-Finger Tap -> Left Click ──
                    emitClick(0x110 /* BTN_LEFT */);
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
        })
    },

    init: function () {
        app.createJoystickClient({
            area: document.getElementById('touchpad-area')
        });

        app.createTouchpadClient({
            area: document.getElementById('touchpad-area'),
            btn_left: document.getElementById('touchpad-btn_left'),
            btn_right: document.getElementById('touchpad-btn_right')
        });

        var touchpad_screen = document.getElementById('touchpad'),
            joystick_screen = document.getElementById('joystick');

        document.getElementById('goFullscreen').addEventListener('click', function () {
            app.toggleFullScreen();
        });
        document.getElementById('goFullscreen').addEventListener('touchend', function () {
            app.toggleFullScreen();
        });

        document.getElementById('setTouchpad').addEventListener('click', function () {
            joystick_screen.style.display = 'none';
            touchpad_screen.style.display = 'block';
            app.current_device = TOUCHPAD;
        });
        document.getElementById('setTouchpad').addEventListener('touchend', function () {
            joystick_screen.style.display = 'none';
            touchpad_screen.style.display = 'block';
            app.current_device = TOUCHPAD;
        });

        document.getElementById('setJoystick').addEventListener('click', function () {
            joystick_screen.style.display = 'block';
            touchpad_screen.style.display = 'none';
            app.current_device = JOYSTICK;
        });
        document.getElementById('setJoystick').addEventListener('touchend', function () {
            joystick_screen.style.display = 'block';
            touchpad_screen.style.display = 'none';
            app.current_device = JOYSTICK;
        });
        document.getElementById('gear-svg').addEventListener('click', function () {
            settings.modal.open();
        });

        !function connect() {
            app.socket = io();

            app.socket.on("touchpadConnected", function (data) {
                slotNumber = data.touchpadId;
                document.getElementById('connecting').style.display = 'none';
            });

            app.socket.on("connect", function () {
                app.socket.emit("connectTouchpad", null);
                document.getElementById('connecting').style.display = 'block';
            });

            app.socket.on("disconnect", function () {
                location.reload();
            });
        }();
    },

    // Code from https://developer.mozilla.org/en-US/docs/Web/Guide/DOM/Using_full_screen_mode
    // because I'm to lazy...
    toggleFullScreen: function () {
        if (!document.fullscreenElement &&    // alternative standard method
            !document.mozFullScreenElement && !document.webkitFullscreenElement) {  // current working methods
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        } else {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
        }
    }
};
