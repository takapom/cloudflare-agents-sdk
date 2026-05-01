import React from "react";
import { createRoot } from "react-dom/client";
import { getToolName, isToolUIPart } from "ai";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  getToolApproval,
  getToolCallId,
  getToolPartState
} from "@cloudflare/ai-chat/react";
import type {
  SupportDeskAgent,
  SupportDeskState,
  TenantOverview,
  TicketPriority,
  TicketStatus
} from "./server";
import "./styles.css";

type TicketView = {
  id: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const tenantPresets = ["acme-demo", "globex-demo", "umbrella-demo"];

function readWorkspaceName() {
  const params = new URLSearchParams(location.search);
  return params.get("workspace") || "acme-demo";
}

function normalizeTenantName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64)
    .replace(/^-|-$/g, "");

  return normalized || "acme-demo";
}

function statusLabel(status: TicketStatus) {
  const labels: Record<TicketStatus, string> = {
    open: "未対応",
    pending: "保留中",
    resolved: "解決済み"
  };

  return labels[status];
}

function priorityLabel(priority: TicketPriority) {
  const labels: Record<TicketPriority, string> = {
    low: "低",
    medium: "中",
    high: "高",
    urgent: "緊急"
  };

  return labels[priority];
}

function modeLabel(mode: string | null | undefined) {
  if (mode === "readonly") return "読み取り専用";
  if (mode === "normal") return "通常";
  return "-";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    assistant: "エージェント",
    data: "データ",
    system: "システム",
    user: "ユーザー"
  };

  return labels[role] ?? role;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    account: "アカウント",
    billing: "請求",
    bug: "不具合",
    feature_request: "機能要望",
    technical_question: "技術質問"
  };

  return labels[category] ?? category;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    addInternalNote: "内部メモ追加",
    changeTicketStatus: "ステータス変更",
    draftReplyWithSubAgent: "返信案作成",
    seedDemoData: "デモデータ初期化"
  };

  return labels[action] ?? action;
}

function toolNameLabel(toolName: string) {
  const labels: Record<string, string> = {
    addInternalNote: "内部メモ追加",
    changeTicketStatus: "ステータス変更",
    codemode: "コード実行",
    draftReplyWithSubAgent: "返信案作成",
    getWeather: "天気取得",
    getTicket: "チケット詳細取得",
    listTickets: "チケット一覧取得",
    runDynamicWorkerTicketAnalytics: "チケット分析",
    searchTickets: "チケット検索",
    seedDemoData: "デモデータ初期化"
  };

  return labels[toolName] ?? toolName;
}

function toolStateLabel(toolState: string) {
  const labels: Record<string, string> = {
    "input-available": "入力待ち",
    "input-streaming": "入力受信中",
    "output-available": "完了",
    "output-error": "エラー",
    "waiting-approval": "承認待ち"
  };

  return labels[toolState] ?? toolState;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCountMap(
  counts: Record<string, number>,
  labeler: (name: string) => string = (name) => name
) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length > 0
    ? entries.map(([name, count]) => `${labeler(name)}: ${count}`).join(" / ")
    : "-";
}

