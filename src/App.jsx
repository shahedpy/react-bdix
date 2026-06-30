import { useEffect, useMemo, useState } from "react";
import { servers } from "./data/servers";
import { testServer } from "./utils/testServer";
import "./App.css";

const STATUS_META = {
  untested: {
    label: "Not tested",
    description: "Run a test to check reachability.",
    tone: "neutral"
  },
  testing: {
    label: "Testing",
    description: "Checking this server now.",
    tone: "busy"
  },
  online: {
    label: "Online",
    description: "The test request completed.",
    tone: "good"
  },
  offline: {
    label: "Offline",
    description: "The test request failed or timed out.",
    tone: "bad"
  },
  blocked: {
    label: "Blocked",
    description: "Open the app over HTTP to test this server.",
    tone: "warn"
  }
};

function getHttpModeUrl() {
  const httpUrl = new URL(window.location.href);
  httpUrl.protocol = "http:";
  return httpUrl.href;
}

function getHttpModeAttemptedKey() {
  return `bdix-http-mode-attempted:${window.location.host}`;
}

function getFaviconUrl(url) {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function App() {
  const [results, setResults] = useState({});
  const [lastChecked, setLastChecked] = useState({});
  const [httpModeUrl] = useState(() => (
    window.location.protocol === "https:" ? getHttpModeUrl() : ""
  ));
  const [showHttpModeNotice] = useState(() => (
    window.location.protocol === "https:" &&
    window.sessionStorage.getItem(getHttpModeAttemptedKey()) === "true"
  ));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem("bdix-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("bdix-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (window.location.protocol !== "https:" || showHttpModeNotice) {
      return;
    }

    const attemptedKey = getHttpModeAttemptedKey();

    if (!window.sessionStorage.getItem(attemptedKey)) {
      window.sessionStorage.setItem(attemptedKey, "true");
      window.location.replace(httpModeUrl);
    }
  }, [httpModeUrl, showHttpModeNotice]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(servers.map(server => server.category))).sort((left, right) => left.localeCompare(right))],
    []
  );

  const filteredServers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return servers
      .filter(server => {
        const matchesCategory = category === "All" || server.category === category;
        const status = results[server.id] || "untested";
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const searchableText = `${server.name} ${server.category} ${server.url}`.toLowerCase();
        return matchesCategory && matchesStatus && searchableText.includes(normalizedQuery);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [category, query, results, statusFilter]);

  const counts = servers.reduce(
    (summary, server) => {
      const status = results[server.id] || "untested";
      summary[status] += 1;
      return summary;
    },
    { untested: 0, testing: 0, online: 0, offline: 0, blocked: 0 }
  );

  const onlineServers = useMemo(
    () => servers.filter(server => results[server.id] === "online"),
    [results]
  );

  const isTesting = Object.values(results).includes("testing");

  async function handleTest(server) {
    setResults(prev => ({
      ...prev,
      [server.id]: "testing"
    }));

    const status = await testServer(server.testUrl);

    setResults(prev => ({
      ...prev,
      [server.id]: status
    }));

    setLastChecked(prev => ({
      ...prev,
      [server.id]: new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date())
    }));
  }

  async function testAll() {
    await Promise.all(filteredServers.map(server => handleTest(server)));
  }

  function openOnlineSites() {
    onlineServers.forEach(server => {
      window.open(server.url, "_blank", "noopener,noreferrer");
    });
  }

  function resetFilters() {
    setQuery("");
    setCategory("All");
    setStatusFilter("all");
  }

  return (
    <div className="app" data-theme={theme}>
      <header className="app-header">
        <div className="hero-copy">
          <h1>BDIX Server Tester</h1>
          <p className="intro">
            Check your favorite BDIX services, spot offline links quickly, and jump straight to
            the servers that are responding.
          </p>
        </div>

        <div className="header-actions">
          <div className="theme-switch" role="group" aria-label="Choose color theme">
            <button
              className={theme === "light" ? "theme-option active" : "theme-option"}
              onClick={() => setTheme("light")}
              type="button"
              aria-pressed={theme === "light"}
            >
              Light
            </button>
            <button
              className={theme === "dark" ? "theme-option active" : "theme-option"}
              onClick={() => setTheme("dark")}
              type="button"
              aria-pressed={theme === "dark"}
            >
              Dark
            </button>
          </div>
          <button
            className="primary-action"
            onClick={testAll}
            disabled={isTesting || filteredServers.length === 0}
          >
            {isTesting ? "Testing..." : `Test ${filteredServers.length} shown`}
          </button>
          <span className="tooltip-wrap" data-tooltip="Allow browser pop-ups to open all online sites in new tabs.">
            <button
              className="secondary-action"
              onClick={openOnlineSites}
              disabled={onlineServers.length === 0}
              type="button"
            >
              Open {onlineServers.length} online
            </button>
          </span>
        </div>
      </header>

      {showHttpModeNotice && (
        <section className="http-mode-notice" aria-label="HTTP testing mode">
          <div>
            <h2>HTTP testing mode needed</h2>
            <p>
              This page is open with HTTPS, so the browser blocks tests for HTTP and FTP BDIX
              servers before they reach your network. Open the HTTP version to get the same count
              as localhost.
            </p>
          </div>
          <a className="notice-action" href={httpModeUrl}>
            Open HTTP mode
          </a>
        </section>
      )}

      <section className="summary-panel" aria-label="Server status summary">
        <div className="panel-title">
          <h2>Overview</h2>
          <p>{filteredServers.length} shown</p>
        </div>
        <div className="summary">
          <button
            className={statusFilter === "all" ? "summary-item active" : "summary-item"}
            onClick={() => setStatusFilter("all")}
            type="button"
          >
            <span>{servers.length}</span>
            <p>Total</p>
          </button>
          <button
            className={statusFilter === "online" ? "summary-item online active" : "summary-item online"}
            onClick={() => setStatusFilter("online")}
            type="button"
          >
            <span>{counts.online}</span>
            <p>Online</p>
          </button>
          <button
            className={statusFilter === "offline" ? "summary-item offline active" : "summary-item offline"}
            onClick={() => setStatusFilter("offline")}
            type="button"
          >
            <span>{counts.offline}</span>
            <p>Offline</p>
          </button>
          <button
            className={statusFilter === "untested" ? "summary-item active" : "summary-item"}
            onClick={() => setStatusFilter("untested")}
            type="button"
          >
            <span>{counts.untested}</span>
            <p>Not tested</p>
          </button>
          {counts.blocked > 0 && (
            <button
              className={statusFilter === "blocked" ? "summary-item blocked active" : "summary-item blocked"}
              onClick={() => setStatusFilter("blocked")}
              type="button"
            >
              <span>{counts.blocked}</span>
              <p>Blocked</p>
            </button>
          )}
        </div>
      </section>

      <section className="toolbar" aria-label="Server filters">
        <label className="search-field">
          <span>Search servers</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Name, category, or URL"
          />
        </label>

        <div className="filter-scroller">
          <div className="filter-group" role="group" aria-label="Filter by category">
            {categories.map(item => (
              <button
                className={category === item ? "filter active" : "filter"}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="server-list">
        {filteredServers.length === 0 ? (
          <div className="empty-state">
            <h2>No servers found</h2>
            <p>Try a different search term or show all categories.</p>
            <button onClick={resetFilters} type="button">Clear filters</button>
          </div>
        ) : (
          filteredServers.map(server => {
            const status = results[server.id] || "untested";
            const meta = STATUS_META[status];
            const faviconUrl = status === "online" ? getFaviconUrl(server.url) : "";

            return (
              <article className="server-card" key={server.id}>
                <div className="server-main">
                  <div className="server-identity">
                    <span className="server-icon" aria-hidden="true">
                      {faviconUrl && (
                        <img
                          alt=""
                          src={faviconUrl}
                          onError={event => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      )}
                      {server.name.charAt(0)}
                    </span>
                    <div>
                      <p className="category">{server.category}</p>
                      <h2>{server.name}</h2>
                      <a className="server-url" href={server.url} target="_blank" rel="noreferrer">
                        {server.url}
                      </a>
                    </div>
                  </div>

                  <div className={`status ${meta.tone}`} aria-live="polite">
                    <span>{meta.label}</span>
                    <small>
                      {lastChecked[server.id]
                        ? `Checked ${lastChecked[server.id]}`
                        : meta.description}
                    </small>
                  </div>
                </div>

                <div className="server-actions">
                  <button
                    onClick={() => handleTest(server)}
                    disabled={status === "testing"}
                    type="button"
                  >
                    {status === "testing" ? "Testing..." : "Test now"}
                  </button>
                  <a className="visit-link" href={server.url} target="_blank" rel="noreferrer">
                    Visit
                  </a>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}

export default App;
