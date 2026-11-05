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

const SORTABLE_COLUMNS = [
  { key: "name", label: "Server" },
  { key: "category", label: "Category" },
  { key: "rating", label: "Rating" },
  { key: "address", label: "Address" },
  { key: "status", label: "Status" },
  { key: "checkHistory", label: "Check history" },
  { key: "ispResults", label: "ISP results" }
];

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

function getServerIspResults(server) {
  return Array.isArray(server.ispResults)
    ? server.ispResults
      .filter(ispName => typeof ispName === "string" && ispName.trim())
      .sort((left, right) => left.localeCompare(right))
    : [];
}

function compareText(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getLatestCheck(server) {
  const timestamps = [server.lastCheckPass, server.lastCheckFail]
    .map(timestamp => timestamp ? Date.parse(timestamp) : Number.NaN)
    .filter(Number.isFinite);

  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function compareServers(left, right, sortKey, results, direction) {
  const leftStatus = results[left.id] || "untested";
  const rightStatus = results[right.id] || "untested";
  let leftValue;
  let rightValue;

  switch (sortKey) {
    case "category":
      leftValue = left.category;
      rightValue = right.category;
      break;
    case "rating":
      leftValue = getServerRating(left);
      rightValue = getServerRating(right);
      break;
    case "address":
      leftValue = left.url;
      rightValue = right.url;
      break;
    case "status":
      leftValue = STATUS_META[leftStatus].label;
      rightValue = STATUS_META[rightStatus].label;
      break;
    case "checkHistory":
      leftValue = getLatestCheck(left);
      rightValue = getLatestCheck(right);
      break;
    case "ispResults":
      leftValue = getServerIspResults(left).join(", ");
      rightValue = getServerIspResults(right).join(", ");
      break;
    case "name":
    default:
      leftValue = left.name;
      rightValue = right.name;
  }

  const leftMissing = leftValue === null || leftValue === "";
  const rightMissing = rightValue === null || rightValue === "";

  if (leftMissing) {
    return rightMissing ? 0 : 1;
  }

  if (rightMissing) {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * (direction === "asc" ? 1 : -1);
  }

  return compareText(String(leftValue), String(rightValue)) * (direction === "asc" ? 1 : -1);
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
  const [sort, setSort] = useState({ key: "rating", direction: "desc" });
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
        return compareServers(left, right, sort.key, results, sort.direction) ||
          compareText(left.name, right.name) ||
          left.id - right.id;
      });
  }, [category, ispFilter, query, ratingFilter, results, sort, statusFilter]);

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

  function handleSort(key) {
    setSort(current => ({
      key,
      direction: current.key === key
        ? current.direction === "asc" ? "desc" : "asc"
        : key === "rating" ? "desc" : "asc"
    }));
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
                  {filteredServers.length} servers. Use the controls in the column headings to filter,
                  and select a sortable column heading to change the order. Use the Test button to
                  check a server, or open its address.
                </caption>
                <thead>
                  <tr>
                    {SORTABLE_COLUMNS.map(column => {
                      const isSorted = sort.key === column.key;
                      const directionLabel = sort.direction === "asc" ? "ascending" : "descending";

                      return (
                        <th
                          key={column.key}
                          scope="col"
                          aria-sort={isSorted ? directionLabel : undefined}
                        >
                          <button
                            className="server-sort-button"
                            onClick={() => handleSort(column.key)}
                            type="button"
                            aria-label={isSorted
                              ? `${column.label}, sorted ${directionLabel}. Change sort direction.`
                              : `Sort by ${column.label}`}
                          >
                            {column.label}
                            <span className="sort-indicator" aria-hidden="true">
                              {isSorted ? sort.direction === "asc" ? "↑" : "↓" : "↕"}
                            </span>
                          </button>
                          {column.key === "name" && (
                            <input
                              className="column-filter"
                              id="server-search"
                              ref={searchInputRef}
                              type="search"
                              value={query}
                              onChange={event => setQuery(event.target.value)}
                              placeholder="Search servers"
                              aria-label="Search servers by name, category, or URL"
                              aria-controls="server-list"
                            />
                          )}
                          {column.key === "category" && (
                            <select
                              className="column-filter"
                              value={category}
                              onChange={event => setCategory(event.target.value)}
                              aria-label="Filter by category"
                              aria-controls="server-list"
                            >
                              {categories.map(item => <option key={item} value={item}>{item}</option>)}
                            </select>
                          )}
                          {column.key === "rating" && (
                            <select
                              className="column-filter"
                              value={ratingFilter}
                              onChange={event => setRatingFilter(event.target.value)}
                              aria-label="Filter by rating"
                              aria-controls="server-list"
                            >
                              <option value="all">All ratings</option>
                              <option value="unrated">Unrated</option>
                              {[5, 4, 3, 2, 1].map(rating => (
                                <option key={rating} value={rating}>{rating} stars</option>
                              ))}
                            </select>
                          )}
                          {column.key === "ispResults" && (
                            <select
                              className="column-filter"
                              value={ispFilter}
                              onChange={event => setIspFilter(event.target.value)}
                              aria-label="Filter by ISP"
                              aria-controls="server-list"
                            >
                              <option value="all">All ISPs</option>
                              {isps.map(ispName => <option key={ispName} value={ispName}>{ispName}</option>)}
                            </select>
                          )}
                        </th>
                      );
                    })}
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.map(server => {
                    const status = results[server.id] || "untested";
                    const meta = STATUS_META[status];
                    const serverIspResults = getServerIspResults(server);
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
