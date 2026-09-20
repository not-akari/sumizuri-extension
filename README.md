# Sumizuri Extensions Repository

A repository of extensions for Sumizuri, built using Sumizuri's Declarative JSON Extension Engine.

This repository is 100% static JSON: no Node.js runtime, build steps, or npm dependencies required.

## Adding to Sumizuri

1. In Sumizuri, navigate to **Browse** > **Repos** > **Add repo** (`+`).
2. Paste the following Repository URL:

```text
https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/index.json
```

3. Tap **Add**. Sumizuri will fetch the repository index and list all available sources


## Source types

Each entry in `index.json` has a `mediaType`, which decides where the source shows up in Sumizuri and what opens when you tap a chapter:

| `mediaType` | Shows under | Opens in | The source's JSON declares |
|---|---|---|---|
| `manga` | Browse > Manga | the reader | `pages` with an `imageUrl` per page |
| `novel` | Browse > Novels | the reader | `pages` with `text` |
| `anime` | Browse > Anime | the video player | `videos` |

## Adding an anime source

An anime source is an ordinary JSON source with a `videos` section in place of `pages`. Episodes are the source's `chapters`, and `videos` lists the ways to watch one episode, best first:

```json
"videos": {
  "url": "{chapterUrl}",
  "itemSelector": "video source",
  "fields": {
    "url": { "attr": "src" },
    "quality": { "attr": "label" }
  },
  "videoHeaders": { "Referer": "{baseUrl}/" }
}
```

Then list it in `index.json` with `"mediaType": "anime"` like any other source:

```json
{
  "id": "exampleanime",
  "name": "Example Anime",
  "lang": "en",
  "mediaType": "anime",
  "engineKind": "json",
  "version": 1,
  "baseUrl": "https://anime.example",
  "fileUrl": "https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/extension/exampleanime.json"
}
```

Video links can be a plain file (`.mp4`, `.mkv`) or an HLS/DASH playlist (`.m3u8`, `.mpd`). Both play; only plain files can be downloaded for offline viewing. Subtitles, extra audio tracks and the request headers the video host needs (`videoHeaders`) are all optional. Everything about anime sources (all the `videos` options, seasons, skip intro, finding a hidden stream, testing) is in the Sumizuri docs: `docs/anime_extension.md`. The rest of the JSON schema is `docs/json_extension.md`, and sources that need real code use `docs/js_extension.md`.

Bump `version` in `index.json` whenever a source's file changes, so Sumizuri offers the update.
