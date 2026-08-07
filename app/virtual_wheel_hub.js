var config = require('../config');
var virtual_wheel = require('./virtual_wheel');
var log = require('../lib/log');

var num_gamepads = config.maxWheels || config.ledBitFieldSequence.length;

var virtual_wheel_hub = (function() {
  function virtual_wheel_hub() {
    this.gamepads = [];
    for (var i = 0; i < num_gamepads; i++) {
      this.gamepads[i] = void 0;
    }
  }

virtual_wheel_hub.prototype.connectWheel = function(callback) {
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
 log('warning', "Couldn't add new virtual wheel: no slot left.");
 return callback(-1);
 } else {
 log('info', 'Creating and connecting to virtual wheel number ' + padId);
 this.gamepads[padId] = new virtual_wheel();

 return this.gamepads[padId].connect((function(_this) {
 return function() {
 return callback(padId);
 };
 })(this), (function(_this) {
 return function(err) {
 _this.gamepads[padId] = void 0;
 log('error', "Couldn't connect to virtual wheel:\n" + JSON.stringify(err));
 return callback(-1);
 };
 })(this));
 }
};

  virtual_wheel_hub.prototype.disconnectWheel = function(padId, callback) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].disconnect((function(_this) {
        return function() {
          _this.gamepads[padId] = void 0;
          return callback();
        };
      })(this));
    }
  };

  virtual_wheel_hub.prototype.sendEvent = function(padId, event) {
    if (this.gamepads[padId]) {
      return this.gamepads[padId].sendEvent(event);
    }
  };

  virtual_wheel_hub.prototype.getStatus = function() {
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

  return virtual_wheel_hub;
})();

module.exports = virtual_wheel_hub;