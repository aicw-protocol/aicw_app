# MCP setup by app (Track B)

**Too hard?** Use [Track A — aicw_skill.md](https://aicw-protocol.github.io/aicw_app/aicw_skill.md) instead. No MCP install.

## Everyone — do this first

1. [Issue wallet](https://aicw-protocol.github.io/aicw_app/) → **Copy**
2. [Download zip](https://aicw-protocol.github.io/aicw_app/aicw_mcp-release.zip) → run **`install-aicw-mcp.bat`** → paste Copy

Installer saves these in **`%USERPROFILE%\.aicw\`** (e.g. `C:\Users\you\.aicw\`):

| File | Use |
|------|-----|
| `aicw_mcp.env` | Wallet credentials (auto-loaded) |
| `mcp-aicw-full.json` | Cursor, Claude, Windsurf — paste into app MCP settings |
| `mcp-aicw-server.json` | OpenClaw only — one PowerShell command below |

---

## Cursor

1. Installer: press **Enter** at mcp.json (default path).
2. **Ctrl+Shift+J** → MCP → **aicw** ON.

## Claude Desktop

1. When installer asks **`Path to MCP client mcp.json`** → type **`skip`** (you are not using Cursor).
2. Open **`%APPDATA%\Claude\claude_desktop_config.json`** → copy **`aicw`** from **`mcp-aicw-full.json`** into **`mcpServers`** → restart Claude.

## OpenClaw

1. When installer asks **`Path to MCP client mcp.json`** → type **`skip`** (you are not using Cursor).
2. Open **PowerShell** and run (copy-paste this whole line):

```powershell
openclaw mcp set aicw (Get-Content "$env:USERPROFILE\.aicw\mcp-aicw-server.json" -Raw)
```

3. Restart OpenClaw.

**Where is the file?** `C:\Users\YOUR_NAME\.aicw\mcp-aicw-server.json` — created by `install-aicw-mcp.bat`. You do **not** open or paste the file by hand; the command reads it for you.

## Windsurf

1. When installer asks **`Path to MCP client mcp.json`** → type **`skip`** (not Cursor).
2. Settings → **MCP** → add server from **`mcp-aicw-full.json`** (or merge into **`~/.codeium/windsurf/mcp_config.json`**) → reload.

## VS Code (Cline)

1. When installer asks **`Path to MCP client mcp.json`** → type **`skip`** (not Cursor).
2. Cline → **MCP Servers** → paste **`aicw`** block from **`mcp-aicw-full.json`**.

## Anything else

1. When installer asks **`Path to MCP client mcp.json`** → type **`skip`** (not Cursor).
2. Tell your AI: *"Register the MCP server in **`~/.aicw/mcp-aicw-full.json`** for [app name]."*

---

## Check

Ask agent: **`aicw_bridge_health`** → should return **`ok: true`**.
