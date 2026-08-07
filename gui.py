#!/usr/bin/env python3
import os
import sys
import subprocess
import signal
import json
import fcntl
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import GLib

# Set prgname BEFORE Gtk import so Wayland GDK backend registers app_id correctly with compositors
GLib.set_prgname("virtual-gamepads-plus")
GLib.set_application_name("Virtual Gamepads Plus")

from gi.repository import Gtk, GdkPixbuf, Pango

# Try to import AppIndicator3 for modern system tray, fallback to Gtk.StatusIcon for older DEs
try:
    gi.require_version('AppIndicator3', '0.1')
    from gi.repository import AppIndicator3 as AppIndicator
    HAS_APPINDICATOR = True
except (ValueError, ImportError):
    HAS_APPINDICATOR = False

try:
    import lib.segno_qr as segno
    HAS_SEGNO = True
except ImportError:
    HAS_SEGNO = False

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.expanduser('~/.config/virtual-gamepads-gui.json')

# X11 & Wayland application ID binding for panel/dock icon mapping
GLib.set_prgname("virtual-gamepads-plus")
GLib.set_application_name("Virtual Gamepads Plus")

def ensure_wayland_panel_icon():
    png_src = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.png')
    if not os.path.exists(png_src):
        return

    # 1. Install PNG into ~/.local/share/icons/hicolor/256x256/apps/ so desktop panels discover it
    icon_target_dir = os.path.expanduser('~/.local/share/icons/hicolor/256x256/apps')
    icon_target_file = os.path.join(icon_target_dir, 'virtual-gamepads-plus.png')
    try:
        os.makedirs(icon_target_dir, exist_ok=True)
        import shutil
        shutil.copyfile(png_src, icon_target_file)
    except Exception:
        pass

    # 2. Ensure .desktop file exists with StartupWMClass so Wayland panels (GNOME, KDE, Hyprland, Sway) match the window
    apps_dir = os.path.expanduser('~/.local/share/applications')
    desktop_file = os.path.join(apps_dir, 'virtual-gamepads-plus.desktop')
    try:
        os.makedirs(apps_dir, exist_ok=True)
        gui_py_path = os.path.join(SCRIPT_DIR, 'gui.py')
        desktop_content = f"""[Desktop Entry]
Name=Virtual Gamepads Plus
Comment=Virtual Racing Wheel & Gamepad Server
Exec=python3 {gui_py_path}
Icon={png_src}
Terminal=false
Type=Application
Categories=Game;Utility;
StartupWMClass=virtual-gamepads-plus
"""
        with open(desktop_file, 'w') as f:
            f.write(desktop_content)
    except Exception:
        pass

ensure_wayland_panel_icon()

