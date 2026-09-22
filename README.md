# Akari's Sumizuri Sources

An official collection of community sources for [Sumizuri](https://github.com/not-akari/sumizuri), built using Sumizuri's Declarative JSON Extension Engine.

100% static JSON repository: no Node.js runtime, build steps, or external dependencies required.

---

## Add to Sumizuri

Tap the button below on a device with Sumizuri installed to add this repository automatically:

[![Add to Sumizuri](https://img.shields.io/badge/Add%20to-Sumizuri-b5432a?style=for-the-badge)](https://not-akari.github.io/sumizuri/add-repo.html?url=https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/index.json)

**[👉 Click here to Add this Repo to Sumizuri](https://not-akari.github.io/sumizuri/add-repo.html?url=https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/index.json)**

### Manual Setup
1. In Sumizuri, navigate to **Browse** > **Repos** > **Add repo** (`+`).
2. Paste the following Repository URL:
```text
https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/index.json
```
3. Tap **Add**. Sumizuri will fetch the index and list all available sources.

---

## Available Sources (14)

| Source | Media | Lang | Engine | Features |
| :--- | :--- | :--- | :--- | :--- |
| **Anikoto** | `anime` | `en` | `json` | Multi-quality 1080p HLS streaming, multi-subs, skip intro/outro |
| **Asura Scans** | `manga` | `en` | `json` | Popular manhwa & webtoons, high-res chapter pages |
| **Atsumaru** | `manga` | `en` | `json` | Manga aggregator with catalog search and reader |
| **Chikari** | `manga` | `en` | `json` | Fast manga releases |
| **Diva Scans (Comics)** | `manga` | `en` | `json` | Manhwa & comic scanlations |
| **Diva Scans (Novels)** | `novel` | `en` | `json` | Web novels with reader text formatting |
| **Galaxy Manga** | `manga` | `en` | `json` | Shoujo & romance manga reader |
| **Kura Manga** | `manga` | `en` | `json` | Fast LiteSpeed server, WebP CDN, all chapters |
| **MangaZin** | `manga` | `en` | `json` | Zinmanga successor, 600+ static chapters per series |
| **ManhuaTop** | `manga` | `en` | `json` | Chinese manhua and manga with Cloudflare support |
| **nhentai** | `manga` | `all` | `json` | REST API v2, tag search, random, infinite popular pagination |
| **Novel Fire** | `novel` | `en` | `json` | Light & web novels |
| **Toonily** | `manga` | `en` | `json` | Webtoons & manhwa, mature cookie bypass, AJAX chapter loader |
| **Weeb Central** | `manga` | `en` | `json` | High-quality manga, chapter pagination, user & chapter comments |

---

## Source Types & Media Filtering

Each entry in `index.json` declares a `mediaType`, which automatically categorizes the source in Sumizuri and decides what screen handles reading or playback:

| `mediaType` | Browse Section | Opens In | Required Declaration |
| :--- | :--- | :--- | :--- |
| `manga` | Browse > Manga | Comic Reader | `pages` with `imageUrl` per page |
| `novel` | Browse > Novels | Text Reader | `pages` with `text` per chapter |
| `anime` | Browse > Anime | Video Player | `videos` declaring stream addresses and qualities |

---

## Repository Schema

A Sumizuri repository is a single JSON file hosted at any reachable URL (GitHub, GitHub Pages, or any static host):

```json
{
  "name": "Akari's Sumizuri Sources",
  "sources": [
    {
      "id": "anikoto",
      "name": "Anikoto",
      "lang": "en",
      "mediaType": "anime",
      "engineKind": "json",
      "version": 8,
      "iconUrl": "https://anikototv.to/AnikotoTheme/assets/images/favicon.png",
      "baseUrl": "https://anikototv.to",
      "fileUrl": "https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/extension/anikoto.json"
    }
  ]
}
```

### Schema Fields
- `name`: The repo's display title shown in Sumizuri.
- `sources`: A flat list of sources. Media types can be freely mixed.
- `id`: Unique stable identifier for the source. Keeps user installations and bookmarks consistent across version updates.
- `mediaType`: `manga`, `novel`, or `anime`.
- `engineKind`: `json` (declarative JSON source) or `js` (JavaScript source).
- `version`: A plain increasing integer (`1`, `2`, `3`...). When bumped, Sumizuri prompts the user with "Update available".
- `fileUrl`: The source's definition file. Fetched only on install or update.
- `iconUrl`: Source favicon or avatar.
- `baseUrl`: The target website URL.

---

## One-Click Add Deep Link

Sumizuri supports the custom protocol `sumizuri://add-repo?url=<repo-address>`. Because GitHub markdown filters out custom URI schemes, point users to the official redirect page:

```markdown
[Add to Sumizuri](https://not-akari.github.io/sumizuri/add-repo.html?url=https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/index.json)
```

The redirect page automatically prompts the user to add the repository with full address verification.
