# Putting this on GitHub (no coding needed)

1. Go to github.com and create a free account (your friend does the same).
2. Click **New repository**. Name it `truco-app`, choose **Private**, and create it (do not tick "Add a README").
3. Unzip `truco-app-repo.zip` on your computer. Open the `truco-app` folder.
4. On the empty repository page click **uploading an existing file**, then drag **everything inside** the `truco-app` folder
   into the browser (not the folder itself). Wait for the upload to finish, write a short message such as "First upload",
   and click **Commit changes**.
5. The `.github` folder is hidden on many computers. On a Mac press Cmd + Shift + . in the folder to show it; on Windows
   turn on "Hidden items" in the View menu. If you skip it, everything still works, but GitHub will not run the tests
   automatically.
6. Invite your friend: **Settings > Collaborators > Add people**, then type their GitHub username.
7. Check it worked: open the **Actions** tab. After a minute the "tests" run should show a green tick.
   If you skipped the `.github` folder, run `npm test` on your own computer instead.

Later, to change files, you can edit them in the browser (pencil icon) or use GitHub Desktop (desktop.github.com).
Ask Claude for a walkthrough when you get there.
