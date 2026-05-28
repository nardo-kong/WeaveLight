# WeaveLight

MVP（v0.1）当前提供 Node/TypeScript 本地 sidecar（桌面端优先），实现了最小可用工作区初始化与会话目录落地能力。

## Engine（Node/TS）

```bash
cd engine
npm install
npm run start
```

默认监听 `127.0.0.1:3322`，提供：

- `workspace.init`：初始化 `workspace/sessions` 与 `workspace/shared/{fonts,templates}`
- `generate.createSession`：在 `sessions/{sessionId}` 下创建 `docs/history/pages/exports/assets/templates/fonts` 与 `session.json`
- `workspace.open / workspace.import / workspace.export`
- `generate.start / generate.cancel / generate.retryPage`
- `deck.get / deck.patch.apply / deck.node.inspect / deck.persist`
- `font.import / font.list`
- `asset.import / asset.resolve`
- `export.start / export.status / export.cancel`
- `pptx.import`

事件流（SSE）：`GET http://127.0.0.1:3322/events`

JSON-RPC 示例：

```bash
curl -s http://127.0.0.1:3322/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"req-1","method":"workspace.init","params":{"workspacePath":"/tmp/weavelight-workspace"}}'
```

SSE 示例：

```bash
curl -N http://127.0.0.1:3322/events
```

## Web 编辑器

Engine 自带一个轻量 Web 编辑器，用于手动编辑 page fragment、拖拽布局与触发生成/导出。

1) 启动 Engine：

```bash
cd engine
npm run start
```

2) 打开浏览器（`/app` 或 `/app/` 均可）：

```
http://127.0.0.1:3322/app
```

3) 在页面中依次点击：
   - **Init Workspace** → **Create Session** → **Generate** → **Load Pages**
   - 选择页面后可拖拽元素，修改文本与样式，然后 **Apply Changes**
   - **Export PNG / Export PDF** 生成导出文件

### 导出依赖

PNG/PDF 导出使用本机 Chromium 进行渲染。默认使用 `/usr/bin/chromium`，如路径不同可设置：

```bash
export WEAVELIGHT_CHROMIUM_PATH=/path/to/chromium
```
