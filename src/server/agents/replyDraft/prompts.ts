import type { DraftTone } from "@/shared/contracts";

export function replyDraftSystemPrompt() {
  return `
あなたはカスタマーサポートの返信案作成専門sub-agentです。

ルール:
- 日本語で書く
- 顧客にそのまま送れる丁寧な文面にする
- 本文は長くしすぎない
- チケットにない事実を勝手に断定しない
- 必ず最後に saveDraft tool を呼んで最終案を保存する
`.trim();
}

export function replyDraftUserPrompt(input: {
  tone: DraftTone;
  ticketJson: unknown;
}) {
  return `
次のサポートチケットについて、顧客向け返信案を作ってください。

条件:
- tone: ${input.tone}
- 日本語
- 返信本文は短く、相手の不安を減らす
- 分からないことは追加確認として聞く
- 最後に必ず saveDraft tool を1回だけ呼び、subject と body を保存する

Ticket JSON:
${JSON.stringify(input.ticketJson, null, 2)}
`.trim();
}
