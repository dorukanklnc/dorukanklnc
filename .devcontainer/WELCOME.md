# CampusOS in Codespaces

## Türkçe

1. **İlk açılışta kurulum birkaç dakika sürer.** Alttaki **TERMINAL** panelinde
   `✓ Setup complete` yazana kadar bekleyin.
2. Kurulum bitince uygulama kendiliğinden başlar ve sağ altta **Open in Browser** bildirimi
   çıkar. Tıklayın.
3. Bildirim çıkmazsa alttaki **PORTS** sekmesini açın ve `3000 · CampusOS` satırındaki adrese
   (ya da 🌐 simgesine) tıklayın.
4. Port 3000 listede yoksa uygulama çalışmıyor demektir. **Terminal → New Terminal** açıp şunu
   yazın:

   ```bash
   cd multi-tenant && pnpm start
   ```

   Kurulum yarıda kaldıysa önce `bash .devcontainer/setup.sh` çalıştırın.

5. Giriş: `sahip@atlas.test`, şifre `Demo!Parola2026`. Diğer roller: `mudur@atlas.test`,
   `muhasebe@atlas.test`, `ogretmen@atlas.test` (şifre aynı).

İşiniz bitince codespace'i <https://github.com/codespaces> adresinden durdurun.

## English

1. **The first start takes a few minutes.** Wait until the **TERMINAL** panel shows
   `✓ Setup complete`.
2. The app then starts by itself and an **Open in Browser** notification appears. Click it.
3. No notification? Open the **PORTS** tab and click the address of `3000 · CampusOS`.
4. Port 3000 missing? Open **Terminal → New Terminal** and run `cd multi-tenant && pnpm start`
   (run `bash .devcontainer/setup.sh` first if the setup did not finish).
5. Sign in as `sahip@atlas.test` with the password `Demo!Parola2026`.

More: `multi-tenant/docs/development/LOCAL_DEVELOPMENT.md`.
