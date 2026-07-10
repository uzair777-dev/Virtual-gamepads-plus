###
Virtual XInput Gamepad Hub class
Manages multiple xinput gamepad slots
###

xinput_gamepad = require './virtual_xinput_gamepad'
log = require '../lib/log'
config = require '../config'

num_gamepads = config.ledBitFieldSequence.length

class virtual_xinput_gamepad_hub

  constructor: () ->
    @gamepads = []
    for i in [0..(num_gamepads-1)]
      @gamepads[i] = undefined

  connectGamepad: (callback) ->
    padId = 0
    freeSlot = false

    while !freeSlot and padId < num_gamepads
      if !@gamepads[padId]
        freeSlot = true
      else
        padId++

    if !freeSlot
      log 'warning', "Couldn't add new xinput gamepad: no slot left."
      callback -1
    else
      log 'info', 'Creating and connecting to xinput gamepad number ' + padId
      @gamepads[padId] = new xinput_gamepad()
      @gamepads[padId].connect () ->
        callback padId
      , (err) ->
        @gamepads[padId] = undefined
        log 'error', "Couldn't connect to xinput gamepad:\n" + JSON.stringify(err)
        callback -1

  disconnectGamepad: (padId, callback) ->
    if @gamepads[padId]
      @gamepads[padId].disconnect () =>
        @gamepads[padId] = undefined
        callback()

  sendEvent: (padId, event) ->
    if @gamepads[padId]
      @gamepads[padId].sendEvent event

module.exports = virtual_xinput_gamepad_hub
