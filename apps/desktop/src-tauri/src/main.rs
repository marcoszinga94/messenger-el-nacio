#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// En Linux, WebKitGTK aborta si GStreamer no encuentra autoaudiosink
/// (plugin gst-plugins-good). Comprobamos antes de reproducir sonidos.
#[tauri::command]
fn audio_available() -> bool {
    if !cfg!(target_os = "linux") {
        return true;
    }
    std::process::Command::new("gst-inspect-1.0")
        .arg("autoaudiosink")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![audio_available])
        .run(tauri::generate_context!())
        .expect("error al iniciar Messenger El Nacio");
}
