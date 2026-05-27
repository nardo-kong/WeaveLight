# WeaveLight

以下结论仅基于当前仓库 `main` 分支实际代码与配置（`README.md`、`engine/src/*`、`docs/*`、GitHub Actions 配置）：

## MVP v0.1 实现状态清单（对照要求）

| MVP 要求 | 当前状态 | 依据 |
|---|---|---|
| workspace | ✅ 已实现 | `engine/src/workspace.ts` 的 `initWorkspace` 会创建 `sessions`、`shared/fonts`、`shared/templates` |
| 会话创建 | ✅ 已实现 | `engine/src/workspace.ts` 的 `createSession` 会创建 `docs/history/pages/exports/assets/templates/fonts` 与 `session.json` |
| 一句话生成 | ❌ 未实现 | `engine/src/rpc.ts` 未实现 `generate.start`，仅有 `generate.createSession` |
| 流式进度 | ❌ 未实现 | 无 SSE/WS 事件接口实现；`engine/src/cli.ts` 仅提供 `/health` 与 `/rpc` |
| 预览 | ❌ 未实现 | 仓库中无 Flutter desktop 工程与预览运行时代码 |
| 导出 PDF+PNG | ❌ 未实现 | `engine/src/rpc.ts` 无 `export.*` 方法，`engine/src/*` 无导出管线实现 |
| PPTX IR 骨架 | ⚠️ 文档已定义，代码未实现 | `docs/pptx-ir.md` 有 IR 设计，但 `engine/src/*` 无对应 IR 结构与 writer |
| Engine API | ⚠️ 部分实现 | `docs/engine-api.md` 定义了完整契约，代码仅实现 `workspace.init`/`generate.createSession` |
| CI | ⚠️ 仅有 Copilot 动态工作流 | 仓库当前无面向构建/测试的常规 CI workflow 文件 |
| README | ⚠️ 现已补充状态与测试指引 | 本文档新增了现状清单与本地验证步骤 |

## 未实现或部分实现项（含原因）

1. `generate.start` / 一句话生成：未落地到 engine RPC，当前仅支持会话目录初始化。
2. 流式进度：仅有同步 RPC 请求处理，未实现事件总线与流式协议端点。
3. 预览能力：仓库尚未包含 Flutter desktop 项目或 HTML runtime 预览容器。
4. PDF/PNG 导出：缺少 `export.start`、渲染器与产物写盘代码路径。
5. PPTX IR：设计文档齐全，但未进入可执行代码（IR 生成、writer、测试均缺失）。
6. Engine API：文档范围明显大于当前可调用方法，属于“契约先行、实现滞后”状态。
7. CI：当前未见 `build/test` 自动化流水线，无法在 PR 上自动验证 Node engine 测试。

## 本地测试步骤（基于当前仓库可执行内容）

### 1) 启动 engine

```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
npm install
npm run start
```

启动成功后应输出：`WeaveLight engine sidecar listening on http://127.0.0.1:3322`

### 2) 初始化 workspace

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-1","method":"workspace.init","params":{"workspacePath":"/tmp/weavelight-workspace"}}'
```

期望返回 `result.workspacePath/sessionsPath/sharedPath`。

### 3) 创建会话

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-2","method":"generate.createSession","params":{"workspacePath":"/tmp/weavelight-workspace","sessionId":"demo_s1"}}'
```

### 4) 验证落盘结构

```bash
find /tmp/weavelight-workspace -maxdepth 3 -type d | sort
cat /tmp/weavelight-workspace/sessions/demo_s1/session.json
ls -la /tmp/weavelight-workspace/sessions/demo_s1/history/ops.ndjson
```

应至少看到：
- `/tmp/weavelight-workspace/shared/fonts`
- `/tmp/weavelight-workspace/shared/templates`
- `/tmp/weavelight-workspace/sessions/demo_s1/{docs,history,pages,exports,assets,templates,fonts}`

### 5) 验证“一句话生成/流式进度/导出”当前缺失

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-3","method":"generate.start","params":{"sessionId":"demo_s1","prompt":"一句话生成"}}'
```

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-4","method":"export.start","params":{"sessionId":"demo_s1","format":"pdf"}}'
```

当前应返回 `Method not found`（用于确认功能尚未实现）。

### 6) Flutter desktop 启动与预览翻页验证

当前仓库未包含 Flutter 工程（无 `pubspec.yaml`、`macos/`、`windows/` 等 Flutter desktop 目录），因此**无法执行启动、预览翻页与 UI 交互验证**。  
可先用以下命令确认仓库现状：

```bash
find /tmp/workspace/nardo-kong/WeaveLight -maxdepth 2 -name pubspec.yaml
```

### 7) PDF/PNG 文件落盘验证（当前状态）

由于 `export.start` 未实现，当前无法生成并验证 `exports/*.pdf` 或 `exports/png/*.png`。  
后续补齐导出实现后，可按以下目标结构验收：

```text
workspace/
  sessions/
    <sessionId>/
      exports/
        *.pdf
        png/
          001.png
          002.png
```

## 现有自动化测试

```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
npm test
```

当前覆盖：
- `workspace.init` 目录创建
- `generate.createSession` 目录与元数据落盘
- 非法 `sessionId` 校验
