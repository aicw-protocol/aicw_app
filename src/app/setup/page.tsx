"use client";

import Link from "next/link";
import { useState } from "react";
import { appBasePath } from "../../lib/appBasePath";
import {
  AICW_MCP_DOWNLOAD_URL,
  AICW_SKILL_MD_URL,
} from "../../lib/publicUrls";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="guide-step">
      <span className="guide-step-num">{n}</span>
      <span className="guide-step-body">{children}</span>
    </li>
  );
}

export default function AgentSetupPage() {
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const issueHref = `${appBasePath()}/`;

  return (
    <div className="app-shell guide-shell">
      <SiteHeader isNavMenuOpen={isNavMenuOpen} onMenuToggle={setIsNavMenuOpen} />

      <section className="hero guide-hero">
        <p className="guide-eyebrow">For humans · connect your AI agent</p>
        <h1>Agent Setup</h1>
        <p>
          Issue a wallet on AICW, then choose <strong>one</strong> path below. Track A uses the
          skill document; Track B installs the MCP server.
        </p>
      </section>

      <div className="guide-notice">
        <i className="fa-solid fa-shield-halved guide-notice-icon" aria-hidden="true" />
        <div>
          <strong>MPC_WALLET_ID = private key.</strong> Never share it or paste it in public chat.
          Fund <code className="guide-code">AI_AGENT_PUBKEY</code> with devnet SOL for transaction
          fees.
        </div>
      </div>

      <div className="guide-tracks">
        <article className="guide-track-card">
          <div className="guide-track-head">
            <span className="guide-track-badge guide-track-badge--a">Track A</span>
            <h2>Skill document</h2>
            <p className="guide-track-desc">Agent reads the doc and calls the chain (Python + MPC bridge).</p>
          </div>
          <ol className="guide-steps">
            <Step n={1}>
              <Link href={issueHref}>Issue a wallet</Link> and copy AI public key + MPC wallet ID.
            </Step>
            <Step n={2}>Give your agent those values plus bridge URL and network env vars.</Step>
            <Step n={3}>
              Agent reads{" "}
              <a href={AICW_SKILL_MD_URL} target="_blank" rel="noopener noreferrer">
                aicw_skill.md
              </a>{" "}
              and follows it.
            </Step>
            <Step n={4}>
              Agent runs <code className="guide-code">create_will</code> → scheduled{" "}
              <code className="guide-code">heartbeat</code>.
            </Step>
          </ol>
          <div className="guide-track-actions">
            <a href={AICW_SKILL_MD_URL} className="btn primary" target="_blank" rel="noopener noreferrer">
              Open aicw_skill.md
            </a>
            <Link href={issueHref} className="btn">
              Issue wallet
            </Link>
          </div>
        </article>

        <article className="guide-track-card guide-track-card--b">
          <div className="guide-track-head">
            <span className="guide-track-badge guide-track-badge--b">Track B</span>
            <h2>MCP server</h2>
            <p className="guide-track-desc">Agent uses MCP tools — no hand-written Python.</p>
          </div>
          <ol className="guide-steps">
            <Step n={1}>
              <Link href={issueHref}>Issue a wallet</Link> → copy the env block.
            </Step>
            <Step n={2}>
              Download{" "}
              <a href={AICW_MCP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                aicw_mcp-release.zip
              </a>{" "}
              and unzip.
            </Step>
            <Step n={3}>
              Run <code className="guide-code">install-aicw-mcp.bat</code> → paste Copy → Enter.
            </Step>
            <Step n={4}>Restart MCP in your agent runtime → run <code className="guide-code">aicw_bridge_health</code>.</Step>
            <Step n={5}>
              Agent runs <code className="guide-code">aicw_create_will</code> → scheduled{" "}
              <code className="guide-code">aicw_heartbeat</code>.
            </Step>
          </ol>
          <div className="guide-track-actions">
            <a href={AICW_MCP_DOWNLOAD_URL} className="btn primary" target="_blank" rel="noopener noreferrer">
              Download zip
            </a>
            <Link href={issueHref} className="btn">
              Issue wallet
            </Link>
          </div>
        </article>
      </div>

      <section className="section guide-section">
        <h2>MCP by app (Track B)</h2>
        <p className="guide-track-desc guide-section-lead">
          Install once, then one short step per app.{" "}
          <strong>Too hard?</strong> Use Track A — no MCP.
        </p>

        <div className="guide-common-box">
          <strong>Everyone first</strong>
          <ol className="guide-common-steps">
            <li>
              <Link href={issueHref}>Issue wallet</Link> → Copy
            </li>
            <li>
              <a href={AICW_MCP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                Download zip
              </a>{" "}
              → <code className="guide-code">install-aicw-mcp.bat</code> → paste Copy
            </li>
          </ol>
          <p className="muted guide-footnote guide-common-foot">
            Creates <code className="guide-code">%USERPROFILE%\.aicw\mcp-aicw-full.json</code>
          </p>
        </div>

        <div className="guide-app-grid">
          <article className="guide-app-card">
            <h3>Cursor</h3>
            <ol>
              <li>Installer: press Enter at mcp.json.</li>
              <li>
                <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> → MCP → <strong>aicw</strong> ON.
              </li>
            </ol>
          </article>
          <article className="guide-app-card">
            <h3>Claude Desktop</h3>
            <ol>
              <li>Installer: type <code className="guide-code">skip</code>.</li>
              <li>
                Merge <code className="guide-code">aicw</code> from{" "}
                <code className="guide-code">mcp-aicw-full.json</code> into{" "}
                <code className="guide-code">claude_desktop_config.json</code> → restart.
              </li>
            </ol>
          </article>
          <article className="guide-app-card">
            <h3>OpenClaw</h3>
            <ol>
              <li>Installer: type <code className="guide-code">skip</code>.</li>
              <li>
                <code className="guide-code">openclaw mcp set aicw</code> + paste{" "}
                <code className="guide-code">mcp-aicw-server.json</code> → restart.
              </li>
            </ol>
          </article>
          <article className="guide-app-card">
            <h3>Windsurf</h3>
            <ol>
              <li>Installer: type <code className="guide-code">skip</code>.</li>
              <li>Settings → MCP → add from <code className="guide-code">mcp-aicw-full.json</code>.</li>
            </ol>
          </article>
          <article className="guide-app-card">
            <h3>VS Code (Cline)</h3>
            <ol>
              <li>Installer: type <code className="guide-code">skip</code>.</li>
              <li>Cline → MCP Servers → paste <code className="guide-code">aicw</code> block.</li>
            </ol>
          </article>
          <article className="guide-app-card">
            <h3>Other</h3>
            <ol>
              <li>Installer: type <code className="guide-code">skip</code>.</li>
              <li>
                Tell your AI: register MCP from{" "}
                <code className="guide-code">~/.aicw/mcp-aicw-full.json</code>.
              </li>
            </ol>
          </article>
        </div>

        <p className="muted guide-footnote">
          Check: agent runs <code className="guide-code">aicw_bridge_health</code> →{" "}
          <code className="guide-code">ok: true</code>. New wallet? Re-run installer, reload MCP.
        </p>
      </section>

      <section className="section guide-section">
        <h2>After either track</h2>
        <div className="guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Track A</th>
                <th>Track B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Activate will</td>
                <td>per aicw_skill.md</td>
                <td>
                  <code className="guide-code">aicw_create_will</code>
                </td>
              </tr>
              <tr>
                <td>Stay alive</td>
                <td>heartbeat before timeout</td>
                <td>
                  <code className="guide-code">aicw_heartbeat</code> (autonomous)
                </td>
              </tr>
              <tr>
                <td>Verify</td>
                <td>bridge <code className="guide-code">/health</code></td>
                <td>
                  <code className="guide-code">aicw_bridge_health</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted guide-footnote">
          Minimum on-chain death timeout: <strong>600 seconds (10 min)</strong>.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
