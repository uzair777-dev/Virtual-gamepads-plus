# Virtual Gamepad Plus

This repo is a fork of [alr86/node-virtual-gamepads-revived](https://github.com/alr86/node-virtual-gamepads-revived) (which is a fork of [node-virtual-gamepads](https://github.com/jehervy/node-virtual-gamepads)) with ~~some~~ Many changes(just tested in linux, and will only ):

- ~~Show server QR-Code~~ [Unsupported currently, Doesn't work]
- ~~Gyro support~~ [Partial, will be impelmented]
- Dark Mode
- An Script to test gamepads [Test pending]
- Better styles
- Also have "L2", "R2" & "Menu" buttons
- XBOX-Style buttons layout with xinput support
- ~~PreDefiend `.desktop` files to run script(needs change)~~ 

View [TODO](#todo) for Upcoming stuffs 

## Install and run:
```bash
    git clone https://github.com/uzair777-dev/Virtual-gamepads-revived-again
    cd Virtual-gamepads-revived-again
    ./run.sh
```


> [!WARNING]
> The below documentation is old but will be replaced only after I implement all the [stuff](#todo) first.


## ScreenShot:
(Red L2-R2 Buttons over D-pad only works when gyro enabled)
![Standalone installation step 1](https://github.com/uzair777-dev/Virtual-gamepads-revived-again/blob/master/public/images/screenshot.jpg?raw=true)
---
# Node-Virtual-Gamepads ReadMe:

This nodejs application turns your smartphone into a gamepad controller on Linux OS simply by reaching a local address.
You can virtually plug in multiple gamepad controllers.

Demo
----
Original Demo video 1 player in game [here](https://www.youtube.com/watch?v=OWgWugNsF7w)

Original Demo video 3 players on EmulStation [here](https://www.youtube.com/watch?v=HQROnYLRyOw)

Prerequisite
------------
This application is only compatible with Linux OS with the **uinput** kernel module installed.

If you encounter problems while installing or running node-virtual-gamepads have
a look at the [troubleshooting](TROUBLESHOOTING.md) page.

You can now configure the server to your needs. Just open `config.json`
with the editor of you choice and adjust the values. Explanation of the
individual values can be found in [README_CONFIG.md](README_CONFIG.md).

Usage
-----
Once the nodejs application is launched, you just have to plug your gamepad controller
by connecting your device on the same local network and by reaching the address *http://node_server_address*

Features
--------
### Plug up to 4 virtual gamepads
The application will plug automatically a new controller when the web application is launched and unplug it at disconnection.
4 slots are available so 4 virtual gamepads can be created. You can see your current slot on the indicator directly on the vitual gamepad.

![Virtual gamepad](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/standalone.png?raw=true)

### Use it as standalone application (chrome mobile)
With the [add to homescreen](https://developer.chrome.com/multidevice/android/installtohomescreen) chrome feature,
you can easily use virtual gamepads application without launching the browser each time you want to play.

With only 3 clicks, virtual gamepads web application becomes a standalone application.

![Standalone installation step 1](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/standalone_step1.png?raw=true)
![Standalone installation step 2](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/standalone_step2.png?raw=true)

Then a shortcut is added on your homescreen and the application will be launched outside the browser.

![Virtual gamepad directly from the homescreen](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/standalone_step3.png?raw=true)
![Launched outside the browser](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/standalone_step4.png?raw=true)

### Enjoy haptic feedbacks
Because it's difficult to spot the right place in a touch screen without looking at it,
the touch zone of each button was increased. LT button was moved at the center of the screen
to let as much space as possible for the joystick and avoid touch mistakes.

![Step 1](https://github.com/miroof/node-virtual-gamepads/blob/resources/schemas/touch_zones.png?raw=true)

To know if we pressed a button with success, the web application provides an haptic feedback
which can be easily deactivated by turning off the vibrations of the phone.

### Use the keyboard to enter text
![Virtual Keyboard](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/keyboard.png?raw=true)

### Use the touchpad for mouse inputs
![Virtual Touchpad](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/touchpad.png?raw=true)

### An index page lets you choose
![Index page](https://github.com/miroof/node-virtual-gamepads/blob/resources/screenshots/index.png?raw=true)

Developing
----------
Please read the [contribution guideline](CONTRIBUTING.md) first if you haven't already.

Clone this repository and install its dependencies with

    npm install

When you change something in a coffeescript (e.g. main.coffee) run

    npx coffee -c main.coffee

This will compile main.coffee to main.js which than can be run with node
(see [Installation](README.md#installation))
To compile all coffee files when ever they change run

    npx coffee -cw .

If you want do add a new keyboard layout please refer to [this file](CREATE_KEYBOARD_LAYOUT.md).


## TODO 

1) Fixing Stuff First:
    - [ ] Proper multi device connect 
    - [ ]  Actual Multithreading 
    - [ ]  Proper Navigation for website
    - [ ]  Remove depreciated stuff

2) Adding Support for wheel:
    - [ ] Steering wheel native axis support
    - [ ] Pedals support, with variable pressure sensitivity
    - [ ] Shifter support(Probably)
    - [ ] Button mapping
    - [ ] Profile support

3) Server-side profile management:
    - [ ] Add a settings page to load/save/edit profiles
    - [ ] Save profiles to file, probabaly in ./config/controllerprofiles/ (?)
    - [ ] Auto-load last profile (based on client, idk)
    
4) Better gyro implementation:
    - [ ] Implement gyro first
    - [ ] Pitch/yaw smoothing
    - [ ] Optional reset button
    - [ ] Centering on button press

5) Profile switching:
    - [ ] Quick profile toggle (LB/RB?)
    - [ ] Visual indicator for active profile

6) UI/UX improvements:
    - [ ] Touch lock toggle (disable gyro on touch)
    - [ ] Button remapping
    - [ ] Custom button layouts per profile

7) Hardware compatibility:
    - [ ] Test on real Android device
    - [ ] Test gyro on iOS (if possible)
    - [ ] Test L2/R2 triggers on real device

8) Performance:
    - [ ] Optimize gyro processing
    - [ ] Optimise the whole script in general
    - [ ] Reduce latency
    - [ ] Test battery impact

9) Advanced features:
    - [ ] Gyro-to-mouse mode(Steam controller type (?) idk)
    - [ ] Touchpad mode improvements
    - [ ] Keyboard layouts per profile
    
10) Documentation:
    - [ ] Some documentation as needed
    - [ ] Add pictures of the new version 

11) Installation:
    - [ ] Install script that does most of the work





