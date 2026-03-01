use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_postgres::NoTls;
use tokio_util::compat::TokioAsyncWriteCompatExt;

const CONNECTION_TEST_TIMEOUT_MS: u64 = 5_000;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionTestResult {
    ok: bool,
    db_type: String,
    latency_ms: u64,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationResult {
    valid: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
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

fn normalize_conn_key(key: &str) -> String {
    key.trim()
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '_' && *ch != '-')
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>()
}

fn parse_kv_connection_string(connection_string: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    for chunk in connection_string.split(';') {
        let trimmed = chunk.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some((raw_key, raw_value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = normalize_conn_key(raw_key);
        if key.is_empty() {
            continue;
        }
        let value = raw_value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        params.insert(key, value);
    }
    params
}

fn get_param(params: &HashMap<String, String>, aliases: &[&str]) -> Option<String> {
    aliases
        .iter()
        .map(|alias| normalize_conn_key(alias))
        .find_map(|key| params.get(&key).cloned())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn require_param(
    params: &HashMap<String, String>,
    aliases: &[&str],
    field_label: &str,
) -> Result<String, String> {
    get_param(params, aliases).ok_or_else(|| format!("连接字符串缺少必填字段: {}", field_label))
}

fn parse_port(params: &HashMap<String, String>, default_port: u16) -> Result<u16, String> {
    match get_param(params, &["port"]) {
        Some(raw) => raw
            .parse::<u16>()
            .map_err(|_| format!("端口格式不正确: {}", raw)),
        None => Ok(default_port),
    }
}

fn truncate_detail(detail: String, max_chars: usize) -> String {
    if detail.chars().count() <= max_chars {
        return detail;
    }
    let shortened = detail.chars().take(max_chars).collect::<String>();
    format!("{}...", shortened)
}

fn redact_sensitive_detail(detail: String, connection_string: &str) -> String {
    let mut sanitized = detail;
    let params = parse_kv_connection_string(connection_string);
    if let Some(password) = get_param(&params, &["password", "pwd"]) {
        if !password.is_empty() {
            sanitized = sanitized.replace(&password, "***");
        }
    }
    truncate_detail(sanitized, 360)
}

fn map_user_friendly_message(detail: &str) -> String {
    let lower = detail.to_lowercase();
    if lower.contains("暂不支持") || lower.contains("not supported") {
        return "当前数据库类型暂不支持测试连接".to_string();
    }
    if lower.contains("access denied")
        || lower.contains("authentication failed")
        || lower.contains("password authentication failed")
        || lower.contains("login failed")
        || lower.contains("invalid password")
    {
        return "认证失败，请检查用户名或密码".to_string();
    }
    if lower.contains("timed out") || lower.contains("timeout") {
        return "连接超时，请检查网络、地址或端口".to_string();
    }
    if lower.contains("connection refused")
        || lower.contains("actively refused")
        || lower.contains("could not connect")
        || lower.contains("no route to host")
    {
        return "无法建立网络连接，请检查主机和端口".to_string();
    }
    if lower.contains("unknown host")
        || lower.contains("name or service not known")
        || lower.contains("temporary failure in name resolution")
    {
        return "无法解析主机名，请检查 Host 配置".to_string();
    }
    if lower.contains("invalid") || lower.contains("parse") || lower.contains("malformed") {
        return "连接字符串格式不正确，请检查字段和值".to_string();
    }
    "连接测试失败，请检查连接字符串与数据库服务状态".to_string()
}

fn build_success_result(db_type: &str, started: Instant) -> ConnectionTestResult {
    ConnectionTestResult {
        ok: true,
        db_type: db_type.to_string(),
        latency_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        message: format!("{} 连接成功", db_type),
        detail: None,
    }
}

fn build_failure_result(
    db_type: &str,
    started: Instant,
    message: String,
    detail: String,
) -> ConnectionTestResult {
    ConnectionTestResult {
        ok: false,
        db_type: db_type.to_string(),
        latency_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        message,
        detail: Some(detail),
    }
}

fn validation_ok(message: impl Into<String>) -> ValidationResult {
    ValidationResult {
        valid: true,
        message: message.into(),
        detail: None,
    }
}

fn validation_fail(message: impl Into<String>, detail: impl Into<String>) -> ValidationResult {
    ValidationResult {
        valid: false,
        message: message.into(),
        detail: Some(detail.into()),
    }
}

fn validate_connection_string(db_type: &str, connection_string: &str) -> ValidationResult {
    let normalized_type = db_type.trim();
    if normalized_type.is_empty() {
        return validation_fail("数据库类型不能为空", "参数 dbType 为空");
    }

    let normalized_conn = connection_string.trim();
    if normalized_conn.is_empty() {
        return validation_fail("连接字符串不能为空", "参数 connectionString 为空");
    }

    let params = parse_kv_connection_string(normalized_conn);
    if params.is_empty() {
        return validation_fail(
            "连接字符串格式不正确",
            "未解析到有效参数，请使用 key=value;key2=value2; 格式",
        );
    }

    let lower_db = normalized_type.to_ascii_lowercase();

    let outcome: Result<String, String> = (|| match lower_db.as_str() {
        "postgresql" | "postgres" => {
            require_param(&params, &["host", "server"], "Host/Server")?;
            require_param(
                &params,
                &["username", "user", "userid", "uid"],
                "Username/User",
            )?;
            parse_port(&params, 5432)?;
            Ok("PostgreSQL 连接字符串校验通过".to_string())
        }
        "mysql" => {
            require_param(&params, &["host", "server"], "Host/Server")?;
            require_param(
                &params,
                &["username", "user", "userid", "uid"],
                "Username/User",
            )?;
            parse_port(&params, 3306)?;
            Ok("MySql 连接字符串校验通过".to_string())
        }
        "sqlserver" | "mssql" => {
            require_param(&params, &["host", "server", "datasource"], "Host/Server")?;
            require_param(
                &params,
                &["username", "user", "userid", "uid"],
                "User Id/User",
            )?;
            parse_port(&params, 1433)?;
            Ok("SqlServer 连接字符串校验通过".to_string())
        }
        "sqlite" => {
            require_param(&params, &["datasource", "filename", "file"], "Data Source")?;
            Ok("Sqlite 连接字符串校验通过".to_string())
        }
        _ => Ok(format!(
            "{} 暂未提供强校验规则，已通过基础格式校验",
            normalized_type
        )),
    })();

    match outcome {
        Ok(message) => validation_ok(message),
        Err(detail) => validation_fail("连接字符串校验失败", detail),
    }
}

async fn test_postgres_connection(params: &HashMap<String, String>) -> Result<(), String> {
    let host = require_param(params, &["host", "server"], "Host/Server")?;
    let user = require_param(
        params,
        &["username", "user", "userid", "uid"],
        "Username/User",
    )?;
    let password = get_param(params, &["password", "pwd"]).unwrap_or_default();
    let database = get_param(params, &["database"]);
    let port = parse_port(params, 5432)?;

    let mut config = tokio_postgres::Config::new();
    config.host(&host);
    config.port(port);
    config.user(&user);
    if !password.is_empty() {
        config.password(password);
    }
    if let Some(db_name) = database {
        config.dbname(&db_name);
    }
    config.connect_timeout(Duration::from_millis(CONNECTION_TEST_TIMEOUT_MS));

    let (client, connection) = config
        .connect(NoTls)
        .await
        .map_err(|err| format!("PostgreSQL 连接失败: {}", err))?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });
    drop(client);
    Ok(())
}

async fn test_mysql_connection(params: &HashMap<String, String>) -> Result<(), String> {
    let host = require_param(params, &["host", "server"], "Host/Server")?;
    let user = require_param(
        params,
        &["username", "user", "userid", "uid"],
        "Username/User",
    )?;
    let password = get_param(params, &["password", "pwd"]).unwrap_or_default();
    let database = get_param(params, &["database"]);
    let port = parse_port(params, 3306)?;

    let join_result = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = mysql::OptsBuilder::new();
        builder = builder.ip_or_hostname(Some(host));
        builder = builder.tcp_port(port);
        builder = builder.user(Some(user));
        if !password.is_empty() {
            builder = builder.pass(Some(password));
        }
        if let Some(db_name) = database {
            builder = builder.db_name(Some(db_name));
        }

        let opts = mysql::Opts::from(builder);
        mysql::Conn::new(opts)
            .map(|_| ())
            .map_err(|err| format!("MySql 连接失败: {}", err))
    })
    .await
    .map_err(|err| format!("MySql 测试任务执行失败: {}", err))?;

    join_result
}

