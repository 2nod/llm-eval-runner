# エラー種別コード

これらのコードは `eval_targets.fatal_risks` とアノテーション記録で使用します。

| コード | 名称 | 意味 | 例 |
| --- | --- | --- | --- |
| KL | Knowledge Leak | 話者が知らない事実や世界状態を翻訳で漏らさない。 | `datasets/flat.template.jsonl` (t=3) に「鍵の本当の場所を漏らすな」とある。 |
| FB | False Belief | 話者の誤信を保ち、暗黙的に訂正しない。 | `datasets/synth.scenes.jsonl` の `synth_scene_002` (t=2)。 |
| REF | Reference | 代名詞・照応の指示対象を正しく保つ。 | `datasets/synth.scenes.jsonl` の `synth_scene_003` (t=3)。 |
| IMPL | Implicature | 含意・ぼかしを保ち、明示化しない。 | `datasets/synth.scenes.jsonl` の `synth_scene_001` (t=5)。 |
| LEX | Lexical | 語彙選択・用語選択・用語集違反。 | サンプルに例なし。 |
| CONS | Constraint | 形式/スタイル/制約の違反（書式、禁止パターン、レジスター等）。 | サンプルに例なし。 |

新しいエラー種別を追加する場合は、次の enum も更新してください。
- `web/src/types/scene.ts`
- `web/src/db/schema.ts`
- `web/src/routes/annotations.ts`
- `web/app/src/lib/api.ts`
