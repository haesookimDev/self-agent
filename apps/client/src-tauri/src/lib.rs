use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Default)]
struct ExecutorState {
    roots: Mutex<HashMap<String, PathBuf>>,
    allowed_apps: Mutex<HashMap<String, PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntry {
    name: String,
    relative_path: String,
    is_directory: bool,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityManifest {
    tools: Vec<&'static str>,
    screen_capture: bool,
    interactive_control: bool,
    file_sync: bool,
}

fn validate_relative(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate.as_os_str().is_empty() {
        return Ok(PathBuf::from("."));
    }
    for component in candidate.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err("Path must be relative and cannot contain parent traversal".into()),
        }
    }
    Ok(candidate.to_path_buf())
}

fn root_for(state: &ExecutorState, root_id: &str) -> Result<PathBuf, String> {
    state
        .roots
        .lock()
        .map_err(|_| "Root lock is poisoned".to_string())?
        .get(root_id)
        .cloned()
        .ok_or_else(|| "This root is not approved on the device".to_string())
}

fn resolve_existing(state: &ExecutorState, root_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = root_for(state, root_id)?;
    let relative = validate_relative(relative_path)?;
    let resolved = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Cannot resolve path: {error}"))?;
    if !resolved.starts_with(&root) {
        return Err("Resolved path escaped the approved root".into());
    }
    Ok(resolved)
}

fn resolve_for_write(state: &ExecutorState, root_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = root_for(state, root_id)?;
    let relative = validate_relative(relative_path)?;
    let target = root.join(relative);
    let parent = target
        .parent()
        .ok_or_else(|| "Target must have a parent folder".to_string())?
        .canonicalize()
        .map_err(|error| format!("Cannot resolve parent folder: {error}"))?;
    if !parent.starts_with(&root) {
        return Err("Target escaped the approved root".into());
    }
    if target.exists() {
        let canonical_target = target
            .canonicalize()
            .map_err(|error| format!("Cannot resolve target: {error}"))?;
        if !canonical_target.starts_with(&root) {
            return Err("Target symlink escaped the approved root".into());
        }
    }
    Ok(target)
}

#[tauri::command]
fn capability_manifest() -> CapabilityManifest {
    #[allow(unused_mut)]
    let mut tools = vec!["file.list", "file.read", "file.write", "file.trash"];
    #[cfg(feature = "native-capture")]
    tools.push("screen.snapshot");
    CapabilityManifest {
        tools,
        screen_capture: cfg!(feature = "native-capture"),
        interactive_control: false,
        file_sync: true,
    }
}

#[tauri::command]
fn store_device_credential(device_id: String, credential: String) -> Result<(), String> {
    if credential.len() < 32 {
        return Err("Device credential is unexpectedly short".into());
    }
    keyring::Entry::new("app.continuum.agent", &device_id)
        .map_err(|error| format!("Cannot open OS credential store: {error}"))?
        .set_password(&credential)
        .map_err(|error| format!("Cannot save device credential: {error}"))
}

#[tauri::command]
fn load_device_credential(device_id: String) -> Result<String, String> {
    keyring::Entry::new("app.continuum.agent", &device_id)
        .map_err(|error| format!("Cannot open OS credential store: {error}"))?
        .get_password()
        .map_err(|error| format!("Cannot load device credential: {error}"))
}

/// This command must only be called from a local folder-picker flow. Remote messages never invoke it.
#[tauri::command]
fn approve_local_root(state: tauri::State<'_, ExecutorState>, root_id: String, path: String) -> Result<(), String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Cannot approve root: {error}"))?;
    if !canonical.is_dir() {
        return Err("Approved root must be a directory".into());
    }
    state
        .roots
        .lock()
        .map_err(|_| "Root lock is poisoned".to_string())?
        .insert(root_id, canonical);
    Ok(())
}

