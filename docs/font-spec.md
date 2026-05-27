# Font 规范（导入/归一化/嵌入）

关联文档：
- [workspace-format.md](./workspace-format.md)
- [pptx-ir.md](./pptx-ir.md)
- [export-pipeline.md](./export-pipeline.md)
- [security-sandbox.md](./security-sandbox.md)

## 1. 输入与支持格式
- 支持：`woff2`, `ttf`, `otf`
- 导入后统一归一化存储到 workspace `fonts/`。

## 2. 归一化存储
建议目录：
```text
fonts/
  files/
    {family}-{weight}-{style}.{ext}
  manifest.json
```

## 3. 字体角色
- `title`
- `body`
- `mono`（可选）

角色映射用于生成和导出一致性，避免同页多字体失控。

## 4. FontManifest 结构
```json
{
  "version":"1.0",
  "families":[
    {
      "name":"Inter",
      "files":[{"weight":400,"style":"normal","path":"files/inter-400-normal.ttf"}],
      "fallback":["Noto Sans","Arial"]
    }
  ],
  "roles":{"title":"Inter","body":"Noto Sans"}
}
```

## 5. 嵌入策略
- Web 预览：`@font-face` + 本地文件 URL。
- Native 导出：根据 FontManifest 打包嵌入（可配置体积上限）。
- 超过上限时按优先级裁剪并告警。

## 6. 兼容与降级
1. 字重缺失：映射到最近可用 weight。
2. 字体缺失：按 fallback 链。
3. 移动端远端导出：只上传 FontManifest 与必要字体子集。
