# WeaveLight

MVP（v0.1）当前提供 Node/TypeScript 本地 sidecar（桌面端优先），实现了最小可用工作区初始化与会话目录落地能力。

## Engine（Node/TS）

```bash
cd /tmp/workspace/nardo-kong/WeaveLight/engine
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
