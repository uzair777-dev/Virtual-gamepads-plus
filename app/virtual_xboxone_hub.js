var config = require('../config');
var xboxone_gamepad = require('./virtual_xboxone_gamepad');
var log = require('../lib/log');

var num_gamepads = config.ledBitFieldSequence.length;

var virtual_xboxone_hub = (function() {
  function virtual_xboxone_hub() {
    this.gamepads = [];
    for (var i = 0; i < num_gamepads; i++) {
      this.gamepads[i] = void 0;
    }
  }

  virtual_xboxone_hub.prototype.connectGamepad = function(callback, vibrateCallback) {
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
      log('warning', "Couldn't add new xboxone gamepad: no slot left.");
      return callback(-1);
    } else {
      log('info', 'Creating and connecting to xboxone gamepad number ' + padId);
      this.gamepads[padId] = new xboxone_gamepad();
      this.gamepads[padId].onVibrate = function(duration) {
        if (vibrateCallback) vibrateCallback(padId, duration);
      };
      
      return this.gamepads[padId].connect(function() {
        return callback(padId);
      }, function(err) {
        this.gamepads[padId] = void 0;
        log('error', "Couldn't connect to xboxone gamepad:\n" + JSON.stringify(err));
        return callback(-1);
      });
    }
  };

  virtual_xboxone_hub.prototype.disconnectGamepad = function(padId, callback) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].disconnect((function(_this) {
        return function() {
          _this.gamepads[padId] = void 0;
          return callback();
        };
      })(this));
    }
  };

  virtual_xboxone_hub.prototype.sendEvent = function(padId, event) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].sendEvent(event);
    }
  };

  virtual_xboxone_hub.prototype.getStatus = function() {
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

  return virtual_xboxone_hub;
})();

module.exports = virtual_xboxone_hub;
