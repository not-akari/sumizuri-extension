var BASE = "https://kagane.to";

// No made-up User-Agent: Cloudflare only clears the browser's own one.
var HEADERS = {
  Referer: BASE + "/",
  Origin: BASE,
};

var JSON_HEADERS = Object.assign({}, HEADERS, {
  Accept: "application/json",
  "Content-Type": "application/json",
});

var PAGE_SIZE = 35;

function extractSeriesId(url) {
  if (!url) return null;
  var str = String(url).trim();
  var match = str.match(/\/series\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(str)) return str;
  return null;
}

function extractBookId(url) {
  if (!url) return null;
  var match = String(url).match(/\/reader\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function imageUrl(imageId) {
  return imageId ? BASE + "/api/v2/image/" + imageId + "/compressed" : null;
}

// Requests go through the app, which gets past Cloudflare by itself and
// throws the challenge on to the solver screen when a person is needed.
async function api(path, method, body, extraHeaders) {
  var res = await host.fetch(BASE + path, {
    method: method || "GET",
    headers: Object.assign({}, JSON_HEADERS, extraHeaders || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
    browserPage: BASE + "/",
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error("Kagane answered " + res.statusCode + " for " + path);
  }
  return JSON.parse(res.body);
}

// Lists and search are one endpoint: filters go in the body, sort in the query.
async function searchSeries(page, sort, filters) {
  var query = "?page=" + Math.max(0, (page || 1) - 1) + "&size=" + PAGE_SIZE;
  if (sort) query += "&sort=" + encodeURIComponent(sort);
  var data = await api("/api/v2/search/series" + query, "POST", filters || {});
  return (data.content || []).map(function (s) {
    var url = BASE + "/series/" + s.series_id;
    return {
      url: url,
      title: s.title || s.series_id,
      coverUrl: imageUrl(s.cover_image_id),
      webUrl: url,
    };
  });
}

var extension = {
  name: "Kagane",
  lang: "en",
  baseUrl: BASE,
  iconUrl: "https://kagane.to/favicon.ico",
  rateLimitMs: 500,
  headers: HEADERS,

  getPopular: function (page) {
    return searchSeries(page, "avg_views_today,desc");
  },

  getLatest: function (page) {
    return searchSeries(page, "updated_at,desc");
  },

  search: function (query, page) {
    var title = String(query || "").trim();
    return searchSeries(page, title ? null : "avg_views_today,desc", title ? { title: title } : {});
  },

  getDetails: async function (entryUrl) {
    var seriesId = extractSeriesId(entryUrl);
    var data = await api("/api/v2/series/" + seriesId);
    var url = BASE + "/series/" + seriesId;
    var cover = (data.series_covers || [])[0];
    var genres = (data.genres || []).map(function (g) { return g.genre_name; });
    var tags = (data.tags || [])
      .filter(function (t) { return !t.is_spoiler; })
      .map(function (t) { return t.tag_name; });
    var staff = (data.series_staff || []).map(function (s) { return s.name || s.staff_name; });
    return {
      url: url,
      title: data.title || seriesId,
      description: data.description || undefined,
      coverUrl: imageUrl(cover && cover.image_id),
      webUrl: url,
      author: staff.filter(Boolean).join(", ") || undefined,
      status: data.publication_status || data.upload_status || undefined,
      genres: genres.concat(tags).filter(Boolean),
    };
  },

  getChapterList: async function (entryUrl) {
    var seriesId = extractSeriesId(entryUrl);
    var data = await api("/api/v2/series/" + seriesId);
    var books = (data.series_books || []).slice();
    books.sort(function (a, b) { return (b.sort_no || 0) - (a.sort_no || 0); });
    return books.map(function (b) {
      var num = parseFloat(b.chapter_no);
      if (isNaN(num)) num = Number(b.sort_no);
      var volume = parseFloat(b.volume_no);
      return {
        url: BASE + "/series/" + seriesId + "/reader/" + b.book_id,
        title: b.title || ("Chapter " + (b.chapter_no || b.sort_no)),
        number: isNaN(num) ? undefined : num,
        volume: isNaN(volume) ? undefined : volume,
        dateUploaded: b.published_on || b.created_at || undefined,
        scanlator: (b.groups || []).map(function (g) { return g.title; }).join(", ") || undefined,
      };
    });
  },

  // The reader asks for an integrity token, trades it for the chapter's page
  // list and an access token, and loads each page from the image host with it.
  getPageList: async function (chapterUrl) {
    var bookId = extractBookId(chapterUrl);
    if (!bookId) throw new Error("Not a Kagane chapter address: " + chapterUrl);
    var integrity = await api("/api/integrity", "POST");
    var book = await api(
      "/api/v2/books/" + bookId + "?is_datasaver=false",
      "POST",
      {},
      { "x-integrity-token": integrity.token }
    );
    var cache = book.cache_url || "https://kstatic.to";
    var pages = ((book.manifest && book.manifest.pages) || []).slice();
    pages.sort(function (a, b) { return a.page_no - b.page_no; });
    return pages.map(function (p, index) {
      return {
        index: index,
        imageUrl:
          cache + "/api/v2/books/page/" + bookId + "/" + p.page_id + "." + (p.ext || "jpg") +
          "?token=" + encodeURIComponent(book.access_token),
      };
    });
  },
};
