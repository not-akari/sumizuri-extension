var BASE = "https://mangataro.org";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: BASE + "/",
};

var JSON_HEADERS = Object.assign({}, HEADERS, {
  Accept: "application/json",
  "Content-Type": "application/json",
});

async function getJson(path, options) {
  var res = await host.fetch(BASE + path, Object.assign({ headers: JSON_HEADERS }, options || {}));
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error("MangaTaro answered " + res.statusCode + " for " + path);
  }
  return JSON.parse(res.body);
}

function toEntry(item) {
  return {
    url: item.url || item.permalink || item.manga_permalink,
    title: String(item.title || "").trim(),
    coverUrl: item.cover || null,
    rating: item.score && Number(item.score) > 0 ? Number(item.score) : undefined,
    status: item.status || undefined,
    description: item.description || undefined,
  };
}

// The browse page's own list: one call covers popular, newest, search and every filter.
async function browse(page, options) {
  var o = options || {};
  var list = await getJson("/wp-json/manga/v1/load", {
    method: "POST",
    body: JSON.stringify({
      page: page || 1,
      search: o.search || "",
      years: JSON.stringify(o.years || []),
      genres: "[]",
      types: JSON.stringify(o.types || []),
      statuses: JSON.stringify(o.statuses || []),
      sort: o.sort || "popular_desc",
      genreMatchMode: "any",
    }),
  });
  return (Array.isArray(list) ? list : []).map(toEntry).filter(function (e) { return e.url && e.title; });
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

// The chapter list asks for a token made from the time and the current hour.
async function chapterToken() {
  var timestamp = Math.floor(Date.now() / 1000);
  var hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
  var hash = await host.hash("md5", timestamp + "mng_ch_" + hour);
  return { token: String(hash).substring(0, 16), timestamp: timestamp };
}

async function mangaIdOf(entryUrl) {
  var res = await host.fetch(entryUrl, { headers: HEADERS });
  var match = /data-manga-id="(\d+)"/.exec(res.body || "");
  if (!match) throw new Error("MangaTaro did not say which title this is: " + entryUrl);
  return { id: match[1], html: res.body };
}

async function firstText(html, selector) {
  var found = await host.query(html, selector);
  return found.length ? String(found[0].text || "").trim() : "";
}

var extension = {
  name: "MangaTaro",
  lang: "en",
  baseUrl: BASE,
  iconUrl: "https://raw.githubusercontent.com/not-akari/Sumizuri-Extension/main/docs/icons/mangataro.png",
  rateLimitMs: 400,
  headers: HEADERS,

  getPopular: function (page) {
    return browse(page, { sort: "popular_desc" });
  },

  // Titles with a new chapter, newest first, each once.
  getLatest: async function (page) {
    var data = await getJson("/wp-json/manga/v1/latest-chapters", {
      method: "POST",
      body: JSON.stringify({ page: page || 1 }),
    });
    var seen = {};
    var out = [];
    (data.data || []).forEach(function (item) {
      var url = item.manga_permalink;
      if (!url || seen[url]) return;
      seen[url] = true;
      out.push({ url: url, title: String(item.title || "").trim(), coverUrl: item.cover || null });
    });
    return out;
  },

  search: function (query, page, filters) {
    var f = filters || {};
    return browse(page, {
      search: String(query || "").trim(),
      sort: f.sort || (String(query || "").trim() ? "post_desc" : "popular_desc"),
      types: asList(f.type),
      statuses: asList(f.status),
      years: asList(f.year),
    });
  },

  getFilters: function () {
    var years = [{ label: "Any", value: "" }];
    for (var y = new Date().getFullYear(); y >= 1970; y--) years.push({ label: String(y), value: String(y) });
    return [
      {
        key: "sort",
        name: "Sort by",
        type: "select",
        options: [
          { label: "Most popular", value: "popular_desc" },
          { label: "Newly added", value: "post_desc" },
          { label: "Release date", value: "release_desc" },
          { label: "Title A to Z", value: "title_asc" },
          { label: "Title Z to A", value: "title_desc" },
        ],
      },
      {
        key: "type",
        name: "Type",
        type: "multiSelect",
        options: ["Manga", "Manhwa", "Manhua", "Novel"].map(function (t) { return { label: t, value: t }; }),
      },
      {
        key: "status",
        name: "Status",
        type: "multiSelect",
        options: ["Ongoing", "Completed"].map(function (t) { return { label: t, value: t }; }),
      },
      { key: "year", name: "Year", type: "select", options: years },
    ];
  },

  getCatalogs: function () {
    return [
      { id: "new", name: "Newly added" },
      { id: "completed", name: "Completed" },
      { id: "manhwa", name: "Manhwa" },
      { id: "manhua", name: "Manhua" },
      { id: "alphabet", name: "A to Z" },
    ];
  },

  getCatalog: function (id, page) {
    switch (id) {
      case "new": return browse(page, { sort: "post_desc" });
      case "completed": return browse(page, { statuses: ["Completed"] });
      case "manhwa": return browse(page, { types: ["Manhwa"] });
      case "manhua": return browse(page, { types: ["Manhua"] });
      case "alphabet": return browse(page, { sort: "title_asc" });
      default: return Promise.resolve([]);
    }
  },

  getDetails: async function (entryUrl) {
    var res = await host.fetch(entryUrl, { headers: HEADERS });
    var html = res.body || "";
    var title = await firstText(html, "h1");
    var description = await firstText(html, "#description-content-tab");
    var covers = await host.query(html, 'meta[property="og:image"]');
    var genres = await host.query(html, 'a[href*="/genre/"], a[href*="/tag/"]');
    var statusMatch = /\b(Ongoing|Completed|Hiatus|Cancelled|Canceled)\b/.exec(html);
    var authors = await host.query(html, 'a[href*="/author/"]');
    return {
      url: entryUrl,
      title: title,
      description: description || undefined,
      coverUrl: covers.length ? covers[0].attributes.content : undefined,
      genres: genres.map(function (g) { return String(g.text || "").trim(); }).filter(Boolean),
      status: statusMatch ? statusMatch[1] : undefined,
      author: authors.map(function (a) { return String(a.text || "").trim(); }).filter(Boolean).join(", ") || undefined,
    };
  },

  getChapterList: async function (entryUrl) {
    var manga = await mangaIdOf(entryUrl);
    var chapters = [];
    var offset = 0;
    for (var round = 0; round < 40; round++) {
      var t = await chapterToken();
      var query = "?manga_id=" + manga.id + "&offset=" + offset + "&limit=500&order=desc&_t=" + t.token + "&_ts=" + t.timestamp;
      var data = await getJson("/auth/manga-chapters" + query);
      var batch = data.chapters || [];
      batch.forEach(function (c) {
        var number = parseFloat(c.chapter);
        chapters.push({
          url: c.url,
          title: c.title ? "Chapter " + c.chapter + " - " + c.title : "Chapter " + c.chapter,
          number: isNaN(number) ? undefined : number,
          dateUploaded: c.date ? require("date").parse(c.date) : undefined,
          scanlator: c.group_name || undefined,
        });
      });
      if (!data.has_more || batch.length === 0) break;
      offset += batch.length;
    }
    return chapters;
  },

  getPageList: async function (chapterUrl) {
    var match = /-(\d+)\/?$/.exec(String(chapterUrl).split("?")[0]);
    if (!match) throw new Error("Not a MangaTaro chapter address: " + chapterUrl);
    var data = await getJson("/auth/chapter-content?chapter_id=" + match[1]);
    if (data.chapter_type && data.chapter_type !== "media" && data.content) {
      return [{ index: 0, text: data.content }];
    }
    return (data.images || []).map(function (url, i) { return { index: i, imageUrl: url }; });
  },
};
