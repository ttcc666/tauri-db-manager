use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_postgres::NoTls;
use tokio_util::compat::TokioAsyncWriteCompatExt;

const CONNECTION_TEST_TIMEOUT_MS: u64 = 5_000;
const SNAPSHOT_DIR_NAME: &str = ".snapshots";
const SNAPSHOT_KEEP_COUNT: usize = 5;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotMeta {
    file_name: String,
    full_path: String,
    created_at: String,
    size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffSummary {
    added_count: usize,
    removed_count: usize,
    changed_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FieldChange {
    field: String,
    before: Option<String>,
    after: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangedEntry {
    name: String,
    field_changes: Vec<FieldChange>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotDiffResult {
    summary: DiffSummary,
    added: Vec<String>,
    removed: Vec<String>,
    changed: Vec<ChangedEntry>,
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

fn resolve_absolute_path(raw_path: &str) -> PathBuf {
    let mut path = PathBuf::from(raw_path.trim());
    if !path.is_absolute() {
        path = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path);
    }
    path
}

fn snapshot_dir_for(target_file: &Path) -> Result<PathBuf, String> {
    let parent = target_file
        .parent()
        .ok_or_else(|| format!("无法确定配置文件目录: {}", target_file.display()))?;
    Ok(parent.join(SNAPSHOT_DIR_NAME))
}

fn create_snapshot_before_change(target_file: &Path) -> Result<(), String> {
    if !target_file.exists() {
        return Ok(());
    }

    let snapshot_dir = snapshot_dir_for(target_file)?;
    fs::create_dir_all(&snapshot_dir)
        .map_err(|err| format!("创建快照目录失败: {} ({})", snapshot_dir.display(), err))?;

    let now = SystemTime::now();
    let duration = now
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("获取系统时间失败: {}", err))?;
    let file_name = format!(
        "database-{}-{}-{}.json",
        duration.as_secs(),
        duration.subsec_millis(),
        std::process::id()
    );
    let snapshot_path = snapshot_dir.join(file_name);

    fs::copy(target_file, &snapshot_path).map_err(|err| {
        format!(
            "创建快照失败: {} -> {} ({})",
            target_file.display(),
            snapshot_path.display(),
            err
        )
    })?;

    Ok(())
}

fn prune_snapshots(target_file: &Path, keep: usize) -> Result<(), String> {
    let snapshot_dir = snapshot_dir_for(target_file)?;
    if !snapshot_dir.exists() {
        return Ok(());
    }

    let mut snapshots: Vec<(PathBuf, SystemTime)> = fs::read_dir(&snapshot_dir)
        .map_err(|err| format!("读取快照目录失败: {} ({})", snapshot_dir.display(), err))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|path| {
            let modified = fs::metadata(&path)
                .ok()
                .and_then(|meta| meta.modified().ok())
                .unwrap_or(UNIX_EPOCH);
            Some((path, modified))
        })
        .collect();

    snapshots.sort_by(|a, b| b.1.cmp(&a.1));
    if snapshots.len() <= keep {
        return Ok(());
    }

    for (path, _) in snapshots.into_iter().skip(keep) {
        if let Err(err) = fs::remove_file(&path) {
            eprintln!("删除旧快照失败: {} ({})", path.display(), err);
        }
    }

    Ok(())
}

fn list_snapshots_for_target(target_file: &Path) -> Result<Vec<SnapshotMeta>, String> {
    let snapshot_dir = snapshot_dir_for(target_file)?;
    if !snapshot_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<(PathBuf, SystemTime, u64)> = fs::read_dir(&snapshot_dir)
        .map_err(|err| format!("读取快照目录失败: {} ({})", snapshot_dir.display(), err))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            let modified = metadata.modified().ok().unwrap_or(UNIX_EPOCH);
            Some((path, modified, metadata.len()))
        })
        .collect();

    entries.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(entries
        .into_iter()
        .map(|(path, modified, size)| {
            let created_at = modified
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "0".to_string());
            SnapshotMeta {
                file_name: path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string(),
                full_path: path.to_string_lossy().to_string(),
                created_at,
                size,
            }
        })
        .collect())
}

