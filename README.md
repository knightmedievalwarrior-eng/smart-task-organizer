# ⚡ Stepwise Command Center (Task Runner SaaS)

**Stepwise Command Center** is a 100% Local-First & Zero-Knowledge automation platform designed to eliminate tedious, repetitive tasks (focusing first on **Excel & CSV workflows**) for office workers, accountants, and ops teams—directly inside their web browser.

---

## 🎯 Primary Purpose & Vision
- **Core Mission:** Solve high-pain repetitive tasks end-to-end with zero learning curve.
- **Initial Focus:** Master 100% of Excel & CSV workflows (Thailand market first), then expand to Google Sheets, document processing, and global markets.
- **Business Goal:** Fully automated, self-sustaining SaaS model with zero server data costs.

---

## 🏗️ Architecture & Zero-Knowledge Guarantee (Cost = $0)
Stepwise runs entirely on the user's device (**Local-First**) using **IndexedDB & OPFS**, eliminating central data center storage, ensuring compliance (PDPA/GDPR), and removing privacy leakage risks via **5 Core Engineering Principles**:

1. **Persist Storage:** Uses `navigator.storage.persist()` to prevent OS/Browser auto-eviction of local data.
2. **GitHub OAuth Web Flow:** Auto-creates Private Repositories & syncs user data seamlessly without complex manual Git setup.
3. **UUID JSON Splitting:** Stores records in granular UUID JSON files to eliminate Git sync conflicts.
4. **Two-Tier Trash System:** Soft-deletes items locally for 30 days before running a background auto-purge on GitHub (or instant hard delete).
5. **Stateless Zero-Log Proxy:** Uses Cloudflare Workers to bypass CORS and prevent API Key exposure without storing any logs.

---

## ✨ Key Features

- **Real-Time Step Execution:** Visual progress tracking with step counters (e.g., `Step 2/5`) and live execution status.
- **Omnichannel Access:** Works seamlessly on Mobile, Laptop, Desktop, or embedded directly inside major platforms (LINE, FB Messenger, Gmail).
- **Scheduled & Pending Tasks:** Set cron/time-based automation triggers and monitor uncompleted or backlogged tasks.
- **Self-Healing Automation:** Automatically detects execution errors, attempts local self-correction, or provides instant user-friendly feedback.
- **Bilingual & Custom Themes:** Instant TH/EN language toggle and Theme Switcher (Light/Dark/Custom locked tiers).

---

## 💳 Monetization Models

1. **Daily Credit Package (Freemium):**
   - Free Tier: **250 credits/day** (refreshed daily).
   - Standard execution deducts **20 credits/run** (scaled dynamically based on task complexity).
2. **Usage & Duration Tier:**
   - Metered pricing based on active user volume and operational duration.

---

## 🛠️ Tech Stack
- **Frontend / UI:** React, Vite, Tailwind CSS, Shadcn UI (Responsive across Mobile, Tablet, Desktop).
- **Local Engine:** Client-Side Parsing (`SheetJS/xlsx`), IndexedDB / OPFS.
- **Sync & Proxy:** GitHub API (OAuth Flow), Cloudflare Workers (Zero-Log Stateless Proxy).
