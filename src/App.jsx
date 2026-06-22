import { useState } from "react";
import { servers } from "./data/servers";
import { testServer } from "./utils/testServer";
import "./App.css";

function App() {
  const [results, setResults] = useState({});

  async function handleTest(server) {
    setResults(prev => ({
      ...prev,
      [server.id]: "testing"
    }));

    const ok = await testServer(server.testUrl);

    setResults(prev => ({
      ...prev,
      [server.id]: ok ? "online" : "offline"
    }));
  }

  async function testAll() {
    for (const server of servers) {
      await handleTest(server);
    }
  }

  return (
    <div className="app">
      <h1>BDIX Server Tester</h1>

      <button onClick={testAll}>
        Test All Servers
      </button>

      <div className="server-list">
        {servers.map(server => (
          <div className="server-card" key={server.id}>
            <h3>{server.name}</h3>
            <p>{server.category}</p>
            <p>{server.url}</p>

            <button onClick={() => handleTest(server)}>
              Test
            </button>

            <a href={server.url} target="_blank">
              Visit
            </a>

            <strong>
              {results[server.id] === "testing" && " Testing..."}
              {results[server.id] === "online" && " Online"}
              {results[server.id] === "offline" && " Offline"}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;