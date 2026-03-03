# Step-by-step: Push code and redeploy Apps Script

Do **Part 1** to save and push your app changes. Do **Part 2** to update the script in your Google Sheet so the app and sheet stay in sync.

---

## Part 1: Push your code to Git

### 1.1 Open Terminal

- In Cursor: **Terminal → New Terminal** (or `` Ctrl+` `` / `` Cmd+` ``).
- Make sure you’re in the project: `cd /path/to/RORK-WorkFlow` (if needed).

### 1.2 Check what will be committed

```bash
git status
```

You should see something like:

- `app/(tabs)/tools/index.tsx` (modified)
- `app/(tabs)/tools/sheet-viewer.tsx` (modified)
- `scripts/DEPLOY_APPSCRIPT.md` (modified)
- `scripts/appscript.gs` (modified)

### 1.3 (Optional) Run lint and type check

```bash
npm run lint
npx tsc --noEmit
```

If both pass (or only the 2 known pre-existing TS errors in tools), you’re good. If something new fails, fix it before committing.

### 1.4 Stage all changed files

```bash
git add app/\(tabs\)/tools/index.tsx app/\(tabs\)/tools/sheet-viewer.tsx scripts/DEPLOY_APPSCRIPT.md scripts/appscript.gs
```

Or stage everything that’s modified:

```bash
git add -u
```

### 1.5 Commit with a message

```bash
git commit -m "Align sheet names: Task Actuals fallback, doc updates, sheet-viewer fallback"
```

### 1.6 Push to the remote

```bash
git push origin main
```

(Use your actual branch name if it’s not `main`.)

---

## Part 2: Redeploy the Apps Script in Google Sheets

This updates the script that your Google Sheet runs so it matches the code in the repo (v4.3, CA_PLUS-driven live stats with CA_TAGGED fallback).

### 2.1 Open your Google Sheet

- Open the spreadsheet that TaskFlow uses (the one whose Web app URL is in `EXPO_PUBLIC_GOOGLE_SCRIPT_URL`).
- Make sure you’re signed in with the account that owns the sheet and the script.

### 2.2 Open the Apps Script editor

- In the menu: **Extensions → Apps Script**.
- A new tab opens with the script editor (usually one file like `Code.gs`).

### 2.3 Replace all code in the editor

1. Click inside the editor so the code is focused.
2. **Select all**: **Cmd+A** (Mac) or **Ctrl+A** (Windows).
3. **Delete** (Backspace or Delete) so the file is empty.
4. On your computer, open the repo file:  
   **`RORK-WorkFlow/scripts/appscript.gs`**  
   (in Cursor or any editor).
5. In `appscript.gs`: **Cmd+A** / **Ctrl+A** to select all, then **Cmd+C** / **Ctrl+C** to copy.
6. Back in the **Apps Script** browser tab, click in the empty editor and **Cmd+V** / **Ctrl+V** to paste.
7. **Save**: **Cmd+S** / **Ctrl+S**, or click the disk icon. The title should show that the project is saved.

### 2.4 Deploy a new version (same Web app URL)

1. In the Apps Script tab, click **Deploy → Manage deployments**.
2. You’ll see your existing Web app deployment. Click the **pencil (Edit)** on that deployment.
3. Under **Version**:
   - Choose **New version**.
   - Optionally add a description, e.g. `v4.2 sheet name alignment`.
4. Click **Deploy**.
5. **Do not** create a “New deployment” unless you want a new URL. Editing the existing one keeps the same Web app URL.

### 2.5 Confirm the Web app URL (only if you created a new deployment)

- If you **only** edited the existing deployment and deployed a new version: the Web app URL does **not** change. You do **not** need to change `EXPO_PUBLIC_GOOGLE_SCRIPT_URL`.
- If you created a **New deployment** by mistake and got a new URL: copy that new “Web app URL” and set it in your app:
  - In the repo, if you use `.env` or `.env.local`, set:
    - `EXPO_PUBLIC_GOOGLE_SCRIPT_URL=<paste the new URL>`
  - Redeploy or restart your app (e.g. Vercel) so it picks up the new env value.

### 2.6 Check your sheet tab names

In the same Google Sheet, confirm these **sheet tabs** exist and are named **exactly** as below (including spaces and “|”):

- `Collectors`
- `TASK_LIST`
- `CA_PLUS` (preferred for live upload stats) **or** `CA_TAGGED` (fallback)
- `CA_INDEX`
- Either **`Task Actuals | Redashpull`** or **`Collector Actuals | RedashPull`** (the script accepts either)
- `Collector Task Assignments Log`
- `RS_Task_Req`
- `_AppCache`

If a tab name is different (e.g. different spelling or extra space), either rename the tab to match or the script may throw “Sheet not found” for that tab.

---

## You’re done

- **Part 1**: Your latest app and script code are in Git.
- **Part 2**: The Google Sheet is running the updated script (v4.3) with CA_PLUS live stats support (and CA_TAGGED fallback).

The app will display data correctly as long as `EXPO_PUBLIC_GOOGLE_SCRIPT_URL` points to that Web app URL and the sheet tab names match.