function App() {
  const [workspace, setWorkspace] = React.useState(() => normalizeTenantName(readWorkspaceName()));

  React.useEffect(() => {
    const normalized = normalizeTenantName(readWorkspaceName());
    if (normalized !== readWorkspaceName()) {
      const url = new URL(location.href);
      url.searchParams.set("workspace", normalized);
      history.replaceState(null, "", url);
    }
  }, []);

  function switchTenant(nextTenantName: string) {
    const next = normalizeTenantName(nextTenantName);
    const url = new URL(location.href);
    url.searchParams.set("workspace", next);
    history.pushState(null, "", url);
    setWorkspace(next);
  }

  React.useEffect(() => {
    function handlePopState() {
      setWorkspace(normalizeTenantName(readWorkspaceName()));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <TenantWorkspace
      key={workspace}
      workspace={workspace}
      switchTenant={switchTenant}
    />
  );
}

type TenantWorkspaceProps = {
  workspace: string;
  switchTenant: (nextTenantName: string) => void;
};

function TenantWorkspace({ workspace, switchTenant }: TenantWorkspaceProps) {
  const [customTenantName, setCustomTenantName] = React.useState(workspace);
  const [tickets, setTickets] = React.useState<TicketView[]>([]);
  const [selectedTicket, setSelectedTicket] = React.useState<string>("T-1002");
  const [tenantOverview, setTenantOverview] = React.useState<TenantOverview | null>(null);
  const [readonly, setReadonly] = React.useState(false);
  const [structuredOutput, setStructuredOutput] = React.useState(false);
  const structuredOutputRef = React.useRef(false);
  const [loadingTenant, setLoadingTenant] = React.useState(false);
  const [lastAction, setLastAction] = React.useState<string | null>(null);

  const agent = useAgent<SupportDeskAgent, SupportDeskState>({
    agent: "SupportDeskAgent",
    name: workspace
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    status
  } = useAgentChat({
    agent,
    body: () => ({
      mode: readonly ? "readonly" : "normal",
      responseMode: structuredOutputRef.current ? "structured" : "text",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });

  async function refreshTenantSnapshot(action = "テナント情報を更新しました") {
    setLoadingTenant(true);
    try {
      const [rows, overview] = await Promise.all([
        agent.stub.listTickets("all", "all", 20),
        agent.stub.getTenantOverview()
      ]);
      const nextTickets = rows as TicketView[];

      setTickets(nextTickets);
      setTenantOverview(overview as TenantOverview);
      setSelectedTicket((current) =>
        nextTickets.some((ticket) => ticket.id === current)
          ? current
          : nextTickets[0]?.id ?? "T-1002"
      );
      setLastAction(action);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTenant(false);
    }
  }

  async function resetDemoData() {
    setLoadingTenant(true);
    try {
      await agent.stub.seedDemoData({ reset: true });
      await refreshTenantSnapshot(`${workspace} のデモデータを初期化しました`);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingTenant(false);
    }
  }

  async function draftSelectedTicket() {
    const text = `${selectedTicket} の返信案をReplyDraftAgentに作らせて。親しみやすいトーンで、必要なら追加確認も含めて。`;
    sendMessage({ text });
  }

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshTenantSnapshot(`${workspace} を読み込みました`);
    }, 500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const tenantOptions = tenantPresets.includes(workspace)
    ? tenantPresets
    : [workspace, ...tenantPresets];

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cloudflare Agents テナントデモ</p>
          <h1>SupportDeskPilot</h1>
          <p className="hero-copy">
            テナントごとに別のSupportDeskAgent Durable Objectへ接続し、それぞれのSQLite状態を検索・要約・更新します。
          </p>
        </div>
        <div className="status-card">
          <div className="status-row">
            <span>テナント</span>
            <b>{agent.state?.workspaceId ?? workspace}</b>
          </div>
          <div className="status-row">
            <span>オブジェクト</span>
            <b>{tenantOverview?.durableObjectClass ?? "SupportDeskAgent"}</b>
          </div>
          <div className="status-row">
            <span>モード</span>
            <b>{readonly ? "読み取り専用" : modeLabel(agent.state?.mode ?? "normal")}</b>
          </div>
          <div className="status-row">
            <span>未対応/保留中</span>
            <b>{agent.state?.openTicketCount ?? "-"}</b>
          </div>
          <div className="status-row">
            <span>緊急</span>
            <b>{agent.state?.urgentTicketCount ?? "-"}</b>
          </div>
        </div>
      </header>

      <section className="tenant-panel">
        <div className="tenant-title">
          <p className="eyebrow">テナント範囲</p>
          <h2>{workspace}</h2>
        </div>

        <div className="tenant-controls">
          <select
            aria-label="テナント候補"
            value={workspace}
            onChange={(event) => switchTenant(event.target.value)}
          >
            {tenantOptions.map((tenant) => (
              <option key={tenant} value={tenant}>
                {tenant}
              </option>
            ))}
          </select>

          <form
            className="tenant-form"
            onSubmit={(event) => {
              event.preventDefault();
              switchTenant(customTenantName);
            }}
          >
            <input
              value={customTenantName}
              onChange={(event) => setCustomTenantName(event.target.value)}
              placeholder="テナント名"
              autoComplete="off"
            />
            <button type="submit">テナントを開く</button>
          </form>
        </div>

        <div className="tenant-metrics">
          <div>
            <span>保存先</span>
            <b>{tenantOverview?.storageBackend === "sqlite" ? "SQLite" : "-"}</b>
          </div>
          <div>
            <span>チケット</span>
            <b>{tenantOverview?.counts.tickets ?? "-"}</b>
          </div>
          <div>
            <span>メモ</span>
            <b>{tenantOverview?.counts.notes ?? "-"}</b>
          </div>
          <div>
            <span>返信案</span>
            <b>{tenantOverview?.counts.drafts ?? "-"}</b>
          </div>
          <div>
            <span>監査ログ</span>
            <b>{tenantOverview?.counts.auditLog ?? "-"}</b>
          </div>
        </div>

        <div className="tenant-breakdown">
          <span>
            ステータス:{" "}
            {tenantOverview ? formatCountMap(tenantOverview.byStatus, (name) => statusLabel(name as TicketStatus)) : "-"}
          </span>
          <span>
            優先度:{" "}
            {tenantOverview ? formatCountMap(tenantOverview.byPriority, (name) => priorityLabel(name as TicketPriority)) : "-"}
          </span>
          <span>
            カテゴリ: {tenantOverview ? formatCountMap(tenantOverview.byCategory, categoryLabel) : "-"}
          </span>
          <span>
            最新監査ログ:{" "}
            {tenantOverview?.latestAuditLog[0]
              ? `${auditActionLabel(tenantOverview.latestAuditLog[0].action)} ${formatDateTime(tenantOverview.latestAuditLog[0].createdAt)}`
              : "-"}
          </span>
        </div>
      </section>

      <section className="toolbar">
        <button
          onClick={() => refreshTenantSnapshot()}
          disabled={loadingTenant}
        >
          {loadingTenant ? "読み込み中..." : "テナントを更新"}
        </button>
        <button onClick={resetDemoData}>デモデータを初期化</button>
        <button
          className="secondary-action"
          onClick={async () => {
            const next = !readonly;
            setReadonly(next);
            await agent.stub.setMode(next ? "readonly" : "normal");
            await refreshTenantSnapshot(`${workspace} を${next ? "読み取り専用" : "通常"}モードにしました`);
          }}
        >
          読み取り専用: {readonly ? "オン" : "オフ"}
        </button>
        <button
          className="secondary-action"
          onClick={() => {
            const next = !structuredOutput;
            structuredOutputRef.current = next;
            setStructuredOutput(next);
            setLastAction(`構造化JSON出力を${next ? "オン" : "オフ"}にしました`);
          }}
        >
          構造化JSON: {structuredOutput ? "オン" : "オフ"}
        </button>
        <button className="secondary-action" onClick={() => clearHistory()}>
          チャットを消去
        </button>
        {lastAction ? <span className="last-action">{lastAction}</span> : null}
      </section>

      <div className="layout">
        <section className="panel tickets-panel">
          <div className="panel-title-row">
            <h2>チケット</h2>
            <select
              value={selectedTicket}
              onChange={(e) => setSelectedTicket(e.target.value)}
            >
              {tickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticket.id}
                </option>
              ))}
            </select>
          </div>

          <div className="ticket-list">
            {tickets.map((ticket) => (
              <article
                key={ticket.id}
                className={`ticket-card ${ticket.id === selectedTicket ? "selected" : ""}`}
                onClick={() => setSelectedTicket(ticket.id)}
              >
                <div className="ticket-header">
                  <b>{ticket.id}</b>
                  <span className={`priority priority-${ticket.priority}`}>
                    {priorityLabel(ticket.priority)}
                  </span>
                </div>
                <h3>{ticket.subject}</h3>
                <p>{ticket.body}</p>
                <div className="meta-row">
                  <span>{ticket.customerName}</span>
                  <span>{statusLabel(ticket.status)}</span>
                  <span>{categoryLabel(ticket.category)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel chat-panel">
          <div className="panel-title-row">
            <h2>エージェントチャット</h2>
            <button onClick={draftSelectedTicket}>{selectedTicket} の返信案を作成</button>
          </div>

          <div className="suggestions">
            <button
              onClick={() =>
                sendMessage({ text: "今あるopen/pendingチケットを優先度順に要約して、今日見るべき順番を提案して" })
              }
            >
              受信箱を要約
            </button>
            <button
              onClick={() =>
                sendMessage({ text: `テナント ${workspace} の現在の状態を、件数・優先度・未処理リスクの観点で要約して` })
              }
            >
              テナントを要約
            </button>
            <button
              onClick={() => {
                structuredOutputRef.current = true;
                setStructuredOutput(true);
                sendMessage({
                  text: `テナント ${workspace} の構造化レポートをJSONで作成して`
                });
              }}
            >
              構造化レポート
            </button>
            <button
              onClick={() =>
                sendMessage({
                  text: "getWeather toolを使って大阪の現在の天気を取得して、日本語で短く要約して"
                })
              }
            >
              大阪の天気
            </button>
            <button
              onClick={() =>
                sendMessage({
                  text: "codemodeを使って、大阪と東京の現在の天気をgetWeatherで取得し、気温と降水量を比較して"
                })
              }
            >
              天気をコードで比較
            </button>
            <button
              onClick={() =>
                sendMessage({ text: `${selectedTicket} の詳細を確認して、内部メモ案と顧客返信案を作って` })
              }
            >
              選択中を分析
            </button>
            <button
              onClick={() =>
                sendMessage({ text: `${selectedTicket} に「調査中。ログイン後の白画面再現条件を確認する」という内部メモを追加して` })
              }
            >
              承認付きでメモ追加
            </button>
            <button
              onClick={() =>
                sendMessage({ text: `${selectedTicket} のステータスを保留中に変更して。理由は「追加情報待ち」` })
              }
            >
              承認付きで状態変更
            </button>
          </div>

          <div className="messages">
            {messages.length === 0 ? (
              <p className="empty-message">
                例: 「このテナントの緊急チケットを探して」「T-1002の返信案を作って」「T-1004に内部メモを追加して」
              </p>
            ) : null}

            {messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                <div className="message-role">{roleLabel(message.role)}</div>
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <p key={index} className="message-text">
                        {part.text}
                      </p>
                    );
                  }

                  if (isToolUIPart(part)) {
                    const toolName = getToolName(part);
                    const toolCallId = getToolCallId(part);
                    const toolState = getToolPartState(part);
                    const approval = getToolApproval(part);

                    return (
                      <div key={toolCallId} className="tool-box">
                        <div className="tool-title">
                          <b>{toolNameLabel(toolName)}</b>
                          <span>{toolStateLabel(toolState)}</span>
                        </div>

                        {toolState === "waiting-approval" && approval ? (
                          <div className="approval-actions">
                            <p>このツール実行には承認が必要です。</p>
                            <button
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: approval.id,
                                  approved: true
                                })
                              }
                            >
                              承認
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: approval.id,
                                  approved: false
                                })
                              }
                            >
                              拒否
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return null;
                })}
              </article>
            ))}
          </div>

          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("input") as HTMLInputElement;
              const text = input.value.trim();
              if (!text) return;
              sendMessage({ text });
              input.value = "";
            }}
          >
            <input
              name="input"
              placeholder="問い合わせ分析や操作を依頼..."
              autoComplete="off"
            />
            <button type="submit" disabled={status !== "ready"}>
              送信
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