fn ensure_snapshot_path(snapshot_file: &str, target_file: &Path) -> Result<PathBuf, String> {
    let snapshot_dir = snapshot_dir_for(target_file)?;
    let raw = snapshot_file.trim();
    if raw.is_empty() {
        return Err("快照路径不能为空".to_string());
    }

    let candidate = {
        let candidate_path = PathBuf::from(raw);
        if candidate_path.is_absolute() {
            candidate_path
        } else {
            snapshot_dir.join(candidate_path)
        }
    };

    let candidate_canonical = fs::canonicalize(&candidate).map_err(|err| {
        format!(
            "快照文件不存在或不可访问: {} ({})",
            candidate.display(),
            err
        )
    })?;
    let dir_canonical = fs::canonicalize(&snapshot_dir).map_err(|err| {
        format!(
            "快照目录不存在或不可访问: {} ({})",
            snapshot_dir.display(),
            err
        )
    })?;

    if !candidate_canonical.starts_with(&dir_canonical) {
        return Err("仅允许恢复当前配置文件目录下的快照".to_string());
    }

    Ok(candidate_canonical)
}

fn option_bool_as_string(value: Option<bool>) -> Option<String> {
    value.map(|v| if v { "true" } else { "false" }.to_string())
}

fn option_optimization_as_string(value: &Option<OptimizationSettings>) -> Option<String> {
    value
        .as_ref()
        .and_then(|v| serde_json::to_string(v).ok())
        .map(|v| v.trim().to_string())
}

fn push_field_change(
    field_changes: &mut Vec<FieldChange>,
    field: &str,
    before: Option<String>,
    after: Option<String>,
) {
    if before == after {
        return;
    }
    field_changes.push(FieldChange {
        field: field.to_string(),
        before,
        after,
    });
}

fn build_changed_entry(snapshot: &DatabaseEntry, current: &DatabaseEntry) -> Option<ChangedEntry> {
    let mut field_changes = Vec::new();
    push_field_change(
        &mut field_changes,
        "dbType",
        Some(current.db_type.clone()),
        Some(snapshot.db_type.clone()),
    );
    push_field_change(
        &mut field_changes,
        "connectionString",
        Some(current.connection_string.clone()),
        Some(snapshot.connection_string.clone()),
    );
    push_field_change(
        &mut field_changes,
        "description",
        current.description.clone(),
        snapshot.description.clone(),
    );
    push_field_change(
        &mut field_changes,
        "isDefault",
        option_bool_as_string(current.is_default),
        option_bool_as_string(snapshot.is_default),
    );
    push_field_change(
        &mut field_changes,
        "optimizationSettings",
        option_optimization_as_string(&current.optimization_settings),
        option_optimization_as_string(&snapshot.optimization_settings),
    );

    if field_changes.is_empty() {
        None
    } else {
        Some(ChangedEntry {
            name: snapshot.name.clone(),
            field_changes,
        })
    }
}

