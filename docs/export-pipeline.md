# Export Pipeline（PDF/PNG/PPTX）

关联文档：
- [architecture.md](./architecture.md)
- [engine-api.md](./engine-api.md)
- [deck-dom-contract.md](./deck-dom-contract.md)
- [pptx-ir.md](./pptx-ir.md)
- [canvas-spec.md](./canvas-spec.md)
- [font-spec.md](./font-spec.md)

## 1. 导出类型
- PDF
- PNG（逐页）
- PPTX image-only
- PPTX editable（核心）

## 2. 管线阶段
1. **Prepare**：加载 session、CanvasSpec、FontManifest。
2. **Freeze**：冻结动画/过渡，固定时间点渲染。
3. **Render/Extract**：
   - PDF/PNG：headless 渲染截图/打印。
   - PPTX editable：DOM 观测 -> PPTX IR。
4. **Write**：输出目标格式。
5. **Verify**：基本一致性检查 + warnings 汇总。

## 3. Headless 渲染策略
- 使用统一 Runtime 入口，确保预览与导出同源。
- 关闭实时动画，保留最终静态视觉结果。
- 按 CanvasSpec 设置 viewport 与倍率。

## 4. 稳定性策略
- 固定时间、固定随机种子、固定字体解析顺序。
- 导出前等待字体 ready，避免字体抖动。
- 资源加载超时后降级占位并产出 warning。

## 5. warnings 语义
- `WARN_FONT_FALLBACK`
- `WARN_COMPLEX_EFFECT_RASTERIZED`
- `WARN_UNSUPPORTED_NODE_OVERLAY`
- `WARN_ASSET_MISSING`

warning 必须包含：`code`, `slideId`, `nodeId?`, `message`, `suggestion`。
