#!/usr/bin/env python3
import json
import os
import sys
from urllib.parse import urlparse

import gi

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('WebKit', '6.0')

from gi.repository import Adw, Gio, GLib, Gtk, WebKit  # noqa: E402

APP_ID = 'app.linear.linux'
HOME_URL = 'https://linear.app/login'
AUTH_PATTERNS = ('/oauth', '/auth', '/login', '/signin', '/sso', '/saml', '/callback')
ALLOWED_LINEAR_PERMISSIONS = (
    WebKit.NotificationPermissionRequest,
    WebKit.ClipboardPermissionRequest,
    WebKit.UserMediaPermissionRequest,
)
STATE_PATH = os.path.join(GLib.get_user_state_dir(), 'linear-linux', 'window-state.json')


def is_linear_host(hostname):
    return hostname == 'linear.app' or (hostname or '').endswith('.linear.app')


def is_linear_url(url):
    try:
        return is_linear_host(urlparse(url).hostname)
    except ValueError:
        return False


# Only for third-party SSO/SAML redirects (linear.app URLs are handled separately via
# is_linear_url). Those providers can live at arbitrary customer-controlled hostnames,
# so this can only check the path, not the host.
def is_auth_url(url):
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != 'https':
        return False
    return any(pattern in parsed.path for pattern in AUTH_PATTERNS)


def open_externally(uri):
    try:
        Gio.AppInfo.launch_default_for_uri(uri, None)
    except GLib.Error as err:
        print(f'Failed to open external URL: {err}', file=sys.stderr)


