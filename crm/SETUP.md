# CRM setup (one time, about 15 minutes)

The CRM lives at **joshuagleason.ca/crm/**. Its data is stored in a free Supabase database that only your login can read, and only after 2-step verification.

## 1. Create the database
1. Go to **supabase.com** → **Start your project** → sign up (free plan).
2. **New project**
   - Name: `josh-crm`
   - Database password: generate a strong one and save it in your password manager.
   - Region: **Canada (Central)**.
3. Wait about 2 minutes for it to finish setting up.

## 2. Load the CRM tables
1. Left menu → **SQL Editor** → **New query**.
2. Paste the whole contents of `crm/schema.sql` → **Run**. It should say "Success. No rows returned".

## 3. Lock down sign-ups
1. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Leave the Email provider on.
2. **Authentication → Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled.
3. **Authentication → URL Configuration**:
   - Site URL: `https://joshuagleason.ca/crm/`
   - Add `https://joshuagleason.ca/crm/` under Redirect URLs. This is what makes password-reset emails work.

## 4. Create your login
1. **Authentication → Users → Add user → Create new user**.
2. Enter your email and a strong password (12+ characters), and tick **Auto Confirm User**.
3. Back in **SQL Editor**, run this, using the email you just used:

```sql
insert into public.crm_users (user_id)
select id from auth.users where email = 'YOUR-LOGIN-EMAIL'
on conflict do nothing;
```

## 5. Connect the website
1. **Project Settings → API Keys**.
2. Copy the **Project URL** and the **Publishable key** (starts with `sb_publishable_`, or the legacy "anon" key).
3. Put them in `crm/config.js` (or send them to Claude).
4. **Never** share or use the **secret** / **service_role** key. It bypasses all security.

## 6. First sign-in
1. Go to **joshuagleason.ca/crm/** and sign in.
2. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy) and enter the 6-digit code.
3. From then on, every sign-in needs your password plus a code.

## Good to know
- **Free plan pausing:** Supabase pauses free projects after a week with no activity. Daily use and website leads keep it awake. If it ever pauses, Supabase emails you first, and you click **Resume project**.
- **Backups:** the free plan has no automatic backups. Use **Account → Export all contacts** once a month and keep the CSV somewhere safe. Supabase Pro (US$25/month) adds daily backups.
- **Website forms:** Netlify Forms still receives every submission as a backup, so email notifications keep working.
