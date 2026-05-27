# Deck DOM Contract（HTML Runtime）

关联文档：
- [architecture.md](./architecture.md)
- [engine-api.md](./engine-api.md)
- [canvas-spec.md](./canvas-spec.md)
- [pptx-ir.md](./pptx-ir.md)

## 1. 目标
定义 Runtime DOM 的可编辑与可导出协议，保证：
1. 编辑操作可定位、可持久化。
2. 导出时可稳定提取 bbox / computed styles。
3. 能映射到 [pptx-ir.md](./pptx-ir.md)。

## 2. DOM 标记约定
每个可编辑节点必须包含：
- `data-node-id`：全局唯一
- `data-node-type`：`text|shape|image|table|group|overlay`
- `data-page-id`：所属页面
- `data-locked`：可选，锁定状态

页面根节点建议：
- `data-deck-root="true"`
- `data-canvas-spec="1920x1080"`

## 3. Page Fragment 协议
- 一个页面对应一个 HTML fragment。
- fragment 必须无 `<html>/<body>` 外壳。
- 仅允许白名单标签与属性（防止不可预期渲染差异）。

## 4. Patch 协议
patch 数组，支持操作：
- `setText`
- `setAttr`
- `setStyle`
- `insertNode`
- `removeNode`
- `reorderZ`

示例：
```json
[{"op":"setText","nodeId":"n1","value":"New Title"}]
```

## 5. 选择 / 属性读取 / 持久化
- 选择：通过 `data-node-id`，不得依赖脆弱 CSS selector。
- 属性读取：返回 `inline style + computed style + dataset`。
- 持久化：patch 写入 workspace history，再更新 page fragment。

## 6. 导出可观测信息
每个节点导出前需可读取：
- `bbox`：`x,y,width,height`（px）
- `computed styles`：字体、颜色、行高、对齐、边框、阴影
- `transform`：旋转、缩放、位移
- `z-order`

以上信息是 PPTX editable 生成的最低依赖输入，见 [pptx-ir.md](./pptx-ir.md)。
