var fs = require('fs');
var ioctl = require('ioctl');
var uinput = require('../lib/uinput');
var uinputStructs = require('../lib/uinput_structs');
var log = require('../lib/log');

var virtual_xinput_gamepad = (function() {
  function virtual_xinput_gamepad() {}

  virtual_xinput_gamepad.prototype.connect = function(callback, error, retry) {
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
          // Face buttons
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_A);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_B);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_X);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_Y);
          // Bumpers
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_TL);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_TR);
          // Menu buttons
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_START);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_SELECT);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_MODE);
          // Stick clicks
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_THUMBL);
          ioctl(_this.fd, uinput.UI_SET_KEYBIT, uinput.BTN_THUMBR);

          // Axes
          ioctl(_this.fd, uinput.UI_SET_EVBIT, uinput.EV_ABS);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_X);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_Y);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RX);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RY);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_Z);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_RZ);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_HAT0X);
          ioctl(_this.fd, uinput.UI_SET_ABSBIT, uinput.ABS_HAT0Y);

          uidev = new uinputStructs.uinput_user_dev;
          uidev_buffer = uidev.ref();
          uidev_buffer.fill(0);
          uidev.name = Array.from("Microsoft X-Box 360 pad");
          uidev.id.bustype = uinput.BUS_USB;
          uidev.id.vendor = 0x045e;
          uidev.id.product = 0x028e;
          uidev.id.version = 0x0114;

          // Setup left stick ranges
          uidev.absmax[uinput.ABS_X] = 32767;
          uidev.absmin[uinput.ABS_X] = -32768;
          uidev.absfuzz[uinput.ABS_X] = 16;
          uidev.absflat[uinput.ABS_X] = 128;

          uidev.absmax[uinput.ABS_Y] = 32767;
          uidev.absmin[uinput.ABS_Y] = -32768;
          uidev.absfuzz[uinput.ABS_Y] = 16;
          uidev.absflat[uinput.ABS_Y] = 128;

          // Setup right stick ranges
          uidev.absmax[uinput.ABS_RX] = 32767;
          uidev.absmin[uinput.ABS_RX] = -32768;
          uidev.absfuzz[uinput.ABS_RX] = 16;
          uidev.absflat[uinput.ABS_RX] = 128;

          uidev.absmax[uinput.ABS_RY] = 32767;
          uidev.absmin[uinput.ABS_RY] = -32768;
          uidev.absfuzz[uinput.ABS_RY] = 16;
          uidev.absflat[uinput.ABS_RY] = 128;

          // Setup triggers
          uidev.absmax[uinput.ABS_Z] = 255;
          uidev.absmin[uinput.ABS_Z] = 0;
          uidev.absfuzz[uinput.ABS_Z] = 0;
          uidev.absflat[uinput.ABS_Z] = 0;

          uidev.absmax[uinput.ABS_RZ] = 255;
          uidev.absmin[uinput.ABS_RZ] = 0;
          uidev.absfuzz[uinput.ABS_RZ] = 0;
          uidev.absflat[uinput.ABS_RZ] = 0;

          // Setup dpad (hat)
          uidev.absmax[uinput.ABS_HAT0X] = 1;
          uidev.absmin[uinput.ABS_HAT0X] = -1;
          uidev.absfuzz[uinput.ABS_HAT0X] = 0;
          uidev.absflat[uinput.ABS_HAT0X] = 0;

          uidev.absmax[uinput.ABS_HAT0Y] = 1;
          uidev.absmin[uinput.ABS_HAT0Y] = -1;
          uidev.absfuzz[uinput.ABS_HAT0Y] = 0;
          uidev.absflat[uinput.ABS_HAT0Y] = 0;

          return fs.write(_this.fd, uidev_buffer, 0, uidev_buffer.length, null, function(err) {
            var error1;
            if (err) {
              log('error', "Error on init xinput gamepad write:\n" + JSON.stringify(err));
              return error(err);
            } else {
              try {
                ioctl(_this.fd, uinput.UI_DEV_CREATE);
                return callback();
              } catch (error1) {
                err = error1;
                log('error', "Error on xinput gamepad dev creation:\n" + JSON.stringify(err));
                fs.closeSync(_this.fd);
                _this.fd = void 0;
                if (retry < 5) {
                  log('info', "Retry to create xinput gamepad");
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

  virtual_xinput_gamepad.prototype.disconnect = function(callback) {
    if (this.fd) {
      ioctl(this.fd, uinput.UI_DEV_DESTROY);
      fs.closeSync(this.fd);
      this.fd = void 0;
      return callback();
    }
  };

  virtual_xinput_gamepad.prototype.sendEvent = function(event, error) {
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

  return virtual_xinput_gamepad;

})();

module.exports = virtual_xinput_gamepad;
