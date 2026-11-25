# 個人網站 V12

V12 延用原本的作品、插圖、字級、首頁摘要與時間軸。登入後，草稿會在電腦和 iPad 共用。公開頁只顯示你按下發佈時的版本。

## 平常怎麼用

1. 開啟你的 GitHub Pages 網址，按「用 GitHub 登入」。電腦和 iPad 都用同一個 GitHub 帳號。
2. 第一次搬家時，在 V11.1 按「匯出草稿」，登入 V12 後匯入這個 JSON 一次。
3. 編輯文字或套用插圖後，等上方顯示「已儲存到雲端」，就能關掉頁面。在另一台裝置打開同一網址即可接續。若另一台已開著，切回網頁時會查詢更新，也可以按「同步」。同時改了兩份時，畫面會請你選要用哪份。
4. 要在 iPad 畫圖，選首頁或章節，點上方「畫插圖」。若手掌碰到畫布會留下筆跡，勾選「只用觸控筆」。點「套用到本頁」後等待儲存。回到電腦用同一網址，就能接著調整。繪圖也可用滑鼠或手指。
5. 想給老師看時，用「帳戶與發佈」的「發佈目前草稿」，再複製公開網址。後續修改先儲存到私人草稿，想更新公開頁時再發佈一次。取消公開可在同一個面板操作。

## 一次性設定

### 1. 建立 Supabase 專案

到 https://supabase.com/dashboard 建立新專案。在 SQL Editor 執行 `supabase/setup.sql` 的全部內容。它會建立私人草稿和公開快照的資料表，私人草稿只允許登入者存取自己的那一份。

在 Supabase Connect 面板找到 Project URL 和 **Publishable key**，填入 `docs/cloud-config.js` 的 `url` 與 `publishableKey`。舊版專案可用 legacy anon key。GitHub OAuth Client Secret、Supabase Secret key 與 service_role key 都留在後台。

### 2. 啟用 GitHub 登入

假設你的 GitHub 帳號是 `myname`，儲存庫叫 `portfolio`，預定網址是 `https://myname.github.io/portfolio/`。請把下列範例換成你的實際網址。

- 在 GitHub 的 Settings → Developer settings → OAuth Apps 建立 OAuth App。
- Homepage URL 填 GitHub Pages 網址。Authorization callback URL 填 Supabase 的 GitHub provider 頁面提供的網址，格式為 `https://你的專案代號.supabase.co/auth/v1/callback`。
- 在 Supabase 的 Authentication 設定啟用 GitHub provider，把 GitHub OAuth App 的 Client ID 和 Client Secret 貼到該 provider 的後台欄位。
- 在 Supabase 的 Authentication → URL Configuration 設定 Site URL 為 Pages 網址，並把同一個完整網址加入 Redirect URLs。專案網址請保留最後的斜線，登入和編輯時都使用同一個目錄網址。
- 如果這個專案只給你自己使用，可以先完成自己的首次登入，再在 Supabase 停用新帳號註冊。已註冊的帳號仍受各自的草稿權限限制。

### 3. 放上 GitHub Pages

將 ZIP 解壓後的專案內容放進你的儲存庫，讓 `docs/index.html` 位於 `docs` 資料夾。保留 `docs/.nojekyll`。儲存庫 Settings → Pages 選 Deploy from a branch，指定 `main` 和 `/docs`，儲存後等 GitHub 顯示正式網址。

原始草稿 JSON 請從網頁的「匯入草稿」搬家。ZIP 只放程式與設定範本。填設定時只需 Project URL 與 Publishable key。若是用 GitHub 網頁上傳而漏了隱藏檔，請在 `docs` 內新增空白的 `.nojekyll`。

設定參考

- GitHub Pages 發佈來源 https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Supabase 的 GitHub 登入 https://supabase.com/docs/guides/auth/social-sign-in/auth-github
- Supabase 的回跳網址 https://supabase.com/docs/guides/auth/redirect-urls
- Supabase 金鑰與資料列權限 https://supabase.com/docs/guides/getting-started/api-keys

## 本機試用

保留 `docs/cloud-config.js` 的兩個空值時，可以先在本機使用。裝好 Node.js 後，在專案資料夾執行 `node preview.mjs`，開啟 `http://127.0.0.1:4311`。若 V11.1 還在執行，先關閉它。這個模式將草稿儲存在目前的瀏覽器，帳戶、跨裝置同步與公開頁要設定上面的 Supabase 連線後才會啟用。
