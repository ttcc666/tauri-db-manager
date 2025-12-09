# 单实例应用程序配置

这个 Tauri 应用程序已经配置为单实例模式，确保同时只能运行一个应用程序实例。

## 配置说明

### 1. 依赖项
在 `Cargo.toml` 中添加了：
```toml
tauri-plugin-single-instance = "2"
```

### 2. 代码配置
在 `src-tauri/src/lib.rs` 中：
- 导入了 `tauri::Manager` trait
- 配置了 `tauri_plugin_single_instance` 插件
- 设置了回调函数来处理第二个实例启动时的行为

### 3. 窗口配置
在 `tauri.conf.json` 中为主窗口设置了 `label: "main"`，以便在单实例回调中能够找到它。

## 工作原理

1. 当用户第一次启动应用程序时，它会正常启动并显示主窗口。

2. 当用户尝试再次启动应用程序时：
   - 第二个实例会检测到已经有一个实例在运行
   - 第二个实例会立即退出
   - 第一个实例会收到通知，并将焦点带到其窗口上
   - 如果窗口被最小化，它会恢复显示

## 测试方法

1. 构建应用程序：
   ```bash
   cd src-tauri
   cargo build --release
   ```

2. 运行第一个实例：
   ```bash
   .\target\release\tauri-db-manager.exe
   ```

3. 尝试运行第二个实例（应该会激活第一个实例而不是打开新窗口）：
   ```bash
   .\target\release\tauri-db-manager.exe
   ```

## 注意事项

- 单实例功能基于应用程序的唯一标识符（在 `tauri.conf.json` 中的 `identifier` 字段）
- 当前配置的标识符是：`com.kgmcw.database-json-manager`
- 如果修改了标识符，单实例控制会重置