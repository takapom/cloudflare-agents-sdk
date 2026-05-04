import type { KnowledgeArticle } from "@/server/contexts/knowledgeBase/domain/knowledgeArticle";

export const demoKnowledgeArticles = [
  {
    id: "kb-refund-policy",
    title: "返金ポリシーの案内",
    body:
      "返金依頼を受けた場合は、契約プラン、購入日、利用状況を確認し、該当する返金条件を案内します。判断に迷う場合は請求チームへ確認します。",
    tags: ["billing", "refund"],
    status: "published",
    updatedAt: "2026-04-18T00:00:00.000Z"
  },
  {
    id: "kb-login-troubleshooting",
    title: "ログインできない場合の初期確認",
    body:
      "ログインできない問い合わせでは、メールアドレス、SSO利用有無、直近のパスワード変更、エラーメッセージを確認します。",
    tags: ["account", "login"],
    status: "published",
    updatedAt: "2026-03-25T00:00:00.000Z"
  },
  {
    id: "kb-sla-escalation",
    title: "SLA違反リスクのある問い合わせのエスカレーション",
    body:
      "SLA違反リスクがある場合は、優先度をurgentにし、内部メモに理由を残して担当チームへエスカレーションします。",
    tags: ["sla", "escalation"],
    status: "draft",
    updatedAt: "2026-01-10T00:00:00.000Z"
  }
] as const satisfies readonly KnowledgeArticle[];