#[tauri::command]
fn list_directory(
    state: tauri::State<'_, ExecutorState>,
    root_id: String,
    relative_path: String,
) -> Result<Vec<DirectoryEntry>, String> {
    let root = root_for(&state, &root_id)?;
    let directory = resolve_existing(&state, &root_id, &relative_path)?;
    let mut entries = Vec::new();
    for result in fs::read_dir(directory).map_err(|error| format!("Cannot list directory: {error}"))? {
        let entry = result.map_err(|error| format!("Cannot read directory entry: {error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Cannot read metadata: {error}"))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| "Entry escaped the approved root".to_string())?;
        entries.push(DirectoryEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            relative_path: relative.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
fn read_text_file(
    state: tauri::State<'_, ExecutorState>,
    root_id: String,
    relative_path: String,
) -> Result<String, String> {
    let path = resolve_existing(&state, &root_id, &relative_path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("Cannot read metadata: {error}"))?;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err("Text file exceeds the 2 MiB executor limit".into());
    }
    fs::read_to_string(path).map_err(|error| format!("Cannot read UTF-8 text file: {error}"))
}

#[tauri::command]
fn write_text_file(
    state: tauri::State<'_, ExecutorState>,
    root_id: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("Text file exceeds the 2 MiB executor limit".into());
    }
    let target = resolve_for_write(&state, &root_id, &relative_path)?;
    let parent = target.parent().ok_or_else(|| "Target has no parent".to_string())?;
    let temporary = parent.join(format!(".continuum-{}.tmp", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Cannot create temporary file: {error}"))?;
    if let Err(error) = file.write_all(content.as_bytes()).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Cannot write temporary file: {error}"));
    }
    if let Err(error) = fs::rename(&temporary, &target) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Cannot atomically replace target: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn trash_path(
    state: tauri::State<'_, ExecutorState>,
    root_id: String,
    relative_path: String,
) -> Result<(), String> {
    let path = resolve_existing(&state, &root_id, &relative_path)?;
    trash::delete(path).map_err(|error| format!("Cannot move item to trash: {error}"))
}

#[tauri::command]
fn launch_allowed_app(state: tauri::State<'_, ExecutorState>, app_id: String) -> Result<(), String> {
    let executable = state
        .allowed_apps
        .lock()
        .map_err(|_| "App allowlist lock is poisoned".to_string())?
        .get(&app_id)
        .cloned()
        .ok_or_else(|| "Application is not in the local allowlist".to_string())?;
    std::process::Command::new(executable)
        .spawn()
        .map_err(|error| format!("Cannot launch application: {error}"))?;
    Ok(())
}

#[cfg(feature = "native-capture")]
#[tauri::command]
fn capture_primary_screen() -> Result<String, String> {
    use base64::Engine;
    use std::io::Cursor;
    let screen = screenshots::Screen::all()
        .map_err(|error| format!("Cannot enumerate screens: {error}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "No screen is available".to_string())?;
    let image = screen
        .capture()
        .map_err(|error| format!("Cannot capture screen: {error}"))?;
    let mut png = Cursor::new(Vec::new());
    screenshots::image::DynamicImage::ImageRgba8(image)
        .write_to(&mut png, screenshots::image::ImageOutputFormat::Png)
        .map_err(|error| format!("Cannot encode screenshot: {error}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png.into_inner()))
}

#[cfg(not(feature = "native-capture"))]
#[tauri::command]
fn capture_primary_screen() -> Result<String, String> {
    Err("Screen capture is disabled in this build; rebuild with native-capture after granting OS permission".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExecutorState::default())
        .invoke_handler(tauri::generate_handler![
            capability_manifest,
            store_device_credential,
            load_device_credential,
            approve_local_root,
            list_directory,
            read_text_file,
            write_text_file,
            trash_path,
            launch_allowed_app,
            capture_primary_screen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Continuum");
}

#[cfg(test)]
mod tests {
    use super::validate_relative;

    #[test]
    fn rejects_parent_traversal() {
        assert!(validate_relative("../secrets.txt").is_err());
        assert!(validate_relative("workspace/../../secrets.txt").is_err());
    }

    #[test]
    fn accepts_nested_relative_paths() {
        assert!(validate_relative("projects/continuum/README.md").is_ok());
    }
}
