# WeaveLight

基于 `main` 分支当前代码与已关闭 PR（#1、#2），v0.1 目前是**文档先行 + Node/TS sidecar 最小可运行骨架**，尚未达到“完整端到端 MVP（生成/预览/导出）”。

## v0.1 MVP 实现清单（main 当前状态）

### 最近相关 PR / 提交
- PR #1（已合并）：补齐技术方案文档集（架构、Engine API、Workspace、DOM Contract、PPTX IR、导出管线、安全等）。
- PR #2（已合并）：提交 `engine/` Node/TS sidecar，落地 `workspace.init` 与 `generate.createSession`，并加入基础单测。
- 主分支关键提交：`12a7038`（`Bootstrap v0.1 desktop sidecar...`）。

### 已完成
- **Workspace 初始化**：`workspace/sessions`、`workspace/shared/fonts`、`workspace/shared/templates` 可自动创建。
- **Node Engine（最小）**：
  - `GET /health`
  - `POST /rpc` + JSON-RPC 请求校验
  - `workspace.init`
  - `generate.createSession`
- **会话目录落地**：创建 `docs/history/pages/exports/assets/templates/fonts`、`session.json`、`history/ops.ndjson`。
- **CI/文档基础**：仓库已接入 Copilot cloud agent/code review 工作流；README 与 `docs/*` 设计文档已存在。

### 部分完成
- **IR/抽取骨架**：`docs/pptx-ir.md`、`docs/deck-dom-contract.md` 仅有规范文档，代码实现未落地。
- **Engine API 覆盖度**：`docs/engine-api.md` 定义了较完整方法面，但代码仅实现其中 2 个核心方法。

### 未完成（与此前 v0.1 目标相比）
- **Flutter desktop app**：仓库内暂无 Flutter 工程（无 `apps/desktop_flutter`）。
- **一句话生成/流式进度**：无 `generate.start`、SSE/WS 流式事件实现。
- **预览**：无 WebView 容器与翻页能力。
- **导出 PDF/PNG**：无 `export.start`、无 Playwright 导出逻辑。
- **PPTX IR 抽取/写回代码**：暂无 `DOM -> IR`、writer stub 代码目录。

### 缺口与下一步建议
1. 先补最小 Flutter Desktop 壳（会话创建页 + WebView 预览容器 + Engine 健康检查）。
2. 在 Engine 中按 `docs/engine-api.md` 依次实现：
   - `generate.start`（先假数据也可）+ `generation.progress` 事件；
   - `export.start`（先 PNG，再 PDF）；
   - `deck.get/deck.persist`（先文件级读写）。
3. 建立最小 monorepo 目录（`apps/desktop_flutter`, `packages/engine_contract`）避免后续迁移返工。
4. 补一条真正执行 `npm test` 的 CI 检查（当前已修复本地测试命令）。

## Engine（Node/TS）

```bash
cd engine
npm install
npm run start
```

默认监听 `127.0.0.1:3322`，提供：

- `workspace.init`：初始化 `workspace/sessions` 与 `workspace/shared/{fonts,templates}`
- `generate.createSession`：在 `sessions/{sessionId}` 下创建 `docs/history/pages/exports/assets/templates/fonts` 与 `session.json`

JSON-RPC 示例：

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-1","method":"workspace.init","params":{"workspacePath":"/tmp/weavelight-workspace"}}'
```

## 快速测试指南（命令 + 预期结果）

> 说明：以下步骤严格基于 `main` 当前实现，包含“已支持能力验证”与“未实现能力确认”。

### 1) 依赖安装
```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
npm install
```
预期：安装成功，无高危依赖告警。

### 2) 运行测试（本地）
```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
npm test
```
预期：`workspace.test` 通过（workspace 初始化、session 创建、非法 sessionId 拒绝）。

### 3) 启动 Engine
```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
npm run start
```
预期：输出 `WeaveLight engine sidecar listening on http://127.0.0.1:3322`。

### 4) 健康检查 + 初始化工作区
```bash
curl -s http://127.0.0.1:3322/health
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-init","method":"workspace.init","params":{"workspacePath":"/tmp/weavelight-workspace"}}'
```
预期：
- `/health` 返回 `{"ok":true}`；
- `workspace.init` 返回 `workspacePath/sessionsPath/sharedPath`。

### 5) 创建生成会话（当前可验证到“会话骨架创建”）
```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-session","method":"generate.createSession","params":{"workspacePath":"/tmp/weavelight-workspace","sessionId":"demo_001"}}'
```
预期：返回 `sessionPath` 与 `sessionFile`。

检查产物路径：
```bash
find /tmp/weavelight-workspace/sessions/demo_001 -maxdepth 2 -type d | sort
cat /tmp/weavelight-workspace/sessions/demo_001/session.json
```
预期：包含 `docs/history/pages/exports/assets/templates/fonts`，且 `session.json` 有 `canvasSpec/fontManifest/apiVersion`。

### 6) Flutter desktop / 生成 / 预览 / 导出（当前状态确认）
```bash
ls -la /tmp/workspace/nardo-kong/WeaveLight/apps
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-generate","method":"generate.start","params":{"sessionId":"demo_001"}}'
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-export","method":"export.start","params":{"sessionId":"demo_001","format":"pdf"}}'
```
预期：
- `apps` 目录不存在（Flutter Desktop 尚未实现）；
- `generate.start` / `export.start` 返回 `Method not found`（功能缺口与清单一致）。

### 7) 常见问题排查
- `workspacePath must be absolute`：请使用绝对路径（如 `/tmp/weavelight-workspace`）。
- `sessionId must only include letters, numbers, _ or -`：sessionId 仅允许字母/数字/`_`/`-`。
- `EADDRINUSE: 3322`：设置 `WEAVELIGHT_ENGINE_PORT` 或释放端口后重启。
- 请求返回 `Parse error`：检查 JSON 是否合法、引号是否转义。