fn diff_snapshot_with_current(
    snapshot: &DatabaseFile,
    current: &DatabaseFile,
) -> SnapshotDiffResult {
    let snapshot_by_name: HashMap<&str, &DatabaseEntry> = snapshot
        .databases
        .iter()
        .map(|entry| (entry.name.as_str(), entry))
        .collect();
    let current_by_name: HashMap<&str, &DatabaseEntry> = current
        .databases
        .iter()
        .map(|entry| (entry.name.as_str(), entry))
        .collect();

    let mut added = snapshot
        .databases
        .iter()
        .filter(|entry| !current_by_name.contains_key(entry.name.as_str()))
        .map(|entry| entry.name.clone())
        .collect::<Vec<_>>();
    added.sort();

    let mut removed = current
        .databases
        .iter()
        .filter(|entry| !snapshot_by_name.contains_key(entry.name.as_str()))
        .map(|entry| entry.name.clone())
        .collect::<Vec<_>>();
    removed.sort();

    let mut changed = snapshot
        .databases
        .iter()
        .filter_map(|snapshot_entry| {
            let current_entry = current_by_name.get(snapshot_entry.name.as_str())?;
            build_changed_entry(snapshot_entry, current_entry)
        })
        .collect::<Vec<_>>();
    changed.sort_by(|a, b| a.name.cmp(&b.name));

    SnapshotDiffResult {
        summary: DiffSummary {
            added_count: added.len(),
            removed_count: removed.len(),
            changed_count: changed.len(),
        },
        added,
        removed,
        changed,
    }
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
    let mut file = read_database_file(&path).unwrap_or(DatabaseFile { databases: vec![] });
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

    if let Err(err) = create_snapshot_before_change(&path) {
        eprintln!("{}", err);
    }
    write_database_file(&path, &file)?;
    if let Err(err) = prune_snapshots(&path, SNAPSHOT_KEEP_COUNT) {
        eprintln!("{}", err);
    }
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
    let mut file = read_database_file(&path).unwrap_or(DatabaseFile { databases: vec![] });
    let before = file.databases.len();
    file.databases.retain(|item| item.name != name);

    if before == file.databases.len() {
        return Err("未找到对应名称的配置".into());
    }

    if let Err(err) = create_snapshot_before_change(&path) {
        eprintln!("{}", err);
    }
    write_database_file(&path, &file)?;
    if let Err(err) = prune_snapshots(&path, SNAPSHOT_KEEP_COUNT) {
        eprintln!("{}", err);
    }
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
            let mut current = read_database_file(&current_file_path)
                .unwrap_or(DatabaseFile { databases: vec![] });
            for incoming in normalized_imported {
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
        _ => {
            return Err("导入模式不支持，请使用 merge 或 replace".to_string());
        }
    };

    if let Err(err) = create_snapshot_before_change(&current_file_path) {
        eprintln!("{}", err);
    }
    write_database_file(&current_file_path, &next_file)?;
    if let Err(err) = prune_snapshots(&current_file_path, SNAPSHOT_KEEP_COUNT) {
        eprintln!("{}", err);
    }

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
fn list_snapshots(state: tauri::State<AppState>) -> Result<Vec<SnapshotMeta>, String> {
    let target_path = current_path(&state)?;
    list_snapshots_for_target(&target_path)
}

#[tauri::command]
fn restore_snapshot(
    snapshot_file: String,
    state: tauri::State<AppState>,
) -> Result<DatabaseFile, String> {
    let target_path = current_path(&state)?;
    let snapshot_path = ensure_snapshot_path(&snapshot_file, &target_path)?;
    let snapshot_data = read_database_file(&snapshot_path)?;

    if let Err(err) = create_snapshot_before_change(&target_path) {
        eprintln!("{}", err);
    }
    write_database_file(&target_path, &snapshot_data)?;
    if let Err(err) = prune_snapshots(&target_path, SNAPSHOT_KEEP_COUNT) {
        eprintln!("{}", err);
    }

    Ok(snapshot_data)
}

#[tauri::command]
fn compare_snapshot_with_current(
    snapshot_file: String,
    state: tauri::State<AppState>,
) -> Result<SnapshotDiffResult, String> {
    let target_path = current_path(&state)?;
    let snapshot_path = ensure_snapshot_path(&snapshot_file, &target_path)?;
    let snapshot_data = read_database_file(&snapshot_path)?;
    let current_data =
        read_database_file(&target_path).unwrap_or(DatabaseFile { databases: vec![] });
    Ok(diff_snapshot_with_current(&snapshot_data, &current_data))
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
            list_snapshots,
            restore_snapshot,
            compare_snapshot_with_current,
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
