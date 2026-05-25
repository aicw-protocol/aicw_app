const githubUrl =
  process.env.NEXT_PUBLIC_AICW_GITHUB_URL?.trim() || "https://github.com/aicw-protocol/aicw";
const twitterUrl =
  process.env.NEXT_PUBLIC_AICW_TWITTER_URL?.trim() || "https://x.com/AICW_Protocol";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-social">
          <a
            className="footer-icon-link"
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
          >
            <i className="fa-brands fa-github" />
          </a>
          <a
            className="footer-icon-link"
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
            title="Twitter"
          >
            <i className="fa-brands fa-twitter" />
          </a>
        </div>
      </div>
    </footer>
  );
}
