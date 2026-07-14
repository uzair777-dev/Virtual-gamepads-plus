#!/usr/bin/env python3
import os
import sys
import subprocess
import signal
import json
import fcntl
import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib, GdkPixbuf, Pango

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

class VirtualGamepadsGUI(Gtk.Window):
    def __init__(self):
        super().__init__(title="Virtual Gamepads Plus")
        self.set_default_size(600, 500)
        self.set_border_width(10)
        self.server_process = None
        self.io_watch_id = None
        
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
        
        # Tray Toggle
        self.tray_toggle = Gtk.CheckButton(label="Minimise to tray on close")
        self.tray_toggle.set_active(self.config.get('minimise_to_tray', False))
        self.tray_toggle.connect("toggled", self.on_tray_toggled)
        if not HAS_APPINDICATOR and not hasattr(Gtk, 'StatusIcon'):
            self.tray_toggle.set_sensitive(False)
            self.tray_toggle.set_tooltip_text("System tray is not supported on this desktop environment.")
        vbox.pack_start(self.tray_toggle, False, False, 0)
        
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
        self.config = {'minimise_to_tray': False}
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
        self.log_buffer.set_text("")
        self.start_btn.set_sensitive(False)
        
        run_script = os.path.join(SCRIPT_DIR, 'run.sh')
        cmd = ['pkexec', 'bash', run_script, '--gui']
        
        try:
            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=SCRIPT_DIR,
                preexec_fn=os.setsid  # To kill process group later
            )
            
            # Make stdout non-blocking
            fd = self.server_process.stdout.fileno()
            fl = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
            
            self.io_watch_id = GLib.io_add_watch(self.server_process.stdout, GLib.IO_IN | GLib.IO_HUP, self.on_process_output)
            self.stop_btn.set_sensitive(True)
            self.update_status_label(True)
            
        except Exception as e:
            self.log(f"Failed to start server: {e}\n")
            self.start_btn.set_sensitive(True)

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
                tmp_qr_path = "/tmp/vgp_qrcode.png"
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
        self.stop_btn.set_sensitive(False)
        self.stop_server()

    def stop_server(self):
        if self.server_process:
            try:
                pgid = os.getpgid(self.server_process.pid)
                # Server runs as root (via pkexec), so we need pkexec to kill it
                subprocess.run(
                    ['pkexec', 'kill', '-TERM', '--', '-' + str(pgid)],
                    timeout=10
                )
            except subprocess.TimeoutExpired:
                self.log("Timeout waiting for server to stop.\n")
            except Exception as e:
                self.log(f"Error stopping server: {e}\n")

    def server_stopped(self):
        if self.server_process:
            self.server_process.wait()
            self.server_process = None
            
        if self.io_watch_id:
            try:
                GLib.source_remove(self.io_watch_id)
            except Exception:
                pass
            self.io_watch_id = None
            
        self.start_btn.set_sensitive(True)
        self.stop_btn.set_sensitive(False)
        self.update_status_label(False)
        self.qr_image.hide()
        self.url_label.set_text("URL: Not running")
        self.log("\nServer stopped.\n")

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

        icon_name = "input-gamepad"
        
        if HAS_APPINDICATOR:
            self.indicator = AppIndicator.Indicator.new(
                "virtual-gamepads",
                icon_name,
                AppIndicator.IndicatorCategory.APPLICATION_STATUS
            )
            self.indicator.set_status(AppIndicator.IndicatorStatus.PASSIVE)
            self.indicator.set_menu(menu)
        elif hasattr(Gtk, 'StatusIcon'):
            self.status_icon = Gtk.StatusIcon.new_from_icon_name(icon_name)
            self.status_icon.connect("popup-menu", self.on_tray_popup, menu)
            self.status_icon.connect("activate", self.on_tray_show)
            self.status_icon.set_visible(False)

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
