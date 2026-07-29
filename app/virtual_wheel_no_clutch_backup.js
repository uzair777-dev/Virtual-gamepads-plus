var fs = require('fs');
var ioctl = require('ioctl');
var uinput = require('../lib/uinput');
var uinputStructs = require('../lib/uinput_structs');
var log = require('../lib/log');

var virtual_wheel = (function() {
  function virtual_wheel() {}

  virtual_wheel.prototype.connect = function(callback, error, retry) {
    if (retry == null) {
      retry = 0;
    }
    return fs.open('/dev/uinput', 'w+', (function(_this) {
      return function(err, fd) {
        var uidev, uidev_buffer;
        if (err) {
          log('error', "Error on opening /dev/uinput:\n" + JSON.stringify(err));
          return error(err);
        } else {
          _this.fd = fd;
          ioctl(_this.fd, uinput.UI_SET_EVBIT, uinput.EV_KEY);
          // Common buttons for steering wheel
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_TRIGGER); // 0x120
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_THUMB);   // 0x121
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_TOP);     // 0x123 - Gear Up
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_TOP2);    // 0x124 - Gear Down
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE);    // 0x126
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE2);   // 0x127
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE3);   // 0x128
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE4);   // 0x129
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE5);   // 0x12a
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_BASE6);   // 0x12b

          // Axes
          ioctl(_this.fd, uinput.UI_SET_EVBIT, uinput.EV_ABS);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_X);       // Steering
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_Y);       // Throttle
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_Z);       // Brake
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RX);      // Clutch (axis 3)
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RY);      // Camera X (axis 4)
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RZ);      // Camera Y (axis 5)

          uidev = new uinputStructs.uinput_user_dev;
          uidev_buffer = uidev.ref();
          uidev_buffer.fill(0);
          uidev.name = Array.from("Virtual Racing Wheel");
          uidev.id.bustype = uinput.BUS_USB;
          uidev.id.vendor = 0x0003;
          uidev.id.product = 0x0006;
          uidev.id.version = 1;

          // Setup steering range (typically -32768 to 32767 for a wheel)
          uidev.absmax[uinput.ABS_X] = 32767;
          uidev.absmin[uinput.ABS_X] = -32768;
          uidev.absfuzz[uinput.ABS_X] = 16;
          uidev.absflat[uinput.ABS_X] = 0;

          // Setup throttle (0 to 255)
          uidev.absmax[uinput.ABS_Y] = 255;
          uidev.absmin[uinput.ABS_Y] = 0;
          uidev.absfuzz[uinput.ABS_Y] = 0;
          uidev.absflat[uinput.ABS_Y] = 0;

          // Setup brake (0 to 255)
          uidev.absmax[uinput.ABS_Z] = 255;
          uidev.absmin[uinput.ABS_Z] = 0;
          uidev.absfuzz[uinput.ABS_Z] = 0;
          uidev.absflat[uinput.ABS_Z] = 0;

          // Setup clutch (0 to 255) on ABS_RX (axis 3)
          uidev.absmax[uinput.ABS_RX] = 255;
          uidev.absmin[uinput.ABS_RX] = 0;
          uidev.absfuzz[uinput.ABS_RX] = 0;
          uidev.absflat[uinput.ABS_RX] = 0;

          // Setup camera X (right stick X) on ABS_RY (axis 4) -32767..32767
          uidev.absmax[uinput.ABS_RY] = 32767;
          uidev.absmin[uinput.ABS_RY] = -32767;
          uidev.absfuzz[uinput.ABS_RY] = 16;
          uidev.absflat[uinput.ABS_RY] = 0;

          // Setup camera Y (right stick Y) on ABS_RZ (axis 5) -32767..32767
          uidev.absmax[uinput.ABS_RZ] = 32767;
          uidev.absmin[uinput.ABS_RZ] = -32767;
          uidev.absfuzz[uinput.ABS_RZ] = 16;
          uidev.absflat[uinput.ABS_RZ] = 0;

          return fs.write(_this.fd, uidev_buffer, 0, uidev_buffer.length, null, function(err) {
            var error1;
            if (err) {
              log('error', "Error on init wheel write:\n" + JSON.stringify(err));
              return error(err);
            } else {
              try {
                ioctl(_this.fd, uinput.UI_DEV_CREATE);
                
                // Initialize pedal axes to 0 with a slight delay
                // Otherwise they default to 127/50% in kernel and early events are dropped
                setTimeout(function() {
                  if (_this.fd) {
                    try {
                      _this.sendEvent({ type: uinput.EV_ABS, code: uinput.ABS_Y, value: 0 });
                      _this.sendEvent({ type: uinput.EV_ABS, code: uinput.ABS_Z, value: 0 });
                      _this.sendEvent({ type: uinput.EV_ABS, code: uinput.ABS_RX, value: 0 }); // clutch
                      _this.sendEvent({ type: uinput.EV_ABS, code: uinput.ABS_RY, value: 0 }); // camera X
                      _this.sendEvent({ type: uinput.EV_ABS, code: uinput.ABS_RZ, value: 0 }); // camera Y
                    } catch (e) {
                      log('error', "Error initializing pedals: " + e);
                    }
                  }
                }, 250);

                return callback();
              } catch (error1) {
                err = error1;
                log('error', "Error on wheel dev creation:\n" + JSON.stringify(err));
                fs.closeSync(_this.fd);
                _this.fd = void 0;
                if (retry < 5) {
                  log('info', "Retry to create wheel");
                  return _this.connect(callback, error, retry + 1);
                } else {
                  log('error', "Gave up on creating device");
                  return error(err);
                }
              }
            }
          });
        }
      };
    })(this));
  };

  virtual_wheel.prototype.disconnect = function(callback) {
    if (this.fd) {
      ioctl(this.fd, uinput.UI_DEV_DESTROY);
      fs.closeSync(this.fd);
      this.fd = void 0;
    }
    return callback();
  };

  virtual_wheel.prototype.sendEvent = function(event, error) {
    var err, error1, error2, ev, ev_buffer, ev_end, ev_end_buffer;
    if (this.fd) {
      ev = new uinputStructs.input_event;
      ev.type = event.type;
      ev.code = event.code;
      ev.value = event.value;
      ev.time.tv_sec = Math.round(Date.now() / 1000);
      ev.time.tv_usec = Math.round(Date.now() % 1000 * 1000);
      ev_buffer = ev.ref();
      ev_end = new uinputStructs.input_event;
      ev_end.type = 0;
      ev_end.code = 0;
      ev_end.value = 0;
      ev_end.time.tv_sec = Math.round(Date.now() / 1000);
      ev_end.time.tv_usec = Math.round(Date.now() % 1000 * 1000);
      ev_end_buffer = ev_end.ref();
      try {
        fs.writeSync(this.fd, ev_buffer, 0, ev_buffer.length, null);
      } catch (error1) {
        err = error1;
        log('error', "Error on writing ev_buffer");
        throw err;
      }
      try {
        return fs.writeSync(this.fd, ev_end_buffer, 0, ev_end_buffer.length, null);
      } catch (error2) {
        err = error2;
        log('error', "Error on writing ev_end_buffer");
        throw err;
      }
    }
  };

  return virtual_wheel;

})();

module.exports = virtual_wheel;