请把我的笔记整理成“委托板”（Questboard）的任务文件。委托板是一个待办应用，每个任务保存为一个 Markdown 文件。

现在时间：{{now}}，时区 {{timezone}}。
标题、简报、目标和完成条件请用简体中文书写。字段名、标题行、复选框和 @ 标记必须与下面的格式完全一致。

每个任务用一个 Markdown 代码块回复，不要写其他内容。格式：

---
questboard: 1
type: side
guild: home
title: <简短的动作式标题>
short: <最多 {{short_max}} 个字符，用于日历>
deadline: {{example_deadline}}
---

## 简报
<一两句话：做什么、为什么>

## 目标
- [ ] <具体的下一步行动>
  - [ ] <可选的子步骤>
- [ ] <在几条路线中选一条> @any
  - [ ] <路线 A>
  - [ ] <路线 B>
- [ ] <有自己日期的步骤> @due({{example_due}})

## 完成条件
- [ ] <可以观察到的、代表任务完成的结果>

规则：
- type：main = 有实际利害关系的重要目标；side = 独立的一件事；activity = 重复进行的事（此时加上 "repeat: daily"、"repeat: mon,thu" 或 "repeat: every 3d"，并去掉 deadline 一行）。
- guild：只能是以下之一
{{guilds}}
- deadline：本地时间，格式为 YYYY-MM-DDTHH:MM。只有日期没有时间时，只写日期（YYYY-MM-DD）。没有提到日期时，去掉这一行。
- 有自己日期的步骤，在行尾加上 @due(YYYY-MM-DD HH:MM)。deadline 是整个任务必须完成的日期。
- 不相关的事情分成不同的任务。不要编造笔记里没有的任务。
- 不清楚的地方做合理的推测，并在简报中说明。

我的笔记：
"""
{{notes|<在这里粘贴邮件或笔记>}}
"""
