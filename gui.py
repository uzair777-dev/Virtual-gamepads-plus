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

import re

def is_dark_theme(widget=None):
    """Detect whether current GTK desktop theme is dark or light mode across GNOME, KDE, and XFCE."""
    try:
        from gi.repository import Gio
        gsettings = Gio.Settings.new("org.gnome.desktop.interface")
        if gsettings:
            scheme = gsettings.get_string("color-scheme")
            if "dark" in scheme.lower():
                return True
    except Exception:
        pass

    try:
        settings = Gtk.Settings.get_default()
        if settings:
            if settings.get_property("gtk-application-prefer-dark-theme"):
                return True
            theme_name = settings.get_property("gtk-theme-name") or ""
            if "dark" in theme_name.lower():
                return True
    except Exception:
        pass

    if widget:
        try:
            ctx = widget.get_style_context()
            fg = ctx.get_color(Gtk.StateFlags.NORMAL)
            # In GTK, fg is text color. White text (luminance > 0.5) indicates a dark theme
            luminance = 0.2126 * fg.red + 0.7152 * fg.green + 0.0722 * fg.blue
            if luminance > 0.5:
                return True
        except Exception:
            pass

    return False

def load_colored_svg_pixbuf(svg_path, width, height, is_dark=False):
    """Load SVG icon dynamically recolored black for light theme, white for dark theme."""
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
        target_color = "#FFFFFF" if is_dark else "#000000"
        content = re.sub(r'stroke=["\'](?:#000(?:000)?|black)["\']', f'stroke="{target_color}"', content, flags=re.IGNORECASE)
        content = re.sub(r'fill=["\'](?:#000(?:000)?|black)["\']', f'fill="{target_color}"', content, flags=re.IGNORECASE)

        loader = GdkPixbuf.PixbufLoader.new_with_type("svg")
        loader.set_size(width, height)
        loader.write(content.encode('utf-8'))
        loader.close()
        return loader.get_pixbuf()
    except Exception:
        return GdkPixbuf.Pixbuf.new_from_file_at_scale(svg_path, width, height, True)

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
    if os.path.exists(desktop_file):
        return

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
        self.set_default_size(600, 500)
        self.set_border_width(10)

        # Set Window Icon (theme-adaptive gear.svg icon)
        gear_icon_path = os.path.join(SCRIPT_DIR, 'public', 'images', 'icons', 'gear.svg')
        if os.path.exists(gear_icon_path):
            try:
                main_icon_pb = load_colored_svg_pixbuf(gear_icon_path, 64, 64, is_dark_theme(self))
                self.set_icon(main_icon_pb)
            except Exception:
                pass
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

        # Gear/Settings button with theme-adaptive gear.svg icon
        gear_icon_path = os.path.join(SCRIPT_DIR, 'public', 'images', 'icons', 'gear.svg')
        if os.path.exists(gear_icon_path):
            try:
                pixbuf = load_colored_svg_pixbuf(gear_icon_path, 18, 18, is_dark_theme(self))
                gear_img = Gtk.Image.new_from_pixbuf(pixbuf)
                self.settings_btn = Gtk.Button()
                self.settings_btn.set_image(gear_img)
                self.settings_btn.set_always_show_image(True)
            except Exception:
                self.settings_btn = Gtk.Button(label="⚙")
        else:
            self.settings_btn = Gtk.Button(label="⚙")

        self.settings_btn.set_tooltip_text("Settings")
        self.settings_btn.connect("clicked", self.on_settings_clicked)
        button_box.pack_start(self.settings_btn, False, False, 0)
        
        # Control settings references (initialized from config)
        self.tray_toggle = Gtk.CheckButton()
        self.tray_toggle.set_active(self.config.get('minimise_to_tray', False))
        
        self.hot_reload_toggle = Gtk.CheckButton()
        self.hot_reload_toggle.set_active(self.config.get('hot_reload', False))
        
        self.debug_toggle = Gtk.CheckButton()
        self.debug_toggle.set_active(self.config.get('debug', False))
        
        self.port_entry = Gtk.Entry()
        if self.config.get('custom_port'):
            self.port_entry.set_text(str(self.config['custom_port']))

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
        self.config = {'minimise_to_tray': False, 'dev_mode': False, 'hot_reload': False, 'debug': False, 'custom_port': ''}
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

    def on_dev_mode_toggled(self, button):
        active = button.get_active()
        self.config['dev_mode'] = active
        if hasattr(self, 'dev_box'):
            self.dev_box.set_sensitive(active)
        if not active:
            # When developmental options are turned off, reset all sub-settings to defaults (False)
            if hasattr(self, 'hot_reload_toggle'):
                self.hot_reload_toggle.set_active(False)
            if hasattr(self, 'debug_toggle'):
                self.debug_toggle.set_active(False)
            self.config['hot_reload'] = False
            self.config['debug'] = False
        self.save_config()

    def on_hot_reload_toggled(self, button):
        self.config['hot_reload'] = button.get_active()
        self.save_config()

    def on_debug_toggled(self, button):
        self.config['debug'] = button.get_active()
        self.save_config()

    def on_port_changed(self, entry):
        val = entry.get_text().strip()
        self.config['custom_port'] = val
        self.save_config()

    def prompt_server_restart_if_running(self):
        """If server process is currently running, prompt user to restart server to apply new settings."""
        if self.server_process is not None and self.server_process.poll() is None:
            dialog = Gtk.MessageDialog(
                transient_for=self,
                flags=0,
                message_type=Gtk.MessageType.QUESTION,
                buttons=Gtk.ButtonsType.YES_NO,
                text="Restart Server to Apply Settings?"
            )
            dialog.format_secondary_text(
                "You changed server configuration options while the server is running.\n\nWould you like to restart the server now to apply the new settings?"
            )
            res = dialog.run()
            dialog.destroy()
            if res == Gtk.ResponseType.YES:
                self.log("[GUI] Restarting server to apply updated settings...\n")
                self.on_stop_clicked(None)
                GLib.timeout_add(800, self._restart_server_callback)

    def _restart_server_callback(self):
        self.on_start_clicked(None)
        return False

    def on_settings_clicked(self, button):
        """Open persistent modal settings window blocking main window interaction until closed."""
        modal_win = Gtk.Window(title="Settings")
        modal_win.set_transient_for(self)
        modal_win.set_modal(True)
        modal_win.set_default_size(420, 340)
        modal_win.set_position(Gtk.WindowPosition.CENTER_ON_PARENT)

        # Snapshot initial server settings state when modal opens
        initial_server_settings = (
            str(self.config.get('custom_port', '')),
            bool(self.config.get('dev_mode', False)),
            bool(self.config.get('hot_reload', False)),
            bool(self.config.get('debug', False))
        )

        def on_modal_destroy(widget):
            current_server_settings = (
                str(self.config.get('custom_port', '')),
                bool(self.config.get('dev_mode', False)),
                bool(self.config.get('hot_reload', False)),
                bool(self.config.get('debug', False))
            )
            if current_server_settings != initial_server_settings:
                self.prompt_server_restart_if_running()

        modal_win.connect("destroy", on_modal_destroy)

        # Set Gear icon for Settings window
        gear_icon_path = os.path.join(SCRIPT_DIR, 'public', 'images', 'icons', 'gear.svg')
        is_dark = is_dark_theme(self)
        if os.path.exists(gear_icon_path):
            try:
                gear_pb = load_colored_svg_pixbuf(gear_icon_path, 32, 32, is_dark)
                modal_win.set_icon(gear_pb)
            except Exception:
                pass

        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        vbox.set_margin_top(15)
        vbox.set_margin_bottom(15)
        vbox.set_margin_start(15)
        vbox.set_margin_end(15)

        # ==========================================
        # SECTION 1: Application Settings
        # ==========================================
        app_header = Gtk.Label()
        app_header.set_markup("<b>Application Settings</b>")
        app_header.set_halign(Gtk.Align.START)
        vbox.pack_start(app_header, False, False, 0)

        # 1. Minimise to tray on close
        self.tray_toggle = Gtk.CheckButton(label="Minimise to tray on close")
        self.tray_toggle.set_active(self.config.get('minimise_to_tray', False))
        self.tray_toggle.connect("toggled", self.on_tray_toggled)
        if not HAS_APPINDICATOR and not hasattr(Gtk, 'StatusIcon'):
            self.tray_toggle.set_sensitive(False)
            self.tray_toggle.set_tooltip_text("System tray is not supported on this desktop environment.")
        vbox.pack_start(self.tray_toggle, False, False, 0)

        # 2. Custom Server Port Entry
        port_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        port_label = Gtk.Label(label="Server Port:")
        self.port_entry = Gtk.Entry()
        self.port_entry.set_placeholder_text("Default (8443)")
        if self.config.get('custom_port'):
            self.port_entry.set_text(str(self.config['custom_port']))
        self.port_entry.connect("changed", self.on_port_changed)
        port_box.pack_start(port_label, False, False, 0)
        port_box.pack_start(self.port_entry, True, True, 0)
        vbox.pack_start(port_box, False, False, 2)

        # Visual Separator
        sep = Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL)
        vbox.pack_start(sep, False, False, 4)

        # ==========================================
        # SECTION 2: Developmental Stuff
        # ==========================================
        dev_header = Gtk.Label()
        dev_header.set_markup("<b>Developmental Stuff</b>")
        dev_header.set_halign(Gtk.Align.START)
        vbox.pack_start(dev_header, False, False, 0)

        # Master Toggle for Developmental Stuff
        self.dev_mode_toggle = Gtk.CheckButton(label="Enable Developmental Options")
        self.dev_mode_toggle.set_active(self.config.get('dev_mode', False))
        self.dev_mode_toggle.connect("toggled", self.on_dev_mode_toggled)
        vbox.pack_start(self.dev_mode_toggle, False, False, 0)

        # Indented Sub-Box for Developmental Stuff options
        self.dev_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        self.dev_box.set_margin_start(20)

        # Hot Reload Toggle
        self.hot_reload_toggle = Gtk.CheckButton(label="Hot Reload (watch for file changes)")
        self.hot_reload_toggle.set_active(self.config.get('hot_reload', False))
        self.hot_reload_toggle.connect("toggled", self.on_hot_reload_toggled)
        self.dev_box.pack_start(self.hot_reload_toggle, False, False, 0)

        # Debug Logging Toggle
        self.debug_toggle = Gtk.CheckButton(label="Debug Logging")
        self.debug_toggle.set_active(self.config.get('debug', False))
        self.debug_toggle.connect("toggled", self.on_debug_toggled)
        self.dev_box.pack_start(self.debug_toggle, False, False, 0)

        # Enable/Disable dev_box based on master toggle state
        self.dev_box.set_sensitive(self.dev_mode_toggle.get_active())
        vbox.pack_start(self.dev_box, False, False, 0)

        # Close button at bottom
        btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        close_btn = Gtk.Button(label="Close")
        close_btn.connect("clicked", lambda b: modal_win.destroy())
        btn_box.pack_end(close_btn, False, False, 0)
        vbox.pack_end(btn_box, False, False, 0)

        modal_win.add(vbox)
        modal_win.show_all()

    def update_status_label(self, state):
        if state is True or state == "online":
            self.status_label.set_markup("<span foreground='green' weight='bold'>Status: ● Online</span>")
        elif state == "starting":
            self.status_label.set_markup("<span foreground='#2196F3' weight='bold'>Status: ● Starting...</span>")
        else:
            self.status_label.set_markup("<span foreground='red' weight='bold'>Status: ● Offline</span>")

    def log(self, text):
        end_iter = self.log_buffer.get_end_iter()
        self.log_buffer.insert(end_iter, text)
        # Auto-scroll to bottom
        mark = self.log_buffer.create_mark(None, self.log_buffer.get_end_iter(), False)
        GLib.idle_add(self.log_view.scroll_to_mark, mark, 0.0, False, 0.0, 0.0)

    def check_and_prompt_occupied_ports(self):
        """Checking if target server ports are bound by external processes and prompt user to kill them with sudo/pkexec."""
        target_ports = [8443, 8080, 8000, 3000, 8081]
        custom_val = self.port_entry.get_text().strip() if hasattr(self, 'port_entry') else ''
        if custom_val.isdigit():
            c_port = int(custom_val)
            if c_port not in target_ports:
                target_ports.insert(0, c_port)
        occupied = []

        for p in target_ports:
            try:
                res = subprocess.run(['ss', '-tulpn', f'sport = :{p}'], capture_output=True, text=True)
                if f':{p}' in res.stdout:
                    info = f"Port {p}"
                    lines = res.stdout.strip().split('\n')
                    for line in lines[1:]:
                        if 'users:' in line:
                            info += f" ({line.split('users:')[1].strip()})"
                    occupied.append((p, info))
            except Exception:
                pass

        if occupied:
            ports_str = ", ".join([str(p[0]) for p in occupied])
            details_str = "\n".join([p[1] for p in occupied])
            
            dialog = Gtk.MessageDialog(
                transient_for=self,
                flags=0,
                message_type=Gtk.MessageType.QUESTION,
                buttons=Gtk.ButtonsType.YES_NO,
                text=f"Network Port(s) {ports_str} in Use"
            )
            dialog.format_secondary_text(
                f"The following network port(s) are currently occupied by background processes:\n\n"
                f"{details_str}\n\n"
                "Would you like to terminate these stuck processes using elevated privileges (sudo/pkexec) to free up ports for Virtual Gamepads Plus?"
            )
            response = dialog.run()
            dialog.destroy()

            if response == Gtk.ResponseType.YES:
                self.log(f"[AUTO-HEAL] User approved elevated cleanup for port(s) {ports_str}...\n")
                try:
                    for p_item in occupied:
                        port_num = p_item[0]
                        res = subprocess.run(['fuser', '-k', '-9', f'{port_num}/tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        if res.returncode != 0:
                            subprocess.run(['pkexec', 'fuser', '-k', '-9', f'{port_num}/tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    self.log(f"[AUTO-HEAL] Successfully released network port(s) {ports_str}.\n")
                    import time
                    time.sleep(0.4) # Allow kernel TIME_WAIT sockets to clear
                except Exception as e:
                    self.log(f"[AUTO-HEAL] Notice during port cleanup: {e}\n")

    def on_start_clicked(self, button):
        if button is not None:
            self.log_buffer.set_text("")
            self.user_stopped = False

        # Prompt user to clean occupied ports if necessary
        self.check_and_prompt_occupied_ports()

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

        is_dev_enabled = self.dev_mode_toggle.get_active() if hasattr(self, 'dev_mode_toggle') else self.config.get('dev_mode', False)
        if is_dev_enabled:
            if self.hot_reload_toggle.get_active() if hasattr(self, 'hot_reload_toggle') else self.config.get('hot_reload', False):
                cmd.append('--hot-reload')
            if self.debug_toggle.get_active() if hasattr(self, 'debug_toggle') else self.config.get('debug', False):
                cmd.append('--debug')
        
        custom_port_val = self.port_entry.get_text().strip() if hasattr(self, 'port_entry') else ''
        if custom_port_val:
            cmd.append(f'--port={custom_port_val}')
        
        self.last_cmd = cmd

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
            
            self.update_status_label("starting")
            self.stop_btn.set_sensitive(True)
            if hasattr(self, 'item_stop') and self.item_stop:
                self.item_stop.set_sensitive(True)
            
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
            elif line.startswith("GUI_STATUS=starting") or line.startswith("GUI_STATUS=running") or "HTTPS Server running" in line or "Server listening" in line:
                self.generate_and_show_qr()
                self.update_status_label("online")

    def generate_and_show_qr(self):
        if not hasattr(self, 'current_ip') or not hasattr(self, 'current_port'):
            return
            
        url = f"https://{self.current_ip}:{self.current_port}"
        self.url_label.set_text(f"URL: {url}")
        self.update_status_label("online")
        
        if HAS_SEGNO:
            try:
                # Store QR code in the script directory to avoid /tmp permission conflicts
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

    def stop_server(self, callback=None):
        self.user_stopped = True
        if hasattr(self, 'auto_restart_timeout_id') and self.auto_restart_timeout_id:
            try:
                GLib.source_remove(self.auto_restart_timeout_id)
            except Exception:
                pass
            self.auto_restart_timeout_id = None

        if not self.server_process:
            self.server_stopped()
            if callback: callback()
            return

        proc = self.server_process
        self.server_process = None

        try:
            pgid = os.getpgid(proc.pid)
            if getattr(self, 'is_elevated', False):
                subprocess.Popen(
                    ['pkexec', 'kill', '-INT', '--', '-' + str(pgid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            else:
                os.killpg(pgid, signal.SIGINT)
        except Exception as e:
            self.log(f"Notice during server stop: {e}\n")

        def force_kill_if_alive():
            try:
                if proc.poll() is None:
                    pgid = os.getpgid(proc.pid)
                    if getattr(self, 'is_elevated', False):
                        subprocess.Popen(
                            ['pkexec', 'kill', '-KILL', '--', '-' + str(pgid)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
                    else:
                        os.killpg(pgid, signal.SIGKILL)
            except Exception:
                pass

            self.server_stopped()
            if callback: callback()

        GLib.timeout_add(600, force_kill_if_alive)

    def server_stopped(self):
        exit_code = None
        if self.server_process:
            exit_code = self.server_process.poll()
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

        gamepad_svg_path = os.path.join(SCRIPT_DIR, 'public', 'images', 'icons', 'gamepad-icon.svg')
        is_dark = is_dark_theme(self)
        
        # Load theme-adaptive gamepad SVG icon
        tray_pixbuf = None
        if os.path.exists(gamepad_svg_path):
            try:
                tray_pixbuf = load_colored_svg_pixbuf(gamepad_svg_path, 24, 24, is_dark)
            except Exception:
                pass

        # Prepare image file path for AppIndicator
        tray_icon_path = ""
        if tray_pixbuf:
            try:
                cache_dir = os.path.expanduser('~/.cache')
                os.makedirs(cache_dir, exist_ok=True)
                tray_icon_path = os.path.join(cache_dir, 'virtual-gamepads-tray.png')
                tray_pixbuf.savev(tray_icon_path, 'png', [], [])
            except Exception:
                tray_icon_path = ""

        if not tray_icon_path:
            png_path = os.path.join(SCRIPT_DIR, 'public', 'branding', 'wheel_logo.png')
            tray_icon_path = png_path if os.path.exists(png_path) else "virtual-gamepads-plus"
        
        if HAS_APPINDICATOR:
            self.indicator = AppIndicator.Indicator.new(
                "virtual-gamepads-plus",
                tray_icon_path,
                AppIndicator.IndicatorCategory.APPLICATION_STATUS
            )
            self.indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
            self.indicator.set_menu(menu)
        elif hasattr(Gtk, 'StatusIcon'):
            if tray_pixbuf:
                self.status_icon = Gtk.StatusIcon.new_from_pixbuf(tray_pixbuf)
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
        self.cleanup_and_quit()

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

    def cleanup_and_quit(self):
        self.stop_server(callback=Gtk.main_quit)

    def on_delete_event(self, window, event):
        if self.tray_toggle.get_active() and (self.indicator or self.status_icon):
            self.hide()
            self.update_tray_visibility(True)
            return True # Prevents window destruction
        else:
            self.cleanup_and_quit()
            return False

if __name__ == "__main__":
    app = VirtualGamepadsGUI()
    app.show_all()
    # Ensure QR image is hidden initially
    app.qr_image.hide()
    # Check if target server ports are bound on startup
    GLib.idle_add(app.check_and_prompt_occupied_ports)

    def handle_sigint(sig, frame):
        GLib.idle_add(app.cleanup_and_quit)

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    Gtk.main()
