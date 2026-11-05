import { useEffect, useMemo, useRef, useState } from "react";
import { servers } from "./data/servers";
import { testServer } from "./utils/testServer";
import "./App.css";

const STATUS_META = {
  untested: {
    label: "Not tested",
    tone: "neutral"
  },
  testing: {
    label: "Testing",
    tone: "busy"
  },
  online: {
    label: "Online",
    tone: "good"
  },
  offline: {
    label: "Offline",
    tone: "bad"
  },
  blocked: {
    label: "Blocked",
    tone: "warn"
  }
};

function TestingLabel() {
  return (
    <>
      Testing
      <span className="testing-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </>
  );
}

function getServerRating(server) {
  return Number.isInteger(server.rating) && server.rating >= 1 && server.rating <= 5
    ? server.rating
    : null;
}

function formatCheckDate(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
}

function getHttpModeUrl() {
  const httpUrl = new URL(window.location.href);
  httpUrl.protocol = "http:";
  return httpUrl.href;
}

function getHttpModeAttemptedKey() {
  return `bdix-http-mode-attempted:${window.location.host}`;
}

function App() {
  const [results, setResults] = useState({});
  const [httpModeUrl] = useState(() => (
    window.location.protocol === "https:" ? getHttpModeUrl() : ""
  ));
  const [showHttpModeNotice] = useState(() => (
    window.location.protocol === "https:" &&
    window.sessionStorage.getItem(getHttpModeAttemptedKey()) === "true"
  ));
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const [category, setCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [ispFilter, setIspFilter] = useState("all");
  const [announcement, setAnnouncement] = useState("");
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

  const isps = useMemo(
    () => Array.from(new Set(servers.flatMap(server => (
      Array.isArray(server.ispResults)
        ? server.ispResults.filter(ispName => typeof ispName === "string" && ispName.trim())
        : []
    )))).sort((left, right) => left.localeCompare(right)),
    []
  );

  const filteredServers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return servers
      .filter(server => {
        const matchesCategory = category === "All" || server.category === category;
        const status = results[server.id] || "untested";
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        const rating = getServerRating(server);
        const matchesRating = ratingFilter === "all" || (
          ratingFilter === "unrated"
            ? rating === null
            : rating === Number(ratingFilter)
        );
        const matchesIsp = ispFilter === "all" || (
          Array.isArray(server.ispResults) && server.ispResults.includes(ispFilter)
        );
        const searchableText = `${server.name} ${server.category} ${server.url}`.toLowerCase();
        return matchesCategory && matchesStatus && matchesRating && matchesIsp && searchableText.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftRating = getServerRating(left) || 0;
        const rightRating = getServerRating(right) || 0;

        return rightRating - leftRating || left.name.localeCompare(right.name);
      });
  }, [category, ispFilter, query, ratingFilter, results, statusFilter]);

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

  async function handleTest(server, announceResult = true) {
    if (announceResult) {
      setAnnouncement(`Testing ${server.name}.`);
    }

    setResults(prev => ({
      ...prev,
      [server.id]: "testing"
    }));

    const status = await testServer(server.testUrl);

    setResults(prev => ({
      ...prev,
      [server.id]: status
    }));

    if (announceResult) {
      setAnnouncement(`${server.name}: ${STATUS_META[status].label}.`);
    }

    return status;
  }

  async function testAll() {
    const serversToTest = [...filteredServers];
    setAnnouncement(`Testing ${serversToTest.length} servers.`);
    const outcomes = await Promise.all(
      serversToTest.map(server => handleTest(server, false))
    );
    const onlineCount = outcomes.filter(status => status === "online").length;
    const offlineCount = outcomes.filter(status => status === "offline").length;
    const blockedCount = outcomes.filter(status => status === "blocked").length;
    setAnnouncement(
      `Finished testing ${serversToTest.length} servers. ${onlineCount} online, ${offlineCount} offline, ${blockedCount} blocked.`
    );
  }

  function openServersInNewTabs(serverList) {
    serverList.forEach(server => {
      window.open(server.url, "_blank", "noopener,noreferrer");
    });
  }

  function openOnlineSites() {
    openServersInNewTabs(onlineServers);
  }

  function openAllSites() {
    openServersInNewTabs(servers);
  }

  function resetFilters() {
    setQuery("");
    setCategory("All");
    setStatusFilter("all");
    setRatingFilter("all");
    setIspFilter("all");
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return (
    <div className="app" data-theme={theme}>
      <a className="skip-link" href="#main-content">Skip to server tools</a>
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
              title="Use light theme"
            >
              Light
            </button>
            <button
              className={theme === "dark" ? "theme-option active" : "theme-option"}
              onClick={() => setTheme("dark")}
              type="button"
              aria-pressed={theme === "dark"}
              title="Use dark theme"
            >
              Dark
            </button>
          </div>
          <button
            className="primary-action"
            onClick={testAll}
            disabled={isTesting || filteredServers.length === 0}
          >
            {isTesting ? <TestingLabel /> : `Test ${filteredServers.length} shown`}
          </button>
          <div
            className="tooltip-wrap"
            data-tooltip="Allow browser pop-ups to open servers in new tabs. Open all includes offline and untested servers."
          >
            <div className="open-actions">
              <button
                className="secondary-action"
                onClick={openOnlineSites}
                disabled={onlineServers.length === 0}
                type="button"
                aria-describedby="open-sites-help-text"
              >
                Open {onlineServers.length} online
              </button>
              <button
                className="secondary-action"
                onClick={openAllSites}
                disabled={servers.length === 0}
                type="button"
                aria-label={`Open all ${servers.length} servers, including offline and untested servers`}
                aria-describedby="open-sites-help-text"
              >
                Open all {servers.length}
              </button>
            </div>
          </div>
          <span className="sr-only" id="open-sites-help-text">
            Open online opens servers marked online. Open all opens every server, including offline and untested servers. Allow pop-ups to open them in new tabs.
          </span>
        </div>
      </header>

      <main className="main-content" id="main-content" tabIndex={-1}>
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
              aria-pressed={statusFilter === "all"}
            >
              <span>{servers.length}</span>
              <p>Total</p>
            </button>
            <button
              className={statusFilter === "online" ? "summary-item online active" : "summary-item online"}
              onClick={() => setStatusFilter("online")}
              type="button"
              aria-pressed={statusFilter === "online"}
            >
              <span>{counts.online}</span>
              <p>Online</p>
            </button>
            <button
              className={statusFilter === "offline" ? "summary-item offline active" : "summary-item offline"}
              onClick={() => setStatusFilter("offline")}
              type="button"
              aria-pressed={statusFilter === "offline"}
            >
              <span>{counts.offline}</span>
              <p>Offline</p>
            </button>
            <button
              className={statusFilter === "untested" ? "summary-item active" : "summary-item"}
              onClick={() => setStatusFilter("untested")}
              type="button"
              aria-pressed={statusFilter === "untested"}
            >
              <span>{counts.untested}</span>
              <p>Not tested</p>
            </button>
            {counts.blocked > 0 && (
              <button
                className={statusFilter === "blocked" ? "summary-item blocked active" : "summary-item blocked"}
                onClick={() => setStatusFilter("blocked")}
                type="button"
                aria-pressed={statusFilter === "blocked"}
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
              id="server-search"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Name, category, or URL"
              aria-controls="server-list"
            />
          </label>

          <label className="search-field category-filter">
            <span>Filter by category</span>
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              aria-controls="server-list"
            >
              {categories.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="search-field rating-filter">
            <span>Filter by rating</span>
            <select
              value={ratingFilter}
              onChange={event => setRatingFilter(event.target.value)}
              aria-controls="server-list"
            >
              <option value="all">All ratings</option>
              <option value="unrated">Unrated</option>
              {[5, 4, 3, 2, 1].map(rating => (
                <option key={rating} value={rating}>{rating} stars</option>
              ))}
            </select>
          </label>

          <label className="search-field isp-filter">
            <span>Filter by ISP</span>
            <select
              value={ispFilter}
              onChange={event => setIspFilter(event.target.value)}
              aria-controls="server-list"
            >
              <option value="all">All ISPs</option>
              {isps.map(ispName => <option key={ispName} value={ispName}>{ispName}</option>)}
            </select>
          </label>
        </section>

        <section className="server-list" id="server-list" aria-labelledby="server-list-title">
          <div className="results-heading">
            <h2 id="server-list-title">Servers</h2>
            <p aria-live="polite" aria-atomic="true">{filteredServers.length} results</p>
          </div>
          {filteredServers.length === 0 ? (
            <div className="empty-state">
              <h2>No servers found</h2>
              <p>Try a different search term or show all categories.</p>
              <button onClick={resetFilters} type="button">Clear filters</button>
            </div>
          ) : (
            <div
              className="table-scroll"
              role="region"
              aria-label="Server results"
              aria-describedby="server-table-scroll-help"
              aria-busy={isTesting}
              tabIndex={0}
            >
              <p className="sr-only" id="server-table-scroll-help">
                On smaller screens, scroll horizontally to view all table columns.
              </p>
              <table className="server-table">
                <caption className="sr-only">
                  {filteredServers.length} servers. Use the Test button to check a server, or open its address.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Server</th>
                    <th scope="col">Category</th>
                    <th scope="col">Rating</th>
                    <th scope="col">Address</th>
                    <th scope="col">Status</th>
                    <th scope="col">Check history</th>
                    <th scope="col">ISP results</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.map(server => {
                    const status = results[server.id] || "untested";
                    const meta = STATUS_META[status];
                    const serverIspResults = Array.isArray(server.ispResults)
                      ? server.ispResults
                        .filter(ispName => typeof ispName === "string" && ispName.trim())
                        .sort((left, right) => left.localeCompare(right))
                      : [];
                    const rating = getServerRating(server);

                    return (
                      <tr key={server.id}>
                        <th scope="row" className="server-name-cell">{server.name}</th>
                        <td><span className="category-tag">{server.category}</span></td>
                        <td className="rating-cell">
                          {rating ? (
                            <span className="server-rating" role="img" aria-label={`Rating: ${rating} out of 5 stars`}>
                              <span className="server-rating-stars" aria-hidden="true">
                                {"★".repeat(rating)}{"☆".repeat(5 - rating)}
                              </span>
                              <span aria-hidden="true">{rating}/5</span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="address-cell">
                          <a href={server.url} target="_blank" rel="noreferrer" aria-label={`Open ${server.name} address in a new tab`}>
                            {server.url}
                          </a>
                        </td>
                        <td>
                          <div className={`status ${meta.tone}`}>
                            <span className="status-label">
                              <span className="status-copy">
                                {status === "testing" ? <TestingLabel /> : meta.label}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="check-history-cell">
                          <div>
                            <small>
                              <strong>Pass</strong>
                              <time dateTime={server.lastCheckPass || undefined}>
                                {formatCheckDate(server.lastCheckPass)}
                              </time>
                            </small>
                            <small>
                              <strong>Fail</strong>
                              <time dateTime={server.lastCheckFail || undefined}>
                                {formatCheckDate(server.lastCheckFail)}
                              </time>
                            </small>
                          </div>
                        </td>
                        <td className="isp-results-cell">
                          {serverIspResults.length > 0 ? (
                            <ul>
                              {serverIspResults.map(ispName => (
                                <li key={ispName}>
                                  <span className="isp-result">
                                    <strong>{ispName}</strong>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <small className="isp-empty">No ISP results yet</small>
                          )}
                        </td>
                        <td className="action-cell">
                          <button
                            onClick={() => handleTest(server)}
                            disabled={status === "testing"}
                            type="button"
                            aria-label={`${status === "testing" ? "Testing" : "Test"} ${server.name}`}
                          >
                            {status === "testing" ? <TestingLabel /> : "Test now"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}

export default App;
