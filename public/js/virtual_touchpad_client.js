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

    settings.update = function(update) {
        if (update.hasOwnProperty('speed')) settings.speed = parseFloat(update.speed);
        if (update.hasOwnProperty('acceleration')) settings.acceleration = parseFloat(update.acceleration);
        if (update.hasOwnProperty('naturalScrolling')) settings.naturalScrolling = !!update.naturalScrolling;
        if (update.hasOwnProperty('leftHandMode')) settings.leftHandMode = !!update.leftHandMode;
        if (localStorageAvailable) {
            window.localStorage.setItem('touchpadSettings', JSON.stringify({
                speed: settings.speed,
                acceleration: settings.acceleration,
                naturalScrolling: settings.naturalScrolling,
                leftHandMode: settings.leftHandMode
            }));
        }
    };

    function defaultSettings() {
        return {
            speed: 2,
            acceleration: 1.5,
            naturalScrolling: false,
            leftHandMode: false
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

        var isTapDragging = false;
        var isThreeFingerDragging = false;
        var lastTapTime = 0;
        var lastTapX = 0;
        var lastTapY = 0;
        var gestureStartTime = 0;
        var gestureStartX = 0;
        var gestureStartY = 0;
        var prevX = 0;
        var prevY = 0;
        var hasMoved = false;
        var maxTouches = 0;
        var accumX = 0;
        var accumY = 0;
        var scrollAccumY = 0;

        options.btn_left && options.btn_left.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            if (!isTapDragging && !isThreeFingerDragging) {
                app.emit("touchpadEvent", 1 /*'EV_KEY'*/, leftCode(), 1);
            }
            app.clicks |= 1;
        });
        options.btn_left && options.btn_left.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            if (!isTapDragging && !isThreeFingerDragging) {
                app.emit("touchpadEvent", 1 /*'EV_KEY'*/, leftCode(), 0);
            }
            app.clicks &= ~1;
        });

        options.btn_right && options.btn_right.addEventListener('touchstart', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.emit("touchpadEvent", 1 /*'EV_KEY'*/, rightCode(), 1);
            app.clicks |= 2;
        });
        options.btn_right && options.btn_right.addEventListener('touchend', function (e) {
            if (e && e.cancelable) e.preventDefault();
            app.emit("touchpadEvent", 1 /*'EV_KEY'*/, rightCode(), 0);
            app.clicks &= ~2;
        });

        options.area && options.area.addEventListener('touchstart', function (e) {
            if (e.cancelable) e.preventDefault();
            var numTouches = e.targetTouches.length;
            var t = e.targetTouches[0];
            if (!t) return;

            var now = Date.now();
            if (numTouches === 1) {
                var timeSinceLastTap = now - lastTapTime;
                var distFromLastTap = Math.hypot(t.pageX - lastTapX, t.pageY - lastTapY);
                if (timeSinceLastTap < 320 && distFromLastTap < 40) {
                    isTapDragging = true;
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 1);
                } else {
                    isTapDragging = false;
                }
                gestureStartTime = now;
                gestureStartX = t.pageX;
                gestureStartY = t.pageY;
                prevX = t.pageX;
                prevY = t.pageY;
                hasMoved = false;
                maxTouches = 1;
                accumX = 0;
                accumY = 0;
                scrollAccumY = 0;
            } else {
                if (isTapDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isTapDragging = false;
                }
                maxTouches = Math.max(maxTouches, numTouches);
                prevX = t.pageX;
                prevY = t.pageY;
            }
        });

        options.area && options.area.addEventListener('touchmove', function (e) {
            if (e.cancelable) e.preventDefault();
            var numTouches = e.targetTouches.length;
            maxTouches = Math.max(maxTouches, numTouches);

            var t = e.targetTouches[0];
            if (!t) return;

            var dx = t.pageX - prevX;
            var dy = t.pageY - prevY;
            prevX = t.pageX;
            prevY = t.pageY;

            if (Math.abs(dx) + Math.abs(dy) > 3) {
                hasMoved = true;
            }

            var spd = settings.speed;
            var acc = settings.acceleration;

            if (numTouches >= 3) {
                // 3-finger drag
                if (!isThreeFingerDragging && app.clicks === 0 && !isTapDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 1);
                    isThreeFingerDragging = true;
                }
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
            } else if (numTouches === 2) {
                // 2-finger scroll
                var scrollSign = settings.naturalScrolling ? 1 : -1;
                scrollAccumY += (dy * scrollSign * 0.15 * spd);
                var wheelSteps = Math.trunc(scrollAccumY);
                if (wheelSteps !== 0) {
                    scrollAccumY -= wheelSteps;
                    app.emit("touchpadEvent", 2 /*'EV_REL'*/, 8 /*'REL_WHEEL'*/, wheelSteps);
                }
            } else if (numTouches === 1) {
                // 1-finger move / tap-drag
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
            }
        });

        options.area && options.area.addEventListener('touchend', function (e) {
            if (e.cancelable) e.preventDefault();
            if (e.targetTouches.length === 0) {
                var duration = Date.now() - gestureStartTime;
                if (isTapDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isTapDragging = false;
                    lastTapTime = 0;
                } else if (isThreeFingerDragging) {
                    app.emit("touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0);
                    isThreeFingerDragging = false;
                    lastTapTime = 0;
                } else if (!hasMoved && duration < 320 && app.clicks === 0) {
                    if (maxTouches === 1) {
                        app.emit(
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 1],
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x110 /*'BTN_LEFT'*/, 0]
                        );
                        lastTapTime = Date.now();
                        lastTapX = gestureStartX;
                        lastTapY = gestureStartY;
                    } else if (maxTouches === 2) {
                        app.emit(
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x111 /*'BTN_RIGHT'*/, 1],
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x111 /*'BTN_RIGHT'*/, 0]
                        );
                        lastTapTime = 0;
                    } else if (maxTouches === 3) {
                        app.emit(
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 1],
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x112 /*'BTN_MIDDLE'*/, 0]
                        );
                        lastTapTime = 0;
                    } else if (maxTouches >= 4) {
                        app.emit(
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x113 /*'BTN_SIDE'*/, 3],
                            ["touchpadEvent", 1 /*'EV_KEY'*/, 0x113 /*'BTN_SIDE'*/, 3]
                        );
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
