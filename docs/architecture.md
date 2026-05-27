# 总体架构（Architecture）

关联文档：
- [engine-api.md](./engine-api.md)
- [workspace-format.md](./workspace-format.md)
- [deck-dom-contract.md](./deck-dom-contract.md)
- [pptx-ir.md](./pptx-ir.md)
- [export-pipeline.md](./export-pipeline.md)
- [canvas-spec.md](./canvas-spec.md)
- [font-spec.md](./font-spec.md)
- [security-sandbox.md](./security-sandbox.md)

## 1. 架构目标
1. 跨平台一致体验：Flutter 壳覆盖 macOS/Windows/Linux/iOS/Android。
2. 编辑能力基于 WebView + HTML Runtime，兼容“所见即所得”与 DOM 可观测性。
3. Engine 可替换：Phase 1 Node/TS，Phase 2 Rust，保持 **Engine RPC** 契约稳定。
4. Local-first：桌面优先本地工作区；移动端允许远端 Engine 执行重任务（生成/导出）。
5. Editable PPTX Day-1 架构就绪：通过 **Deck DOM Contract + PPTX IR + FontManifest** 预留完整链路。

## 2. 分层与模块边界
### 2.1 Client（Flutter）
- App Shell：导航、项目管理、状态同步。
- Editor Host：WebView 容器，承载 HTML Runtime。
- RPC Client：调用 Engine RPC，接收 SSE/WS 事件流。

### 2.2 Runtime（WebView 内）
- Deck Runtime：按 [deck-dom-contract.md](./deck-dom-contract.md) 渲染 page fragment。
- Editing Bridge：选择元素、读取属性、应用 patch、回传可观测信息（bbox/style）。
- Snapshot Extractor：导出前采集 DOM 观测数据，供 [pptx-ir.md](./pptx-ir.md) 映射。

### 2.3 Engine（Phase 1 Node/TS，Phase 2 Rust）
- Session Service：会话、历史、模板、资产、字体管理。
- Generation Service：流式生成（outline/page block）。
- Export Service：PDF/PNG/PPTX image-only/editable。
- Import Service：session zip/slide-pack/PPTX 导入。
- Security Guard：路径校验、allowed roots、远端上传策略。

### 2.4 Storage（Local-first）
- 工作区目录规范见 [workspace-format.md](./workspace-format.md)。
- 统一元数据与内容版本策略，支持断点恢复与历史重放。

## 3. 端到端数据流
## 3.1 生成（Generation）
1. Flutter 发起 `generate.createSession` / `generate.start`（见 [engine-api.md](./engine-api.md)）。
2. Engine 产出流式事件（outline/page/progress/warning）。
3. Runtime 按 page fragment 协议增量渲染。
4. 内容落地到 workspace 的 `sessions/*/docs + history`。

## 3.2 编辑（Editing）
1. 用户在 Runtime 选择节点（`data-node-id`）。
2. Runtime 输出属性快照 + bbox。
3. Flutter 调用 `deck.patch.apply` 将 patch 送入 Engine。
4. Engine 校验 patch 并持久化，回推更新事件。

## 3.3 预览（Preview）
1. Engine 返回渲染所需 page fragment 与 CanvasSpec。
2. Runtime 使用统一 CSS 变量渲染。
3. Flutter 仅负责容器与交互层。

## 3.4 导出（Export）
1. Flutter 请求 `export.start`（目标 PDF/PNG/PPTX）。
2. Engine 冻结动画并采样稳定帧（见 [export-pipeline.md](./export-pipeline.md)）。
3. PPTX editable 走 DOM -> PPTX IR -> writer；字体由 FontManifest 决定。
4. 导出事件流回传进度与 warnings。

## 3.5 导入（Import）
- `workspace.import`：session zip / slide-pack。
- `pptx.import`：提取为 page fragment + 资产映射 + FontManifest 补全。

## 4. 事件流（Streaming）
- 传输：SSE 优先，WS 备选（见 [engine-api.md](./engine-api.md)）。
- 事件类别：`progress` / `delta` / `warning` / `result` / `error`。
- 幂等键：`requestId + seq`。

## 5. 跨平台策略
- Desktop：本地 sidecar（Node/TS）默认。
- Mobile：默认远端 Engine，可配置“仅上传必要数据”（见 [security-sandbox.md](./security-sandbox.md)）。
- Rust 替换路线：维持同一 Engine RPC、workspace-format、PPTX IR，不改 Flutter 侧接口。

## 6. 架构风格（模块化但不教条）
- 以“服务对象 + 明确 DTO”组织，偏 OOP，可维护。
- 避免过度微服务化，保持单仓可演进。
- 将复杂性集中在契约层（Engine RPC / Deck DOM Contract / PPTX IR）。