class VirtualGamepadsGUI(Gtk.Window):
    def __init__(self):
        super().__init__(title="Virtual Gamepads Plus")
        self.set_wmclass("virtual-gamepads-plus", "Virtual-gamepads-plus")
        self.set_default_size(600, 500)
        self.set_border_width(10)

        # Set Window & Application Icon for X11 & Wayland (PNG format for Wayland compositors)
        png_path = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.png')
        ico_path = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.ico')
        icon_path = png_path if os.path.exists(png_path) else ico_path

        if os.path.exists(icon_path):
            try:
                self.set_icon_from_file(icon_path)
                Gtk.Window.set_default_icon_from_file(icon_path)
            except Exception as e:
                print(f"Notice: Could not load window icon: {e}")
        self.server_process = None
        self.io_watch_id = None
        self.user_stopped = False
        self.crash_count = 0
        self.max_crash_retries = 3
        self.last_crash_time = 0
        self.auto_restart_timeout_id = None
        
        self.load_config()

        # Layout
        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        self.add(vbox)
        
        # Header / Status
        self.status_label = Gtk.Label(label="Status: ● Stopped")
        self.status_label.set_use_markup(True)
        self.update_status_label(False)
        vbox.pack_start(self.status_label, False, False, 0)
        
        # QR Code and URL
        self.qr_image = Gtk.Image()
        self.qr_image.set_no_show_all(True)
        vbox.pack_start(self.qr_image, False, False, 0)
        
        self.url_label = Gtk.Label(label="URL: Not running")
        self.url_label.set_selectable(True)
        vbox.pack_start(self.url_label, False, False, 0)
        
        # Buttons
        button_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        button_box.set_halign(Gtk.Align.CENTER)
        vbox.pack_start(button_box, False, False, 0)
        
        self.start_btn = Gtk.Button(label="Start Server")
        self.start_btn.connect("clicked", self.on_start_clicked)
        button_box.pack_start(self.start_btn, False, False, 0)
        
        self.stop_btn = Gtk.Button(label="Stop Server")
        self.stop_btn.connect("clicked", self.on_stop_clicked)
        self.stop_btn.set_sensitive(False)
        button_box.pack_start(self.stop_btn, False, False, 0)
        
        # Checkbox controls
        chk_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        vbox.pack_start(chk_box, False, False, 0)

        # Tray Toggle
        self.tray_toggle = Gtk.CheckButton(label="Minimise to tray on close")
        self.tray_toggle.set_active(self.config.get('minimise_to_tray', False))
        self.tray_toggle.connect("toggled", self.on_tray_toggled)
        if not HAS_APPINDICATOR and not hasattr(Gtk, 'StatusIcon'):
            self.tray_toggle.set_sensitive(False)
            self.tray_toggle.set_tooltip_text("System tray is not supported on this desktop environment.")
        chk_box.pack_start(self.tray_toggle, False, False, 0)
        
        # Hot Reload Toggle
        self.hot_reload_toggle = Gtk.CheckButton(label="Hot Reload (watch for file changes)")
        self.hot_reload_toggle.set_active(self.config.get('hot_reload', False))
        self.hot_reload_toggle.connect("toggled", self.on_hot_reload_toggled)
        chk_box.pack_start(self.hot_reload_toggle, False, False, 0)

        # Debug Toggle
        self.debug_toggle = Gtk.CheckButton(label="Debug Logging")
        self.debug_toggle.set_active(self.config.get('debug', False))
        self.debug_toggle.connect("toggled", self.on_debug_toggled)
        chk_box.pack_start(self.debug_toggle, False, False, 0)

        # Log Output
        scrolled_window = Gtk.ScrolledWindow()
        scrolled_window.set_hexpand(True)
        scrolled_window.set_vexpand(True)
        vbox.pack_start(scrolled_window, True, True, 0)
        
        self.log_view = Gtk.TextView()
        self.log_view.set_editable(False)
        self.log_view.set_cursor_visible(False)
        # Use CSS provider instead of deprecated modify_font
        css_provider = Gtk.CssProvider()
        css_provider.load_from_data(b'textview { font-family: monospace; }')
        self.log_view.get_style_context().add_provider(
            css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        self.log_buffer = self.log_view.get_buffer()
        scrolled_window.add(self.log_view)
        
        # System Tray setup
        self.indicator = None
        self.status_icon = None
        self.setup_tray_icon()
        
        self.connect("delete-event", self.on_delete_event)
        
    def load_config(self):
        self.config = {'minimise_to_tray': False, 'hot_reload': False, 'debug': False}
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    self.config = json.load(f)
            except Exception:
                pass

    def save_config(self):
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self.config, f)
        except Exception:
            pass

    def on_tray_toggled(self, button):
        self.config['minimise_to_tray'] = button.get_active()
        self.save_config()

    def on_hot_reload_toggled(self, button):
        self.config['hot_reload'] = button.get_active()
        self.save_config()

    def on_debug_toggled(self, button):
        self.config['debug'] = button.get_active()
        self.save_config()

    def update_status_label(self, running):
        if running:
            self.status_label.set_markup("<span foreground='green'>Status: ● Running</span>")
        else:
            self.status_label.set_markup("<span foreground='red'>Status: ● Stopped</span>")

    def log(self, text):
        end_iter = self.log_buffer.get_end_iter()
        self.log_buffer.insert(end_iter, text)
        # Auto-scroll to bottom
        mark = self.log_buffer.create_mark(None, self.log_buffer.get_end_iter(), False)
        GLib.idle_add(self.log_view.scroll_to_mark, mark, 0.0, False, 0.0, 0.0)

    def on_start_clicked(self, button):
        if button is not None:
            self.log_buffer.set_text("")
            self.user_stopped = False

        self.start_btn.set_sensitive(False)
        run_script = os.path.join(SCRIPT_DIR, 'run.sh')
        
        # Smart Fallback Sudo Mode: run without pkexec if /dev/uinput is writable
        has_uinput_perm = os.access('/dev/uinput', os.W_OK)
        if has_uinput_perm:
            cmd = ['bash', run_script, '--gui']
            self.is_elevated = False
        else:
            cmd = ['pkexec', 'bash', run_script, '--gui']
            self.is_elevated = True
            self.log("Notice: Running elevated via pkexec. Run ./install.sh to enable passwordless mode.\n\n")

        if self.hot_reload_toggle.get_active():
            cmd.append('--hot-reload')
        if self.debug_toggle.get_active():
            cmd.append('--debug')
        
        try:
            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid
            )
            
            # Make stdout non-blocking
            fd = self.server_process.stdout.fileno()
            fl = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
            
            # Watch stdout for data
            self.io_watch_id = GLib.io_add_watch(
                self.server_process.stdout,
                GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR,
                self.on_server_output
            )
            
            self.status_label.set_markup("<span foreground='#2196F3' weight='bold'>Starting...</span>")
            self.tray_item_start.set_sensitive(False)
            self.tray_item_stop.set_sensitive(True)
            
        except Exception as e:
            self.log(f"Failed to start server process: {e}\n")
            self.server_stopped()

    def on_server_output(self, source, condition):
        # Alias for on_process_output for consistency with logic injection
        return self.on_process_output(source, condition)

    def on_process_output(self, source, condition):
        if condition & GLib.IO_IN:
            try:
                data = source.read()
                if data:
                    text = data.decode('utf-8', errors='replace')
                    self.process_output_text(text)
                    self.log(text)
            except IOError:
                pass
                
        if condition & GLib.IO_HUP:
            self.io_watch_id = None  # Source auto-removes on return False
            GLib.idle_add(self.server_stopped)
            return False  # Remove watch
            
        return True

    def process_output_text(self, text):
        for line in text.splitlines():
            if line.startswith("GUI_IP="):
                self.current_ip = line.split("=")[1].strip()
            elif line.startswith("GUI_PORT="):
                self.current_port = line.split("=")[1].strip()
            elif line.startswith("GUI_STATUS=starting"):
                self.generate_and_show_qr()

    def generate_and_show_qr(self):
        if not hasattr(self, 'current_ip') or not hasattr(self, 'current_port'):
            return
            
        url = f"https://{self.current_ip}:{self.current_port}"
        self.url_label.set_text(f"URL: {url}")
        
        if HAS_SEGNO:
            try:
                # Store QR code in the script directory to avoid /tmp permission conflicts
                SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
                tmp_qr_path = os.path.join(SCRIPT_DIR, ".vgp_qrcode_user.png")
                
                qr = segno.make(url)
                qr.save(tmp_qr_path, scale=6, border=2)
                
                pixbuf = GdkPixbuf.Pixbuf.new_from_file(tmp_qr_path)
                self.qr_image.set_from_pixbuf(pixbuf)
                self.qr_image.show()
            except Exception as e:
                self.log(f"Could not generate QR code: {e}\n")
        else:
            self.log("QR code library not available. Use the URL above to connect.\n")

    def on_stop_clicked(self, button):
        self.user_stopped = True
        self.stop_btn.set_sensitive(False)
        self.stop_server()

    def stop_server(self):
        if self.server_process:
            try:
                # Get the process group ID of the pkexec process
                pgid = os.getpgid(self.server_process.pid)
                # Use pkexec to kill the entire process group (run.sh, forever-monitor, node)
                subprocess.run(
                    ['pkexec', 'kill', '-TERM', '--', '-' + str(pgid)],
                    timeout=10
                )
            except subprocess.TimeoutExpired:
                self.log("Timeout waiting for server to stop.\n")
            except Exception as e:
                self.log(f"Error stopping server: {e}\n")

    def server_stopped(self):
        exit_code = None
        if self.server_process:
            exit_code = self.server_process.wait()
            self.server_process = None

        if self.io_watch_id:
            try:
                GLib.source_remove(self.io_watch_id)
            except Exception:
                pass
            self.io_watch_id = None

        # Clean stop by user
        if hasattr(self, 'user_stopped') and self.user_stopped:
            self.user_stopped = False
            self._reset_ui_to_stopped()
            self.log("\nServer stopped by user.\n")
            return

        # Crash recovery
        if exit_code is not None and exit_code != 0:
            import time
            now = time.time()
            if now - self.last_crash_time < 10:
                self.crash_count += 1
            else:
                self.crash_count = 1
            self.last_crash_time = now

            if self.crash_count <= self.max_crash_retries:
                self.log(f"\n⚠ Server crashed (exit code {exit_code}). "
                         f"Auto-restarting ({self.crash_count}/{self.max_crash_retries})...\n")
                self.auto_restart_timeout_id = GLib.timeout_add(2000, self._auto_restart)
                return
            else:
                self._reset_ui_to_stopped()
                self._show_crash_dialog(exit_code)
                return

        self._reset_ui_to_stopped()
        self.log("\nServer stopped.\n")

    def _reset_ui_to_stopped(self):
        self.start_btn.set_sensitive(True)
        self.stop_btn.set_sensitive(False)
        self.update_status_label(False)
        self.qr_image.hide()
        self.url_label.set_text("URL: Not running")

    def _auto_restart(self):
        self.auto_restart_timeout_id = None
        self.log("Attempting restart...\n")
        self.on_start_clicked(None)
        return False

    def _show_crash_dialog(self, exit_code):
        end_iter = self.log_buffer.get_end_iter()
        start_iter = self.log_buffer.get_iter_at_offset(max(0, end_iter.get_offset() - 3000))
        log_tail = self.log_buffer.get_text(start_iter, end_iter, True)

        error_text = (f"Server crashed {self.crash_count} times with exit code {exit_code}.\n"
                      f"Could not auto-recover.\n\n"
                      f"--- Last log output ---\n{log_tail}")

        dialog = Gtk.MessageDialog(
            transient_for=self,
            flags=Gtk.DialogFlags.MODAL,
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK,
            text="Internal Error — Server Crashed"
        )
        dialog.format_secondary_text("The server could not recover after multiple attempts. "
                                      "Copy the details below for debugging.")

        content_area = dialog.get_content_area()
        scroll = Gtk.ScrolledWindow()
        scroll.set_min_content_height(200)
        scroll.set_min_content_width(500)
        error_view = Gtk.TextView()
        error_view.set_editable(False)
        error_view.get_buffer().set_text(error_text)
        error_view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        scroll.add(error_view)
        content_area.pack_start(scroll, True, True, 10)
        scroll.show_all()

        dialog.run()
        dialog.destroy()
        self.crash_count = 0

    def setup_tray_icon(self):
        menu = Gtk.Menu()
        
        item_show = Gtk.MenuItem(label="Show Window")
        item_show.connect("activate", self.on_tray_show)
        menu.append(item_show)
        
        self.item_stop = Gtk.MenuItem(label="Stop Server")
        self.item_stop.connect("activate", self.on_tray_stop)
        self.item_stop.set_sensitive(False)
        menu.append(self.item_stop)
        
        item_quit = Gtk.MenuItem(label="Quit")
        item_quit.connect("activate", self.on_tray_quit)
        menu.append(item_quit)
        
        menu.show_all()

        png_path = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.png')
        ico_path = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.ico')
        icon_path = png_path if os.path.exists(png_path) else ico_path
        tray_icon_source = icon_path if os.path.exists(icon_path) else "virtual-gamepads-plus"
        
        if HAS_APPINDICATOR:
            self.indicator = AppIndicator.Indicator.new(
                "virtual-gamepads-plus",
                tray_icon_source,
                AppIndicator.IndicatorCategory.APPLICATION_STATUS
            )
            # Make the tray icon always visible (ACTIVE) if the Desktop Environment supports it
            self.indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
            self.indicator.set_menu(menu)
        elif hasattr(Gtk, 'StatusIcon'):
            if os.path.exists(icon_path):
                try:
                    pixbuf = GdkPixbuf.Pixbuf.new_from_file(icon_path)
                    self.status_icon = Gtk.StatusIcon.new_from_pixbuf(pixbuf)
                except Exception:
                    self.status_icon = Gtk.StatusIcon.new_from_icon_name("input-gamepad")
            else:
                self.status_icon = Gtk.StatusIcon.new_from_icon_name("input-gamepad")
            self.status_icon.connect("popup-menu", self.on_tray_popup, menu)
            self.status_icon.connect("activate", self.on_tray_show)
            self.status_icon.set_visible(True)

    def on_tray_popup(self, icon, button, time, menu):
        menu.popup(None, None, None, None, button, time)

    def on_tray_show(self, item=None):
        self.show_all()
        self.present()
        self.update_tray_visibility(False)

    def on_tray_stop(self, item=None):
        self.stop_server()

    def on_tray_quit(self, item=None):
        self.stop_server()
        Gtk.main_quit()

    def update_tray_visibility(self, visible):
        if self.indicator:
            if visible:
                self.indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
            else:
                self.indicator.set_status(AppIndicator.IndicatorStatus.PASSIVE)
        elif self.status_icon:
            self.status_icon.set_visible(visible)
            
        # Update stop menu item state
        self.item_stop.set_sensitive(self.server_process is not None)

    def on_delete_event(self, window, event):
        if self.tray_toggle.get_active() and (self.indicator or self.status_icon):
            self.hide()
            self.update_tray_visibility(True)
            return True # Prevents window destruction
        else:
            self.stop_server()
            Gtk.main_quit()
            return False

if __name__ == "__main__":
    app = VirtualGamepadsGUI()
    app.show_all()
    # Ensure QR image is hidden initially
    app.qr_image.hide()
    Gtk.main()
