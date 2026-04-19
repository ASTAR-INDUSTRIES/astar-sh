mod commands;

use tauri::{Emitter, Manager, PhysicalPosition, RunEvent, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

fn position_bottom_center(w: &WebviewWindow) {
    // Find the monitor containing the mouse cursor; fall back to primary.
    let cursor = w.cursor_position().ok();
    let monitors = w.available_monitors().unwrap_or_default();
    let active = cursor.and_then(|p| {
        monitors.iter().find(|m| {
            let mp = m.position();
            let ms = m.size();
            p.x >= mp.x as f64
                && p.x < (mp.x + ms.width as i32) as f64
                && p.y >= mp.y as f64
                && p.y < (mp.y + ms.height as i32) as f64
        })
    });
    let mon = active
        .or_else(|| monitors.first())
        .or_else(|| w.primary_monitor().ok().flatten().as_ref().map(|_| monitors.first()).flatten());
    let mon = match mon {
        Some(m) => m,
        None => return,
    };
    let ms = mon.size();
    let mp = mon.position();
    let scale = mon.scale_factor();
    let ws = match w.outer_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let margin_bottom_px = (120.0 * scale) as i32;
    let x = mp.x + (ms.width as i32 - ws.width as i32) / 2;
    let y = mp.y + ms.height as i32 - ws.height as i32 - margin_bottom_px;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_background_color(None);
                    let _ = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::FullScreenUI,
                        Some(NSVisualEffectState::Active),
                        None,
                    );
                }
                if let Some(window) = app.get_webview_window("quick") {
                    // Explicit fully-transparent clear so the corners outside the
                    // rounded pill don't pick up any default webview tint.
                    let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)));
                }
            }

            // Register global shortcut: Ctrl+Option+Space shows the quick-capture overlay.
            let shortcut = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT),
                Code::Space,
            );
            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _sc, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(w) = handle.get_webview_window("quick") {
                        if w.is_visible().unwrap_or(false) {
                            let _ = w.hide();
                        } else {
                            position_bottom_center(&w);
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = handle.emit_to("quick", "quick:focus", ());
                        }
                    }
                }
            })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) && window.label() == "quick" {
                // Hide instead of closing so the shortcut can re-show it
                if let Some(w) = window.app_handle().get_webview_window("quick") {
                    let _ = w.hide();
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_auth,
            commands::save_auth,
            commands::open_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::Reopen { .. } = event {
                // macOS dock click — no-op for now
            }
        });
}
