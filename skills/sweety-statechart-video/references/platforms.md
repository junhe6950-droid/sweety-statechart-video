# 平台

Skill 是一个带 `SKILL.md` 的文件夹，各平台都按这个格式识别。画面全部由本机代码画出，不需要生图接口，所以各平台的出片效果一致。差别只在命令能跑多久、沙箱放不放行浏览器。

## 安装

```bash
npx skills add threerocks/sweety-statechart-video --skill sweety-statechart-video --agent claude-code codex --global --copy --yes
```

也可以手动把 `skills/sweety-statechart-video` 复制（或软链接）到平台的技能目录：

| 平台 | 技能目录 |
|---|---|
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.codex/skills/` |
| Grok Build | `~/.grok/skills/`，也会读 `~/.claude/skills/` |

装好后先跑一次 `bash scripts/setup.sh`。

## 各平台要注意的

- **通用**：
  - 命令一律用绝对路径调用 `scripts/scv.py`，任务目录放在用户自己的工作目录里；
  - `voice`（几十句旁白要几分钟）和 `render`（约为片长的一半）比较慢。平台限制单条命令时长时，分步跑或者放后台跑；
  - 每一步都可以单独重跑，配音结果有缓存，不会白做。
- **Claude Code**：放进 `~/.claude/skills/` 即可。渲染会启动本机 Chrome，第一次运行时按提示允许。
- **Codex**：放进 `~/.codex/skills/`，`agents/openai.yaml` 提供显示名和默认提示。渲染要启动浏览器，沙箱拦截时按提示放行这条命令。
- **Grok Build**：`~/.grok/skills/` 或 `~/.claude/skills/` 都能识别。无人值守地跑（`grok -p`）时，要给 Shell 命令放行。
- **Grok Bot、Muse**：按各自平台导入 Skill 文件夹。
- **WorkBuddy**：计划支持。

各平台读 SKILL.md 的方式略有不同：拆章、插画摆放这类由模型完成的部分，产出效果可能略有差异。排版、动画、配音和渲染由脚本完成，各平台一致。
