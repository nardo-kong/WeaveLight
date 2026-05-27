# PPTX IR（Editable 导出核心）

关联文档：
- [deck-dom-contract.md](./deck-dom-contract.md)
- [font-spec.md](./font-spec.md)
- [canvas-spec.md](./canvas-spec.md)
- [export-pipeline.md](./export-pipeline.md)

## 1. 设计目标
- 将 HTML Runtime 观测数据转换为稳定、可编辑的 PPTX 中间表示（IR）。
- Writer（Node/Rust）只依赖 IR，不直接依赖 DOM。

## 2. 核心结构
## 2.1 SlideIR
```ts
interface SlideIR {
  slideId: string;
  canvas: { widthPx: number; heightPx: number; ratio: string };
  background?: ShapeIR;
  nodes: NodeIR[];
  overlayImages?: ImageIR[];
}
```

## 2.2 NodeIR
- `TextIR`（段落、TextRun、行高、对齐、list level）
- `ShapeIR`（rect/ellipse/path、fill/stroke/radius）
- `ImageIR`（srcRef、crop、fitMode）
- `TableIR`（rows/cols/cells、cell style）
- `GroupIR`（children、group transform）

## 2.3 TextRun
字段建议：`text`, `fontFamily`, `fontWeight`, `fontStyle`, `fontSizePt`, `color`, `letterSpacing`, `baseline`。

## 3. z-order 与层级
- 节点含 `z` 整数，数值越大越靠上。
- Group 内部维持局部 z，再映射到全局。

## 4. 单位换算
- 输入基准：px（来自 Deck DOM Contract）。
- 输出基准：pt/EMU。
- 默认 96 DPI：`pt = px * 72 / 96`。
- 画布换算以 [canvas-spec.md](./canvas-spec.md) 为准。

## 5. OverlayImages
- 用于无法可靠映射为原生形状/文本的视觉补偿层。
- 必须记录来源节点与 warning，便于后续改进。

## 6. FontManifest 绑定
- 每个 TextRun 只引用逻辑字体名，不直接绑定文件路径。
- 实际字体文件由 FontManifest 解析（见 [font-spec.md](./font-spec.md)）。

## 7. 降级策略
1. 字体缺失：按 FontManifest fallback 链替代。
2. 复杂 CSS 效果：降级为近似样式并记 warning。
3. 无法编辑映射：进入 overlayImages，保证视觉保真优先。
