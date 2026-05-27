# CanvasSpec 规范

关联文档：
- [architecture.md](./architecture.md)
- [deck-dom-contract.md](./deck-dom-contract.md)
- [pptx-ir.md](./pptx-ir.md)
- [export-pipeline.md](./export-pipeline.md)

## 1. 默认规格
- 默认比例：16:9
- 默认基准：1920x1080 px
- 允许自定义：`widthPx`, `heightPx`, `ratio`, `safeArea?`

## 2. 数据结构
```json
{
  "widthPx": 1920,
  "heightPx": 1080,
  "ratio": "16:9",
  "baseDpi": 96,
  "renderScale": 1
}
```

## 3. CSS 变量
Runtime 根节点注入：
- `--canvas-width-px`
- `--canvas-height-px`
- `--canvas-ratio`
- `--canvas-scale`

## 4. 单位换算
- `pt = px * 72 / 96`
- `in = px / 96`
- PPTX writer 进一步转 EMU。

## 5. 渲染倍率策略
- 编辑态：`renderScale=1` 优先交互性能。
- 预览态：可 `1~2`。
- 导出态：按格式提升倍率（PNG 可更高，PPTX editable 不依赖位图倍率）。
