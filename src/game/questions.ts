export interface Question {
    text: string;
    category: string;
}

export const QUESTIONS: Question[] = [
    { category: "生活", text: "一週間のうち、家で食事をする回数は何回？" },
    { category: "お金", text: "今の所持金はいくら？（千円単位）" },
    { category: "知識", text: "山手線の駅の数は全部でいくつ？" },
    // ここに新しい問題を追加してください
    // { category: "カテゴリ名", text: "問題文" },
];
