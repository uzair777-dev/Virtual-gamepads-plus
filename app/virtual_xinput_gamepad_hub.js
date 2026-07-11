var config = require('../config');
var xinput_gamepad = require('./virtual_xinput_gamepad');
var log = require('../lib/log');

var num_gamepads = config.ledBitFieldSequence.length;

var virtual_xinput_gamepad_hub = (function() {
  function virtual_xinput_gamepad_hub() {
    this.gamepads = [];
    for (var i = 0; i < num_gamepads; i++) {
      this.gamepads[i] = void 0;
    }
  }

  virtual_xinput_gamepad_hub.prototype.connectGamepad = function(callback) {
    var freeSlot = false;
    var padId = 0;
    while (!freeSlot && padId < num_gamepads) {
      if (!this.gamepads[padId]) {
        freeSlot = true;
      } else {
        padId++;
      }
    }
    if (!freeSlot) {
      log('warning', "Couldn't add new xinput gamepad: no slot left.");
      return callback(-1);
    } else {
      log('info', 'Creating and connecting to xinput gamepad number ' + padId);
      this.gamepads[padId] = new xinput_gamepad();
      return this.gamepads[padId].connect(function() {
        return callback(padId);
      }, function(err) {
        this.gamepads[padId] = void 0;
        log('error', "Couldn't connect to xinput gamepad:\n" + JSON.stringify(err));
        return callback(-1);
      });
    }
  };

  virtual_xinput_gamepad_hub.prototype.disconnectGamepad = function(padId, callback) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].disconnect((function(_this) {
        return function() {
          _this.gamepads[padId] = void 0;
          return callback();
        };
      })(this));
    }
  };

  virtual_xinput_gamepad_hub.prototype.sendEvent = function(padId, event) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].sendEvent(event);
    }
  };

  virtual_xinput_gamepad_hub.prototype.getStatus = function() {
    var slots = [];
    var used = 0;
    for (var i = 0; i < num_gamepads; i++) {
      var occupied = !!this.gamepads[i];
      slots.push(occupied);
      if (occupied) used++;
    }
    return {
      slots: slots,
      total: num_gamepads,
      used: used,
      free: num_gamepads - used
    };
  };

  return virtual_xinput_gamepad_hub;
})();

module.exports = virtual_xinput_gamepad_hub;
