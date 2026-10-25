# Connect Cledara to Claude Desktop

Follow these steps to ask Claude Desktop questions about Cledara, such as "what did we spend on software last month?" or "which payments are missing invoices?". It takes about 5 minutes and you only do it once.

Claude can only read your Cledara data. It cannot change anything in Cledara.

## What you need

- **Claude Desktop**, installed and signed in. Download it from [claude.ai/download](https://claude.ai/download).
- **A Cledara login with the right role.** Your role must be **SaaS Admin/Finance** or **Spend Admin/Accountant**. If you're not sure, ask your Cledara admin.
- **The `cledara.mcpb` file.** Download it from [the latest release](https://github.com/ilyesBen/cledara-mcp/releases/latest): under **Assets**, click `cledara.mcpb`.

You don't need to install anything else.

## Step 1: Create your Cledara API key

1. Log in to Cledara in your web browser.
2. Click your name or profile picture, then go to **Profile → API Keys**.
3. Click **Create API key**.
4. Name it `Claude Desktop` and choose how long it should last. 6 or 12 months is sensible.
5. **Copy the key now and keep it somewhere safe for the next few minutes.** Cledara only shows it once. If you lose it, delete it and create a new one.

> 🔒 **Treat this key like a password.** Anyone who has it can see the same Cledara data you can. Don't paste it into Slack, email or shared documents.

## Step 2: Install the extension

1. Make sure Claude Desktop is open.
2. Double-click the **`cledara.mcpb`** file you downloaded. Claude Desktop shows an install screen for **Cledara**.
   - If double-clicking doesn't open Claude, go to Claude's **Settings → Extensions → Advanced settings → Install Extension…** and choose the file.
3. Click **Install**.
   - Claude may warn that the extension isn't signed or verified. That's expected for an internal tool; click **Install** again to confirm.
4. When Claude asks for the **Cledara API key**, paste the key you copied in Step 1 and click **Save**.
5. Make sure the switch next to **Cledara** is turned **on**.

Your key is saved in your computer's secure password storage (Keychain on Mac, Credential Manager on Windows), not in a plain file.

## Step 3: Check it works

1. Start a new chat.
2. Click the **+** or **🔨 tools** button below the message box. You should see **Cledara** listed, with tools such as `list_applications`.
3. Ask Claude: *"Using Cledara, list our active software applications."*
4. Claude will ask permission to use the Cledara tool. Click **Allow**. To stop it asking every time, click **Always allow**.

You're done. 🎉

## Things to try

- "How much did we spend on software last month, by team?"
- "Which card payments from the last 30 days are missing invoices?"
- "What payments are coming up in the next two weeks?"
- "Who owns our engineering tools?"
- "Show me every Slack transaction this year."

## If something goes wrong

| What you see | What to do |
|---|---|
| Double-clicking the file does nothing | Install it from Claude's **Settings → Extensions → Advanced settings → Install Extension…** instead. |
| **Cledara** isn't in the tools list | In **Settings → Extensions**, check the Cledara switch is on. Then quit Claude completely (⌘ Q on Mac, or **Quit** from the system tray on Windows) and reopen it. |
| Claude says the key was rejected (401) | The key was copied wrongly, has expired or was switched off. Create a new key (Step 1), then in **Settings → Extensions → Cledara → Configure**, paste it in again. |
| Claude says there's a permission problem (403) | Your Cledara role can't use the API. Ask your Cledara admin. |
| Something else | Take a screenshot of the error in **Settings → Extensions → Cledara** and send it to whoever shared this guide. |

## Updating to a new version

Download the new `cledara.mcpb` and double-click it, just as you did the first time. Your API key is kept.

## Removing it later

- **To remove the extension:** go to **Settings → Extensions → Cledara** and click **Uninstall**.
- **To revoke access to your data:** go to **Profile → API Keys** in Cledara and delete the key.

## Good to know

- **The connector runs on your own computer.** It talks directly to Cledara. Your key and data don't pass through any other company's servers.
- **What Claude can see:** only what it fetches to answer your questions. Those results are sent to Anthropic, the same as anything else you show Claude.
- **Your key is stored in your computer's secure password storage** and only ever sent to Cledara.

## Appendix: manual setup without the extension

Only use this if the extension won't install for you, for example because your company blocks extensions. It needs more steps, and your key ends up in a plain-text settings file. Don't share that file or post screenshots of it.

### A. Install Node.js

Node.js is a free program that runs the Cledara connector in the background. Skip this step if you already have it.

1. Go to [nodejs.org](https://nodejs.org) and click the big **LTS** download button.
2. Open the file you downloaded and click through the installer, accepting the defaults.

### B. Create your Cledara API key

1. Log in to Cledara in your web browser.
2. Click your name or profile picture, then go to **Profile → API Keys**.
3. Click **Create API key**.
4. Name it `Claude Desktop` and choose how long it should last. 6 or 12 months is sensible.
5. **Copy the key now and keep it somewhere safe for the next few minutes.** Cledara only shows it once. If you lose it, delete it and create a new one.

> 🔒 **Treat this key like a password.** Anyone who has it can see the same Cledara data you can. Don't paste it into Slack, email or shared documents.

### C. Open Claude Desktop's settings file

1. Open Claude Desktop.
2. Open the settings:
   - **Mac:** click **Claude** in the menu bar at the top of the screen, then **Settings…**
   - **Windows:** click the **☰** menu at the top left, then **File → Settings…**
3. Click **Developer** in the left sidebar.
4. Click **Edit Config**. A folder opens with a file called `claude_desktop_config.json` selected.
5. Open that file in a plain text editor:
   - **Mac:** right-click the file, then **Open With → TextEdit**.
   - **Windows:** right-click the file, then **Open with → Notepad**.

### D. Add the Cledara connector

You'll paste some text into the file. Exactly what you paste depends on what's in the file now.

In the text below, replace `PASTE-YOUR-KEY-HERE` with the key you copied in step B. Keep the quote marks around it.

#### If the file is empty or only contains `{}`

Delete everything in the file and paste this:

**Mac:**

```json
{
  "mcpServers": {
    "cledara": {
      "command": "npx",
      "args": ["-y", "github:ilyesBen/cledara-mcp"],
      "env": {
        "CLEDARA_API_KEY": "PASTE-YOUR-KEY-HERE"
      }
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "cledara": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:ilyesBen/cledara-mcp"],
      "env": {
        "CLEDARA_API_KEY": "PASTE-YOUR-KEY-HERE"
      }
    }
  }
}
```

#### If the file already has other text in it

You probably have other connectors set up already. Don't delete them.

1. Find the line `"mcpServers": {`.
2. Click just after the `{` at the end of that line, press Enter, and paste this:

   ```json
       "cledara": {
         "command": "npx",
         "args": ["-y", "github:ilyesBen/cledara-mcp"],
         "env": {
           "CLEDARA_API_KEY": "PASTE-YOUR-KEY-HERE"
         }
       },
   ```

   On **Windows**, use the `"command"` and `"args"` lines from the Windows example above instead.
3. Make sure the comma after the closing `}` is there. It separates Cledara from the next connector.

If the file has text but no `"mcpServers"` line, ask for help rather than guessing.

#### Save the file

- **Mac (TextEdit):** press **⌘ S**. If TextEdit asks about the format, choose to keep it as plain text.
- **Windows (Notepad):** press **Ctrl S**.

### E. Restart Claude Desktop

Closing the window is not enough. Quit the app completely:

- **Mac:** press **⌘ Q** while Claude is open.
- **Windows:** right-click the Claude icon in the system tray at the bottom right of the screen, then click **Quit**.

Then open Claude Desktop again. The first start can take up to a minute while the connector downloads.

### F. Check it works

1. Start a new chat.
2. Click the **+** or **🔨 tools** button below the message box. You should see **cledara** listed, with tools such as `list_applications`.
3. Ask Claude: *"Using Cledara, list our active software applications."*
4. Claude will ask permission to use the Cledara tool. Click **Allow**. To stop it asking every time, click **Always allow**.

You're done. 🎉

### If the manual setup doesn't work

- **"Server disconnected" or "spawn npx ENOENT":** Node.js isn't installed, or Claude can't find it. Install Node.js (step A), then **restart your computer**.
- **"Could not load app settings" or "invalid JSON":** the settings file has a typo, usually a missing comma or quote mark. Paste the file's contents into [jsonlint.com](https://jsonlint.com) **after removing your API key**, and it will point to the problem line.