def load_window_state():
    try:
        with open(STATE_PATH, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        width, height = data.get('width'), data.get('height')
        if isinstance(width, int) and isinstance(height, int):
            return width, height
    except (OSError, ValueError):
        pass
    return 1000, 700


def save_window_state(width, height):
    try:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        with open(STATE_PATH, 'w', encoding='utf-8') as fh:
            json.dump({'width': width, 'height': height}, fh)
    except OSError:
        pass


class LinearWindow(Adw.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title='Linear')

        width, height = load_window_state()
        self.set_default_size(width, height)

        self.tab_view = Adw.TabView()
        self.tab_view.connect('close-page', self.on_close_page)

        tab_bar = Adw.TabBar(view=self.tab_view, autohide=False)

        new_tab_button = Gtk.Button(icon_name='tab-new-symbolic', tooltip_text='New Tab')
        new_tab_button.connect('clicked', lambda *_: self.new_tab())

        header = Adw.HeaderBar()
        header.set_title_widget(tab_bar)
        header.pack_start(new_tab_button)

        toolbar_view = Adw.ToolbarView()
        toolbar_view.add_top_bar(header)
        toolbar_view.set_content(self.tab_view)
        self.set_content(toolbar_view)

        self.connect('close-request', self.on_close_request)

        shortcuts = Gtk.ShortcutController()
        shortcuts.add_shortcut(Gtk.Shortcut.new(
            Gtk.ShortcutTrigger.parse_string('<Control>t'),
            Gtk.CallbackAction.new(self._shortcut_new_tab),
        ))
        shortcuts.add_shortcut(Gtk.Shortcut.new(
            Gtk.ShortcutTrigger.parse_string('<Control>w'),
            Gtk.CallbackAction.new(self._shortcut_close_tab),
        ))
        self.add_controller(shortcuts)

        self.new_tab(HOME_URL)

    def _shortcut_new_tab(self, *_args):
        self.new_tab()
        return True

    def _shortcut_close_tab(self, *_args):
        page = self.tab_view.get_selected_page()
        if page:
            self.tab_view.close_page(page)
        return True

    def setup_webview(self, webview):
        webview.connect('decide-policy', self.on_decide_policy)
        webview.connect('create', self.on_create)
        webview.connect('context-menu', self.on_context_menu)
        webview.connect('permission-request', self.on_permission_request)
        webview.connect('notify::title', self.on_title_changed)
        webview.connect('enter-fullscreen', lambda *_: (self.fullscreen(), False)[1])
        webview.connect('leave-fullscreen', lambda *_: (self.unfullscreen(), False)[1])

    def new_tab(self, url=HOME_URL):
        webview = WebKit.WebView()
        self.setup_webview(webview)
        webview.load_uri(url)
        page = self.tab_view.append(webview)
        page.set_title('Linear')
        self.tab_view.set_selected_page(page)
        return page

    # For opens we trigger ourselves (context menu, middle-click) rather than WebKit
    # already navigating somewhere for us — so, unlike on_create()'s tab-creation
    # branch, this must explicitly load_uri() into whatever it creates.
    def open_tab_for(self, uri, related_view):
        new_view = WebKit.WebView(related_view=related_view)
        self.setup_webview(new_view)
        new_view.load_uri(uri)
        page = self.tab_view.append(new_view)
        page.set_title('Linear')
        self.tab_view.set_selected_page(page)
        return new_view

    def open_link(self, uri, related_view):
        if is_linear_url(uri):
            self.open_tab_for(uri, related_view)
        elif is_auth_url(uri):
            self._create_popup(related_view).load_uri(uri)
        else:
            open_externally(uri)

    def on_context_menu(self, webview, context_menu, hit_test_result):
        if not hit_test_result.context_is_link():
            return False
        link_uri = hit_test_result.get_link_uri()

        for item in context_menu.get_items():
            if item.get_stock_action() == WebKit.ContextMenuAction.OPEN_LINK_IN_NEW_WINDOW:
                context_menu.remove(item)
                break

        action = Gio.SimpleAction.new('open-link-new-tab', None)
        action.connect('activate', lambda *_a: self.open_link(link_uri, webview))
        context_menu.prepend(WebKit.ContextMenuItem.new_from_gaction(action, 'Open Link in New Tab', None))
        return False

    def on_close_page(self, tab_view, page):
        tab_view.close_page_finish(page, True)
        if tab_view.get_n_pages() == 0:
            self.close()
        return True

    def on_title_changed(self, webview, _pspec):
        page = self.tab_view.get_page(webview)
        if page:
            page.set_title(webview.get_title() or 'Linear')

    def on_decide_policy(self, _webview, decision, decision_type):
        if decision_type != WebKit.PolicyDecisionType.NAVIGATION_ACTION:
            return False
        uri = decision.get_navigation_action().get_request().get_uri()
        if is_linear_url(uri) or is_auth_url(uri):
            return False
        decision.ignore()
        open_externally(uri)
        return True

    def on_create(self, webview, navigation_action):
        request = navigation_action.get_request()
        uri = request.get_uri() if request else None

        # linear.app must be checked before is_auth_url: linear.app/login's own path
        # contains "/login", one of the auth patterns, so checking auth first would
        # wrongly send Linear's own pages to the popup path instead of a new tab.
        if uri and is_linear_url(uri):
            new_view = WebKit.WebView(related_view=webview)
            self.setup_webview(new_view)
            page = self.tab_view.append(new_view)
            page.set_title('Linear')
            self.tab_view.set_selected_page(page)
            return new_view
        if uri and is_auth_url(uri):
            return self._create_popup(webview)

        # Unknown/external destination (or a window.open() whose URL isn't set yet) —
        # don't create an in-app view; if we already know the URL, hand it to the
        # system browser instead.
        if uri:
            open_externally(uri)
        return None

    def _create_popup(self, opener_webview):
        popup = Gtk.Window(transient_for=self, modal=True)
        popup.set_default_size(500, 650)
        view = WebKit.WebView(related_view=opener_webview)
        self.setup_webview(view)
        popup.set_child(view)
        view.connect('ready-to-show', lambda *_: popup.present())
        view.connect('close', lambda *_: popup.close())
        return view

    def on_permission_request(self, webview, request):
        uri = webview.get_uri() or ''
        hostname = urlparse(uri).hostname
        if is_linear_host(hostname) and isinstance(request, ALLOWED_LINEAR_PERMISSIONS):
            request.allow()
        else:
            request.deny()
        return True

    def on_close_request(self, *_args):
        save_window_state(self.get_width(), self.get_height())
        return False


class LinearApplication(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.window = None

    def do_activate(self):
        if not self.window:
            self.window = LinearWindow(self)
        self.window.present()


def main():
    return LinearApplication().run(sys.argv)


if __name__ == '__main__':
    sys.exit(main())
