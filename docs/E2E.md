# 端到端验证（E2E）手册

真实服务器上的验证步骤，供 CI 之外的人工/脚本验证使用。

## 0. 准备：本地 OpenViking 服务器（dev 模式，无需密钥）

```bash
uv tool install "openviking[local-embed]"     # 含本地 GGUF embedding
export UV_TOOL_BIN_DIR=...   # 按需

# 配置文件 ov.conf（dev 模式仅允许 loopback）
cat > ~/.openviking/ov.conf <<'EOF'
{
  "server":  { "host": "127.0.0.1", "port": 1933, "auth_mode": "dev", "workers": 1 },
  "storage": { "workspace": "./data" },
  "embedding": { "dense": { "provider": "local",
                            "model": "bge-small-zh-v1.5-f16",
                            "cache_dir": "./models" } }
}
EOF
openviking-server            # 首次启动会自动下载 GGUF 模型到 cache_dir
curl http://127.0.0.1:1933/health   # {"status":"ok","healthy":true,...}
```

## 1. REST 链路自测（不依赖 DSH）

1. 建会话并写消息：
   `POST /api/v1/sessions {"session_id":"dsh-e2e-1"}`
   `POST /api/v1/sessions/dsh-e2e-1/messages {"role":"user","content":"我喜欢在早茶里加柠檬"}`（多写几条）
2. 提交并等待抽取：
   `POST /api/v1/sessions/dsh-e2e-1/commit {"keep_recent_count":0}` → 记下 `task_id`
   `GET /api/v1/tasks/{task_id}` → 轮询到 completed，看 `memories_extracted`
3. 召回：
   `POST /api/v1/search/search {"mode":"context","query":"喝茶习惯","session_id":"dsh-e2e-1","max_tokens":800}` → entries 含柠檬偏好

## 2. 插件链路（替换 desktop profile 的官方插件）

1. 备份：`profiles/desktop/package.json`、`cordis.yml`、`cordis.patch.yml`
2. `dsh plugin --profile desktop add <本仓库绝对路径>`
3. 编辑 profile `package.json`：bundles 里把 `@openviking/dsh-memory-plugin`
   替换为 `dsh-ov-memory`（dependencies 同步）
4. 重启 DSH（GUI/桌面），新开会话对话几句
5. 预期：会话出现在 `viking://user/<u>/sessions/dsh-<session-id>/`；
   OpenViking 记忆注入块出现在步骤上下文（带 `[OpenViking memory recall]` 前缀）；
   工具列表出现 `mcp__openviking__*`；关闭会话后发生提交与后台抽取。
6. 回滚：恢复备份文件并重启。

## 3. MCP 工具面冒烟

在 DSH 里要求模型："列出你能访问的 OpenViking 工具" —— 应出现
`mcp__openviking__search/find/read/...`。再问一个记忆问题验证召回注入。
