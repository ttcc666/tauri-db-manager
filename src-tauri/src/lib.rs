use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

struct AppState {
    db_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DatabaseFile {
    databases: Vec<DatabaseEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseEntry {
    name: String,
    connection_string: String,
    db_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_default: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    optimization_settings: Option<OptimizationSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OptimizationSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    auto_to_lower: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_i_like: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    identity_strategy: Option<String>,
}

impl DatabaseEntry {
    fn normalized(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.connection_string = self.connection_string.trim().to_string();
        self.db_type = self.db_type.trim().to_string();
        self.description = self.description.map(|d| d.trim().to_string());

        if let Some(mut opt) = self.optimization_settings.clone() {
            opt.auto_to_lower = opt.auto_to_lower.map(normalize_bool_string);
            opt.enable_i_like = opt.enable_i_like.map(normalize_bool_string);
            opt.identity_strategy = opt
                .identity_strategy
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            self.optimization_settings = Some(opt);
        }

        self
    }
}

fn normalize_bool_string(value: String) -> String {
    if value.eq_ignore_ascii_case("true") {
        "true".to_string()
    } else if value.eq_ignore_ascii_case("false") {
        "false".to_string()
    } else {
        value.trim().to_string()
    }
}

fn current_path(state: &tauri::State<AppState>) -> Result<PathBuf, String> {
    state
        .db_path
        .lock()
        .map_err(|_| "路径状态不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先设置配置文件路径".to_string())
}

fn read_database_file(path: &Path) -> Result<DatabaseFile, String> {
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("读取配置文件失败: {} ({})", path.display(), err))?;
    serde_json::from_str::<DatabaseFile>(&raw)
        .map_err(|err| format!("解析配置文件失败: {} ({})", path.display(), err))
}

fn write_database_file(path: &Path, payload: &DatabaseFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建配置目录失败: {} ({})", path.display(), err))?;
    }
    let content =
        serde_json::to_string_pretty(payload).map_err(|err| format!("序列化失败: {err}"))?;
    fs::write(path, content)
        .map_err(|err| format!("写入配置文件失败: {} ({})", path.display(), err))
}

#[tauri::command]
fn get_database_path(state: tauri::State<AppState>) -> Result<String, String> {
    let guard = state.db_path.lock().map_err(|_| "路径状态不可用")?;
    Ok(guard
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "".to_string()))
}

#[tauri::command]
fn set_database_path(path: String, state: tauri::State<AppState>) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".into());
    }

    let mut buf = PathBuf::from(trimmed);
    if !buf.is_absolute() {
        buf = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(buf);
    }

    {
        let mut guard = state.db_path.lock().map_err(|_| "路径状态不可用")?;
        *guard = Some(buf.clone());
    }

    Ok(buf.to_string_lossy().to_string())
}

#[tauri::command]
fn load_database_config(state: tauri::State<AppState>) -> Result<DatabaseFile, String> {
    let path = current_path(&state)?;
    read_database_file(&path)
}

#[tauri::command]
fn upsert_database_entry(
    entry: DatabaseEntry,
    state: tauri::State<AppState>,
) -> Result<DatabaseFile, String> {
    if entry.name.trim().is_empty() {
        return Err("数据库名称不能为空".into());
    }
    if entry.connection_string.trim().is_empty() {
        return Err("连接字符串不能为空".into());
    }
    if entry.db_type.trim().is_empty() {
        return Err("数据库类型不能为空".into());
    }

    let path = current_path(&state)?;
    let mut file = read_database_file(&path).unwrap_or(DatabaseFile { databases: vec![] });
    let normalized = entry.normalized();

    if let Some(position) = file.databases.iter().position(|item| item.name == normalized.name) {
        file.databases[position] = normalized;
    } else {
        file.databases.push(normalized);
    }

    write_database_file(&path, &file)?;
    Ok(file)
}

#[tauri::command]
fn delete_database_entry(name: String, state: tauri::State<AppState>) -> Result<DatabaseFile, String> {
    if name.trim().is_empty() {
        return Err("要删除的名称不能为空".into());
    }

    let path = current_path(&state)?;
    let mut file = read_database_file(&path).unwrap_or(DatabaseFile { databases: vec![] });
    let before = file.databases.len();
    file.databases.retain(|item| item.name != name);

    if before == file.databases.len() {
        return Err("未找到对应名称的配置".into());
    }

    write_database_file(&path, &file)?;
    Ok(file)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState { db_path: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // 当第二个实例尝试启动时，会触发这个回调
            println!("Another instance attempted to start with args: {:?}, cwd: {:?}", argv, cwd);
            
            // 获取主窗口并聚焦
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_database_path,
            set_database_path,
            load_database_config,
            upsert_database_entry,
            delete_database_entry
        ])
        .setup(|app| {
            // 给主窗口设置一个标识符
            let window = app.get_webview_window("main").unwrap();
            window.set_title("Database JSON Manager")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

