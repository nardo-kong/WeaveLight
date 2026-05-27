# WeaveLight 技术方案书

本目录用于规划“重构复刻 oh-my-ppt”的跨平台实现，目标是 **Flutter 壳 + HTML Runtime 编辑 + 可演进 Engine**，并从第一天起保证 **Editable PPTX 导出** 的架构可行性。

## 术语约定
- **CanvasSpec**：画布尺寸与换算规范，见 [canvas-spec.md](./canvas-spec.md)
- **Deck DOM Contract**：HTML Runtime 中可观测 DOM 协议，见 [deck-dom-contract.md](./deck-dom-contract.md)
- **Engine RPC**：Flutter 与 Engine 通信契约，见 [engine-api.md](./engine-api.md)
- **PPTX IR**：可编辑导出的中间表示，见 [pptx-ir.md](./pptx-ir.md)
- **FontManifest**：字体清单与嵌入策略，见 [font-spec.md](./font-spec.md)

## 推荐阅读顺序
1. [architecture.md](./architecture.md)（总体架构与数据流）
2. [engine-api.md](./engine-api.md)（Flutter ↔ Engine 契约）
3. [workspace-format.md](./workspace-format.md)（Local-first 工作区规范）
4. [deck-dom-contract.md](./deck-dom-contract.md)（HTML 编辑运行时契约）
5. [canvas-spec.md](./canvas-spec.md)（尺寸、换算、渲染倍率）
6. [font-spec.md](./font-spec.md)（字体导入/归一化/嵌入）
7. [pptx-ir.md](./pptx-ir.md)（Editable PPTX 核心 IR）
8. [export-pipeline.md](./export-pipeline.md)（导出管线与稳定性）
9. [security-sandbox.md](./security-sandbox.md)（安全与沙箱策略）

## 目标摘要
- UI 壳：Flutter（desktop + mobile）
- 编辑策略：WebView 内 HTML runtime 编辑（策略 1）
- Engine Phase 1：Node/TypeScript sidecar（desktop 本地）
- Engine Phase 2：Rust engine 替换路径预留
- 移动端导出：允许远端 engine
- PPTX editable：架构从 Day 1 预留，不阻碍后续实现
