# Engine API（Flutter ↔ Engine RPC）

关联文档：
- [architecture.md](./architecture.md)
- [workspace-format.md](./workspace-format.md)
- [deck-dom-contract.md](./deck-dom-contract.md)
- [pptx-ir.md](./pptx-ir.md)
- [security-sandbox.md](./security-sandbox.md)

## 1. 协议总览
- 风格：JSON-RPC 2.0（请求/响应）+ SSE/WS（事件流）。
- 传输：
  - Desktop：`localhost` loopback（sidecar）。
  - Mobile：HTTPS 远端 Engine（token 鉴权）。

标准请求：
```json
{"jsonrpc":"2.0","id":"req-1","method":"export.start","params":{}}
```

标准响应：
```json
{"jsonrpc":"2.0","id":"req-1","result":{"jobId":"job-1"}}
```

错误响应：
```json
{"jsonrpc":"2.0","id":"req-1","error":{"code":1003,"message":"Invalid CanvasSpec","data":{"field":"heightPx"}}}
```

## 2. 方法列表（最小核心）
## 2.1 Session / Workspace
- `workspace.init`
- `workspace.open`
- `workspace.import`（session zip / slide-pack）
- `workspace.export`

## 2.2 Generation
- `generate.createSession`
- `generate.start`
- `generate.cancel`
- `generate.retryPage`

## 2.3 Deck Editing
- `deck.get`
- `deck.patch.apply`（patch 协议见 [deck-dom-contract.md](./deck-dom-contract.md)）
- `deck.node.inspect`
- `deck.persist`

## 2.4 Font / Assets
- `font.import`
- `font.list`
- `asset.import`
- `asset.resolve`

## 2.5 Export / Import
- `export.start`
- `export.status`
- `export.cancel`
- `pptx.import`

## 3. 关键请求/响应结构
### 3.1 `generate.start.params`
```json
{
  "sessionId":"s1",
  "prompt":"...",
  "canvasSpec":{"widthPx":1920,"heightPx":1080,"ratio":"16:9"},
  "fontProfile":{"title":"Inter","body":"Noto Sans"}
}
```

### 3.2 `deck.patch.apply.params`
```json
{
  "sessionId":"s1",
  "pageId":"p1",
  "patch":[{"op":"setStyle","nodeId":"n-1","path":"style.left","value":"120px"}]
}
```

### 3.3 `export.start.params`
```json
{
  "sessionId":"s1",
  "format":"pptx-editable",
  "canvasSpec":{"widthPx":1920,"heightPx":1080,"ratio":"16:9"},
  "fontManifestRef":"fonts/manifest.json"
}
```

## 4. 事件（SSE/WS）
- `generation.progress`
- `generation.delta`
- `export.progress`
- `export.warning`
- `job.completed`
- `job.failed`

事件字段统一：`requestId`, `jobId`, `seq`, `timestamp`, `payload`。

## 5. 错误码
- `1001 INVALID_PARAMS`
- `1002 NOT_FOUND`
- `1003 CONTRACT_VIOLATION`（Deck DOM Contract / CanvasSpec / PPTX IR）
- `1004 AUTH_FAILED`
- `1005 FORBIDDEN_PATH`
- `1006 JOB_CONFLICT`
- `1007 UNSUPPORTED_FORMAT`
- `2001 ENGINE_INTERNAL`
- `2002 DEPENDENCY_FAILURE`

## 6. 鉴权与移动端远端模式
- Desktop 本地 sidecar：短期 token + loopback 绑定。
- Mobile 远端：
  - JWT + 过期机制
  - 可选设备绑定签名
  - 上传策略：仅上传导出必要数据，敏感资源可脱敏（见 [security-sandbox.md](./security-sandbox.md)）

## 7. 版本策略
- `workspace.meta.apiVersion`
- RPC `capabilities` 探测：Flutter 根据能力开关控制 UI。
