use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, RunEvent};

/// Files Finder asked Spot to open before the page was ready to receive them.
struct PendingFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending(state: tauri::State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![take_pending])
        .menu(|app| {
            let item = |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);
            let app_menu = Submenu::with_items(
                app,
                "Spot",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Spot"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &item("settings", "Your Details…", Some("CmdOrCtrl+,"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            let file = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &item("new", "New Project", Some("CmdOrCtrl+N"))?,
                    &item("open", "Open…", Some("CmdOrCtrl+O"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &item("save", "Save", Some("CmdOrCtrl+S"))?,
                    &item("saveas", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
                    &item("reveal", "Show in Finder", Some("CmdOrCtrl+Shift+R"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &item("import", "Import Notes…", Some("CmdOrCtrl+I"))?,
                    &item("export_pdf", "Export Recap PDF…", Some("CmdOrCtrl+E"))?,
                    &item("backup", "Back Up All Projects…", None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let edit = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let view = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &item("mode_auto", "Match System Appearance", None)?,
                    &item("mode_light", "Light", None)?,
                    &item("mode_dark", "Dark", None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?;
            let window = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                ],
            )?;
            Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().as_ref().to_string());
        })
        .build(tauri::generate_context!())
        .expect("error while building Spot");

    app.run(|_app, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let RunEvent::Opened { urls } = &_event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !paths.is_empty() {
                _app.state::<PendingFiles>().0.lock().unwrap().extend(paths.clone());
                let _ = _app.emit("open-files", paths);
            }
        }
    });
}
