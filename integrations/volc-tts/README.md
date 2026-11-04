# 火山 TTS 2.0：状态图 Skill 的独立适配层

本目录放在 `skills/sweety-statechart-video/` **之外**。作者的 Skill、安装脚本、默认音色和 `scv.py all` 均不改动。`run.sh` 只为选择火山旁白的任务使用；其他任务照常按作者的说明运行。

## 云端准备

1. 为 `junhe6950-droid/sweety-statechart-video` 建立**单独的 Codex 云环境**，选择包含此目录的专用分支。不要把它加进现有手绘视频环境。
2. 用作者的 `bash skills/sweety-statechart-video/scripts/setup.sh` 配好渲染环境。该脚本使用独立的 `~/.local/share/sweety-statechart-video/venv`。
3. 在**此新环境**的个人密钥中绑定 `VOLC_TTS_API_KEY`，允许密钥访问 `openspeech.bytedance.com`。仅在云环境密钥设置中输入密钥，不要写入仓库、任务文件或聊天。
4. `film.json` 设为 `"voice": "volc-seed-tts-2"`，每步 `note` 写要读的台词。先不要使用 `say` 改读法；当前适配器会拒绝这类任务，以免字幕和实际声音不一致。音色 ID 可通过 `VOLC_TTS_SPEAKER` 环境变量指定，默认使用 `zh_male_cixingjieshuonan_uranus_bigtts`；请先确认火山账户有该音色权限。

## 制作

先按作者 Skill 写好任务目录中的 `film.json`、`scenes.js`。然后在云机中：

```bash
export SCV_SKILL=/workspace/sweety-statechart-video/skills/sweety-statechart-video
bash /workspace/sweety-statechart-video/integrations/volc-tts/run.sh /workspace/video-jobs/my-film
```

命令按作者的 `check → layout → lint → lines` 执行。检查通过后，适配器按每步台词调用一次火山 HTTP TTS，将音频转为 48 kHz 单声道 WAV，并把实际返回的时间戳写进任务目录的 `work/audio/voice.json`。已成功生成的句子按台词与音色缓存，重跑时不再请求同一内容。之后执行作者的 `plan → render → posters → finalize`。

**不要对这个任务调用 `scv.py all` 或 `scv.py voice`**：这两个入口会调用原有的 Apple Silicon MLX 配音。作者的原有命令仍可用于其他任务。

不发起计费请求的预检：

```bash
export STATECHART_USER_VOICES=/workspace/sweety-statechart-video/integrations/volc-tts/catalog.json
python3 "$SCV_SKILL/scripts/scv.py" lines /workspace/video-jobs/my-film
python3 /workspace/sweety-statechart-video/integrations/volc-tts/bridge.py /workspace/video-jobs/my-film
```

## 验证与限制

- 火山官方 [HTTP 接口文档](https://docs.volcengine.com/docs/doubao-voice/unidirectional-streaming-text-to-speech-http?lang=zh)说明 `enable_subtitle` 可返回字级时间戳。适配器要求时间戳与台词文字对应；缺失或不符即停止，不用估算时间冒充准确同步。若接口把多个字合成一个词，适配器在该词区间内均分这些字的时间；正式成片仍需试听核对。
- 当前只有离线解析和预检测试；**尚未调用用户的真实火山账户，也未验证云端整片**。首次用一句短台词测试，再做正式片。
- 作者 `finalize` 当前会把有旁白的成片注释写成 VoxCPM2。火山任务应在发布前核对并更正成片来源元数据；本适配层不修改作者的 `finalize` 代码。
- 独立脚本只在任务目录写缓存、音频和生成报告。作者仓库内原有文件无需修改。

