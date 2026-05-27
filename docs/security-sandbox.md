# Security Sandbox

关联文档：
- [architecture.md](./architecture.md)
- [engine-api.md](./engine-api.md)
- [workspace-format.md](./workspace-format.md)
- [font-spec.md](./font-spec.md)

## 1. allowed roots
Engine 对文件系统访问必须限制在 allowed roots：
- 当前 workspace 根目录
- 显式授权的导入目录（临时）
- 应用缓存目录

任何路径在访问前都必须做标准化与根校验。

## 2. 路径穿越防护
- 统一 `realpath` + `normalize`。
- 拒绝 `..` 越界与符号链接逃逸。
- zip 解压时逐文件校验目标路径。

## 3. RPC 安全
- 本地 sidecar 仅监听 loopback。
- 每个会话短期 token。
- 高风险方法（导入/导出/删除）增加确认与审计日志。

## 4. 移动端远端模式上传策略
- 默认最小上传：仅上传当前 session 必需页面、资产引用、FontManifest。
- 大文件分片与哈希校验。
- 敏感资产可选择脱敏/跳过。
- 导出后按策略清理远端临时文件。

## 5. 数据最小化与审计
- 事件日志记录元信息，不记录明文敏感内容。
- 导出 warning/error 保留可定位字段，避免泄露本地绝对路径。