async fn test_sqlserver_connection(params: &HashMap<String, String>) -> Result<(), String> {
    let host = require_param(params, &["host", "server", "datasource"], "Host/Server")?;
    let user = require_param(
        params,
        &["username", "user", "userid", "uid"],
        "User Id/User",
    )?;
    let password = get_param(params, &["password", "pwd"]).unwrap_or_default();
    let database = get_param(params, &["database"]);
    let port = parse_port(params, 1433)?;

    let mut config = tiberius::Config::new();
    config.host(&host);
    config.port(port);
    config.authentication(tiberius::AuthMethod::sql_server(user, password));
    if let Some(db_name) = database {
        config.database(db_name);
    }
    config.trust_cert();

    let addr = config.get_addr();
    let tcp = TcpStream::connect(addr)
        .await
        .map_err(|err| format!("SqlServer 网络连接失败: {}", err))?;
    tcp.set_nodelay(true)
        .map_err(|err| format!("SqlServer TCP 参数设置失败: {}", err))?;

    let _client = tiberius::Client::connect(config, tcp.compat_write())
        .await
        .map_err(|err| format!("SqlServer 连接失败: {}", err))?;

    Ok(())
}

async fn test_sqlite_connection(params: &HashMap<String, String>) -> Result<(), String> {
    let path = require_param(params, &["datasource", "filename", "file"], "Data Source")?;
    let mode = get_param(params, &["mode"]).unwrap_or_else(|| "ReadWriteCreate".to_string());

    let join_result = tauri::async_runtime::spawn_blocking(move || {
        let flags = if mode.eq_ignore_ascii_case("readonly") {
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
        } else if mode.eq_ignore_ascii_case("readwrite") {
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
        } else {
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
        };

        let connection = rusqlite::Connection::open_with_flags(path, flags)
            .map_err(|err| format!("Sqlite 打开失败: {}", err))?;
        connection
            .close()
            .map_err(|(_, err)| format!("Sqlite 关闭连接失败: {}", err))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| format!("Sqlite 测试任务执行失败: {}", err))?;

    join_result
}

async fn test_connection_by_type(db_type: &str, connection_string: &str) -> Result<(), String> {
    let params = parse_kv_connection_string(connection_string);
    if params.is_empty() {
        return Err("连接字符串格式无效，请使用 key=value;key2=value2;".to_string());
    }

    let lower_db = db_type.trim().to_ascii_lowercase();
    let operation = async {
        match lower_db.as_str() {
            "postgresql" | "postgres" => test_postgres_connection(&params).await,
            "mysql" => test_mysql_connection(&params).await,
            "sqlserver" | "mssql" => test_sqlserver_connection(&params).await,
            "sqlite" => test_sqlite_connection(&params).await,
            _ => Err(format!("当前数据库类型暂不支持测试连接: {}", db_type)),
        }
    };

    timeout(Duration::from_millis(CONNECTION_TEST_TIMEOUT_MS), operation)
        .await
        .map_err(|_| "连接超时，请检查网络、地址或端口".to_string())??;

    Ok(())
}

fn current_path(state: &tauri::State<AppState>) -> Result<PathBuf, String> {
    state
        .db_path
        .lock()
        .map_err(|_| "路径状态不可用".to_string())?
        .clone()
        .ok_or_else(|| "请先设置配置文件路径".to_string())
}

fn map_read_file_error(path: &Path, err: std::io::Error) -> String {
    match err.kind() {
        ErrorKind::NotFound => format!("配置文件不存在: {}", path.display()),
        ErrorKind::PermissionDenied => {
            format!("读取配置文件权限不足: {}", path.display())
        }
        _ => format!("读取配置文件失败: {} ({})", path.display(), err),
    }
}

fn read_database_file(path: &Path) -> Result<DatabaseFile, String> {
    let raw = fs::read_to_string(path).map_err(|err| map_read_file_error(path, err))?;
    serde_json::from_str::<DatabaseFile>(&raw)
        .map_err(|err| format!("解析配置文件失败: {} ({})", path.display(), err))
}

fn read_database_file_strict(path: &Path, action: &str) -> Result<DatabaseFile, String> {
    read_database_file(path).map_err(|err| format!("{}前读取配置失败: {}", action, err))
}

fn merge_database_entries(
    mut current: DatabaseFile,
    incoming_entries: Vec<DatabaseEntry>,
) -> DatabaseFile {
    for incoming in incoming_entries {
        if let Some(position) = current
            .databases
            .iter()
            .position(|item| item.name == incoming.name)
        {
            current.databases[position] = incoming;
        } else {
            current.databases.push(incoming);
        }
    }
    current
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

fn resolve_absolute_path(raw_path: &str) -> PathBuf {
    let mut path = PathBuf::from(raw_path.trim());
    if !path.is_absolute() {
        path = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path);
    }
    path
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

    let buf = resolve_absolute_path(trimmed);

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
    let mut file = read_database_file_strict(&path, "保存")?;
    let normalized = entry.normalized();

    if let Some(position) = file
        .databases
        .iter()
        .position(|item| item.name == normalized.name)
    {
        file.databases[position] = normalized;
    } else {
        file.databases.push(normalized);
    }

    write_database_file(&path, &file)?;
    Ok(file)
}

#[tauri::command]
fn delete_database_entry(
    name: String,
    state: tauri::State<AppState>,
) -> Result<DatabaseFile, String> {
    if name.trim().is_empty() {
        return Err("要删除的名称不能为空".into());
    }

    let path = current_path(&state)?;
    let mut file = read_database_file_strict(&path, "删除")?;
    let before = file.databases.len();
    file.databases.retain(|item| item.name != name);

    if before == file.databases.len() {
        return Err("未找到对应名称的配置".into());
    }

    write_database_file(&path, &file)?;
    Ok(file)
}

#[tauri::command]
fn import_database_entries(
    path: String,
    mode: String,
    state: tauri::State<AppState>,
) -> Result<DatabaseFile, String> {
    let import_path = resolve_absolute_path(&path);
    let imported = read_database_file(&import_path)?;
    let normalized_imported = imported
        .databases
        .into_iter()
        .map(DatabaseEntry::normalized)
        .collect::<Vec<_>>();

    let current_file_path = current_path(&state)?;
    let mode_normalized = mode.trim().to_ascii_lowercase();

    let next_file = match mode_normalized.as_str() {
        "replace" => DatabaseFile {
            databases: normalized_imported,
        },
        "merge" => {
            let current = read_database_file_strict(&current_file_path, "导入(merge)")?;
            merge_database_entries(current, normalized_imported)
        }
        _ => {
            return Err("导入模式不支持，请使用 merge 或 replace".to_string());
        }
    };

    write_database_file(&current_file_path, &next_file)?;

    Ok(next_file)
}

#[tauri::command]
fn export_database_entries(path: String, entries: Vec<DatabaseEntry>) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("导出路径不能为空".to_string());
    }

    let export_path = resolve_absolute_path(trimmed);
    let payload = DatabaseFile {
        databases: entries
            .into_iter()
            .map(DatabaseEntry::normalized)
            .collect::<Vec<_>>(),
    };
    write_database_file(&export_path, &payload)
}

