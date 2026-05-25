# MCP setup by app (Track B)

**Too hard?** Use [Track A — aicw_skill.md](https://aicw-protocol.github.io/aicw_app/aicw_skill.md) instead. No MCP install.

## Everyone — do this first

1. [Issue wallet](https://aicw-protocol.github.io/aicw_app/) → **Copy**
2. [Download zip](https://aicw-protocol.github.io/aicw_app/aicw_mcp-release.zip) → run **`install-aicw-mcp.bat`** → paste Copy

Installer saves **`%USERPROFILE%\.aicw\mcp-aicw-full.json`**. You only connect your app to that file.

---

## Cursor

1. Installer: press **Enter** at mcp.json (default path).
2. **Ctrl+Shift+J** → MCP → **aicw** ON.

## Claude Desktop

1. Installer: type **`skip`** at mcp.json.
2. Open **`%APPDATA%\Claude\claude_desktop_config.json`** → copy **`aicw`** from **`mcp-aicw-full.json`** into **`mcpServers`** → restart Claude.

## OpenClaw

1. Installer: type **`skip`**.
2. Terminal: **`openclaw mcp set aicw`** + paste **`mcp-aicw-server.json`** → restart Gateway.

## Windsurf

1. Installer: type **`skip`**.
2. Settings → **MCP** → add server from **`mcp-aicw-full.json`** (or merge into **`~/.codeium/windsurf/mcp_config.json`**) → reload.

## VS Code (Cline)

1. Installer: type **`skip`**.
2. Cline → **MCP Servers** → paste **`aicw`** block from **`mcp-aicw-full.json`**.

## Anything else

1. Installer: type **`skip`**.
2. Tell your AI: *"Register the MCP server in **`~/.aicw/mcp-aicw-full.json`** for [app name]."*

---

## Check

Ask agent: **`aicw_bridge_health`** → should return **`ok: true`**.
