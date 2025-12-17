# バグレポート: 出題者が回答するとすべての回答が締め切られる問題

## 問題の概要

出題者（questioner）が次の問題で回答すると、他のプレイヤーがまだ回答していなくても、すべての回答が締め切られてしまいます。

## 原因分析

### 1. 回答チェックロジックの問題

**ファイル**: `src/hooks/useGameEngine.ts` (121-232行目)

現在の回答チェックロジックは、**すべてのプレイヤー**が回答したかをチェックしていますが、**出題者を除外していません**。

```typescript:145-147:src/hooks/useGameEngine.ts
// すべてのプレイヤーが実際に回答したことを確認
const allAnswered = currentAnswerStates.length > 0 && 
                   currentAnswerStates.every(a => a.answer !== undefined);
```

このロジックでは：
- `players`リストには出題者も含まれています
- 出題者が回答すると、`allAnswered`が`true`になります
- その結果、他のプレイヤーがまだ回答していなくても、回答が締め切られてしまいます

### 2. UI側での出題者制限がない

**ファイル**: `src/App.tsx` (1232-1242行目)

`QuestionScreen`コンポーネントに`isQuestioner`プロパティが渡されていないため、出題者でも回答フォームが表示されてしまいます。

```typescript:1232-1242:src/App.tsx
{phase === 'QUESTION' && (
  <QuestionScreen
    question={currentQuestion}
    questionerName={questionerName}
    onAnswer={submitAnswer}
    myAnswer={myAnswer}
    // isQuestioner プロパティが渡されていない
    ...
  />
)}
```

### 3. ゲームルールの不整合

ゲームのルールとして、出題者は問題を選ぶ役割であり、回答すべきではありません。しかし、現在の実装では：
- 出題者でも回答フォームが表示される
- 出題者の回答も回答チェックに含まれる

## 解決策

### 解決策1: 回答チェックロジックで出題者を除外する（必須）

**ファイル**: `src/hooks/useGameEngine.ts`

回答チェックロジックを修正し、出題者（`questionerId`）を除外します。

```typescript
// 修正前
const allAnswered = currentAnswerStates.length > 0 && 
                   currentAnswerStates.every(a => a.answer !== undefined);

// 修正後
const answeringPlayers = currentAnswerStates.filter(a => a.id !== questionerId);
const allAnswered = answeringPlayers.length > 0 && 
                   answeringPlayers.every(a => a.answer !== undefined);
```

また、スコア計算時も出題者を除外する必要があります：

```typescript
const answerValues = answeringPlayers
    .filter(a => a.answer !== undefined)
    .map(a => ({
        id: a.id,
        val: a.answer as number
    }))
    .sort((a, b) => a.val - b.val);
```

### 解決策2: UI側で出題者の回答を無効化する（推奨）

**ファイル**: `src/App.tsx`

1. `QuestionScreen`に`isQuestioner`プロパティを追加
2. 出題者の場合は回答フォームを表示しない、または無効化する

```typescript
{phase === 'QUESTION' && (
  <QuestionScreen
    question={currentQuestion}
    questionerName={questionerName}
    onAnswer={submitAnswer}
    myAnswer={myAnswer}
    isQuestioner={isQuestioner}  // 追加
    ...
  />
)}
```

**ファイル**: `src/App.tsx` (384行目以降)

`QuestionScreen`コンポーネント内で、出題者の場合は異なるUIを表示：

```typescript
if (isQuestioner) {
  return (
    <div className="screen wait">
      <div className="question-summary">
        {question && (
          <>
            <div className="category-label">[{question.category}]</div>
            <div className="question-text-small">{question.text}</div>
          </>
        )}
      </div>
      <h2>出題者です</h2>
      <p>他のプレイヤーの回答を待っています...</p>
    </div>
  );
}
```

## 影響範囲

- **影響を受けるファイル**:
  - `src/hooks/useGameEngine.ts`: 回答チェックロジックの修正が必要
  - `src/App.tsx`: `QuestionScreen`への`isQuestioner`プロパティ追加とUI修正が必要
  - `src/types.ts`: `QuestionScreenProps`に`isQuestioner`プロパティを追加する必要がある可能性

## テストケース

修正後、以下のテストケースで動作確認が必要です：

1. **正常ケース**: 出題者以外の全員が回答した場合、回答が締め切られる
2. **バグケース**: 出題者が回答しても、他のプレイヤーが回答していない場合は締め切られない
3. **UI確認**: 出題者の画面では回答フォームが表示されない（または無効化されている）
4. **スコア計算**: 出題者の回答がスコア計算に含まれない

## 優先度

**高** - ゲームの基本機能に影響する重大なバグです。

## 補足

この問題は、ゲームのルール設計と実装の不整合から発生しています。出題者は問題を選ぶ役割であり、回答すべきではないというルールをコードで明確に実装する必要があります。