#[tauri::command]
fn validate_database_entry(
    db_type: String,
    connection_string: String,
) -> Result<ValidationResult, String> {
    Ok(validate_connection_string(&db_type, &connection_string))
}

#[tauri::command]
async fn test_database_connection(
    db_type: String,
    connection_string: String,
) -> Result<ConnectionTestResult, String> {
    let started = Instant::now();
    let normalized_type = db_type.trim().to_string();
    let normalized_connection_string = connection_string.trim().to_string();

    if normalized_type.is_empty() {
        return Ok(build_failure_result(
            "Unknown",
            started,
            "数据库类型不能为空".to_string(),
            "参数 dbType 为空".to_string(),
        ));
    }

    if normalized_connection_string.is_empty() {
        return Ok(build_failure_result(
            &normalized_type,
            started,
            "连接字符串不能为空".to_string(),
            "参数 connectionString 为空".to_string(),
        ));
    }

    match test_connection_by_type(&normalized_type, &normalized_connection_string).await {
        Ok(_) => Ok(build_success_result(&normalized_type, started)),
        Err(raw_detail) => {
            let detail = redact_sensitive_detail(raw_detail, &normalized_connection_string);
            let message = map_user_friendly_message(&detail);
            Ok(build_failure_result(
                &normalized_type,
                started,
                message,
                detail,
            ))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            db_path: Mutex::new(None),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // 当第二个实例尝试启动时，会触发这个回调
            println!(
                "Another instance attempted to start with args: {:?}, cwd: {:?}",
                argv, cwd
            );

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
            delete_database_entry,
            import_database_entries,
            export_database_entries,
            validate_database_entry,
            test_database_connection
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(name: &str, db_type: &str, connection_string: &str) -> DatabaseEntry {
        DatabaseEntry {
            name: name.to_string(),
            connection_string: connection_string.to_string(),
            db_type: db_type.to_string(),
            description: None,
            is_default: None,
            optimization_settings: None,
        }
    }

    #[test]
    fn parse_kv_connection_string_works_with_invalid_chunks_ignored() {
        let params = parse_kv_connection_string(
            " Host = localhost ; invalid ; Port=5432; User_Name = postgres ; ; Password='123' ",
        );

        assert_eq!(params.get("host").map(String::as_str), Some("localhost"));
        assert_eq!(params.get("port").map(String::as_str), Some("5432"));
        assert_eq!(params.get("username").map(String::as_str), Some("postgres"));
        assert_eq!(params.get("password").map(String::as_str), Some("123"));
        assert!(!params.contains_key("invalid"));
    }

    #[test]
    fn validate_connection_string_for_postgresql_requires_host_and_user() {
        let result = validate_connection_string("PostgreSQL", "Port=5432;Database=postgres;");

        assert!(!result.valid);
        assert_eq!(result.message, "连接字符串校验失败");
        assert!(result
            .detail
            .unwrap_or_default()
            .contains("连接字符串缺少必填字段"));
    }

    #[test]
    fn validate_connection_string_for_mysql_detects_invalid_port() {
        let result = validate_connection_string(
            "MySql",
            "Host=localhost;User=root;Port=invalid;Database=test;",
        );

        assert!(!result.valid);
        assert_eq!(result.message, "连接字符串校验失败");
        assert!(result.detail.unwrap_or_default().contains("端口格式不正确"));
    }

    #[test]
    fn validate_connection_string_for_sqlserver_and_sqlite_can_pass() {
        let sqlserver_result = validate_connection_string(
            "SqlServer",
            "Server=localhost;User Id=sa;Password=123456;Port=1433;",
        );
        assert!(sqlserver_result.valid);

        let sqlite_result =
            validate_connection_string("Sqlite", "Data Source=./data/local.db;Mode=ReadWriteCreate;");
        assert!(sqlite_result.valid);
    }

    #[test]
    fn validate_connection_string_for_unsupported_type_uses_basic_rule_message() {
        let result = validate_connection_string("Oracle", "Host=localhost;User ID=system;");

        assert!(result.valid);
        assert!(result
            .message
            .contains("暂未提供强校验规则，已通过基础格式校验"));
    }

    #[test]
    fn merge_database_entries_overwrites_same_name_and_appends_new() {
        let current = DatabaseFile {
            databases: vec![
                make_entry("main", "PostgreSQL", "Host=old;User=old;"),
                make_entry("analytics", "MySql", "Host=mysql;User=root;"),
            ],
        };
        let incoming = vec![
            make_entry("main", "PostgreSQL", "Host=new;User=new;"),
            make_entry("report", "Sqlite", "Data Source=./report.db;"),
        ];

        let merged = merge_database_entries(current, incoming);

        assert_eq!(merged.databases.len(), 3);
        let main = merged
            .databases
            .iter()
            .find(|entry| entry.name == "main")
            .expect("main should exist");
        assert_eq!(main.connection_string, "Host=new;User=new;");
        assert!(merged.databases.iter().any(|entry| entry.name == "report"));
        assert!(merged
            .databases
            .iter()
            .any(|entry| entry.name == "analytics"));
    }
}
