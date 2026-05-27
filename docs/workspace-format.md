# Workspace Format（Local-first）

关联文档：
- [architecture.md](./architecture.md)
- [engine-api.md](./engine-api.md)
- [deck-dom-contract.md](./deck-dom-contract.md)
- [font-spec.md](./font-spec.md)

## 1. 目录结构
```text
workspace/
  sessions/
    {sessionId}/
      session.json
      docs/
      history/
      pages/
      exports/
      assets/
      templates/
      fonts/
  shared/
    fonts/
    templates/
```

## 2. 关键目录职责
- `sessions/{id}/docs`：输入文档与解析结果。
- `sessions/{id}/history`：patch 日志、版本快照、操作索引。
- `sessions/{id}/exports`：导出产物（pdf/png/pptx）。
- `sessions/{id}/assets`：图片/视频/附件（含 hash 索引）。
- `sessions/{id}/templates`：会话级模板快照。
- `sessions/{id}/fonts`：归一化字体文件 + FontManifest。

## 3. 核心元数据文件
### 3.1 `session.json`
```json
{
  "sessionId":"s1",
  "createdAt":"2026-01-01T00:00:00Z",
  "canvasSpec":{"widthPx":1920,"heightPx":1080,"ratio":"16:9"},
  "fontManifest":"fonts/manifest.json",
  "apiVersion":"1.0"
}
```

### 3.2 `history/ops.ndjson`
- 每行一条 patch 事件，包含 `seq`、`actor`、`op`、`nodeId`。

## 4. 导入/导出打包格式
## 4.1 session zip
```text
session-{id}.zip
  manifest.json
  pages/
  assets/
  fonts/
  history/
```

## 4.2 slide-pack（轻量）
```text
slide-pack-{id}.zip
  manifest.json
  page-fragments/
  asset-map.json
  fonts/manifest.json
```

## 5. 兼容规则
- 未知字段保持透传。
- 升级时仅追加字段，不破坏旧版本读取。
- 所有路径为相对路径，读取前必须做 allowed roots 校验（见 [security-sandbox.md](./security-sandbox.md)）。
