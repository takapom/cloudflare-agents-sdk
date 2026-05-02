import type { TicketPriority, TicketStatus } from "@/shared/contracts";

export const demoTickets = [
  {
    id: "T-1001",
    customerName: "田中 美咲",
    customerEmail: "misaki@example.test",
    subject: "請求書の宛名を会社名に変更したい",
    body:
      "今月分の請求書の宛名が個人名になっています。経理提出のため、株式会社サンプル 田中美咲 宛に変更できますか？",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    category: "billing",
    tags: ["invoice", "account"]
  },
  {
    id: "T-1002",
    customerName: "佐藤 翔太",
    customerEmail: "shota@example.test",
    subject: "ログイン後に白い画面になる",
    body:
      "昨日からログイン後にダッシュボードが白い画面のまま表示されません。Chrome最新版、Macです。業務で使っているので早めに確認したいです。",
    status: "open" as TicketStatus,
    priority: "urgent" as TicketPriority,
    category: "bug",
    tags: ["login", "frontend", "urgent"]
  },
  {
    id: "T-1003",
    customerName: "山本 玲奈",
    customerEmail: "reina@example.test",
    subject: "CSVエクスポートの列順を固定したい",
    body:
      "毎週レポートをCSVで出していますが、列順が変わることがあります。列順を固定する設定はありますか？",
    status: "pending" as TicketStatus,
    priority: "low" as TicketPriority,
    category: "feature_request",
    tags: ["csv", "reporting"]
  },
  {
    id: "T-1004",
    customerName: "鈴木 健",
    customerEmail: "ken@example.test",
    subject: "API rate limitの上限について",
    body:
      "現在のプランでAPI rate limitはいくつですか？夜間バッチで429が出ることがあります。上限緩和の方法も知りたいです。",
    status: "open" as TicketStatus,
    priority: "high" as TicketPriority,
    category: "technical_question",
    tags: ["api", "rate-limit"]
  },
  {
    id: "T-1005",
    customerName: "伊藤 葵",
    customerEmail: "aoi@example.test",
    subject: "退会ではなく一時停止できますか？",
    body:
      "来月から2か月だけ利用しない予定です。アカウントを削除せず、一時停止や休止のような扱いは可能でしょうか？",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    category: "account",
    tags: ["plan", "retention"]
  }
];
