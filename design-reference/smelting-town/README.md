# Smelting Town Design Reference

This directory stores the imported reference package from:

`/Users/jiayancheng/Downloads/参考图片生成代码.zip`

Use this as the primary visual and interaction baseline for future development of the multi-agent factory homepage.

## Files

- `source.zip`: original uploaded package.
- `smelting-town.dc.html`: main reference HTML. Original filename inside the archive was `熔炼镇.dc.html`.
- `canvas.dc.html`: secondary empty canvas shell from the package.
- `support.js`: runtime support required by the `.dc.html` files.
- `uploads/pasted-1782801273312-0.png`: reference screenshot image, 1586 x 992.
- `thumbnail.webp`: thumbnail extracted from `.thumbnail`.

## Development Direction

Future frontend work should treat `smelting-town.dc.html` and `uploads/pasted-1782801273312-0.png` as the source of truth for:

- Product framing: task work as a smelting-town pipeline.
- Primary entry: centered task composer remains the main action.
- Main flow: requirements furnace, planning workshop, code casting room, review tower, submit warehouse.
- Visual tone: clean white SaaS interface with restrained metal and ember accents.
- Information hierarchy: furnace/model status first, workflow map second, composer third, templates and queue below.

Do not reintroduce a dense default sidebar or large always-open control dashboard on the homepage.
