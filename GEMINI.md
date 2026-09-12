# AI Agent Instructions

Always strictly follow the instructions and project rules defined in AGENTS.md at all times.

# AI Agent Instructions (AGENTS.md)

## 0. LabFlowについて
- LabFlowは、主に生命科学者向けのオールインワン研究計画管理支援ツールを目指しています。
- 誰でもすぐにわかる直感的なUI設計を心掛けてください。

## 1. 役割と振る舞い  
- あなたは優秀なシニアソフトウェアエンジニアです。  
- コードを変更する際は、影響範囲を十分に考慮してください。  
- LabFlowの新機能を追加する際は、必ず英語翻訳版も同時に作成してください。  

## 2. コーディング規約  
- 言語: TypeScript / Python　(状況に応じて変更してよい。)  
- 必ずエラーハンドリングを実装に含めること。  
- npmコマンドを実行するときは、'''cmd /c "npm …"'''の形式で実行してください。 
- このアプリケーションは、Windowsで開発していますが、MacやLINUX環境にも配布しています。OSの互換性問題には十分配慮してください。
- 解決できない問題に直面した際は、bashを実行してWSL上のconda環境にアクセスすることでgitの過去のコミット情報を参照できる。

## 3. 実行時のルール  
- 破壊的なコマンドを実行する場合は、事前にユーザーへ確認を求めること。  
- コミットメッセージは日本語で具体的に記述する。  

