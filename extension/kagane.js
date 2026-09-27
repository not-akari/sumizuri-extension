var BASE = "https://kagane.to";

var HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: BASE + "/",
  Origin: BASE,
};

function extractSeriesId(url) {
  if (!url) return null;
  var str = String(url).trim();
  var match = str.match(/\/series\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  var uuidMatch = str.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  if (uuidMatch) return str;
  return null;
}

function extractBookId(url) {
  if (!url) return null;
  var str = String(url).trim();
  var match = str.match(/\/reader\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
}

async function fetchOrRender(url, waitFor) {
  try {
    var res = await host.fetch(url, {
      headers: HEADERS,
      browserPage: BASE + "/robots.txt",
    });
    if (res.body && !res.body.includes("Just a moment...") && !res.body.includes("cf_chl")) {
      return { html: res.body, fromFetch: true };
    }
  } catch (e) {}

  var rendered = await host.render(url, {
    waitFor: waitFor || "a[href*='/series/'], #__next",
    timeout: 25000,
  });
  return { html: rendered.html, fromFetch: false };
}

async function parseCatalog(url, waitFor) {
  var data = await fetchOrRender(url, waitFor);
  var doc = await host.parse(data.html);

  var links = await doc.select("a[href*='/series/']");
  var seen = new Set();
  var results = [];

  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    var href = a.attributes["href"] || "";
    var seriesId = extractSeriesId(href);
    if (!seriesId || seen.has(seriesId)) continue;
    seen.add(seriesId);

    var img = await a.selectOne("img");
    var coverUrl = img ? (img.attributes["src"] || img.attributes["data-src"]) : null;
    var title = (a.attributes["title"] || a.text || (img ? img.attributes["alt"] : "") || "").trim();

    if (!title || title.length < 2) {
      title = seriesId;
    }

    var fullUrl = href.startsWith("http") ? href : (BASE + (href.startsWith("/") ? "" : "/") + href);

    results.push({
      url: fullUrl,
      title: title,
      coverUrl: coverUrl ? (coverUrl.startsWith("http") ? coverUrl : BASE + coverUrl) : null,
      webUrl: fullUrl,
    });
  }

  return results;
}

var extension = {
  name: "Kagane",
  lang: "en",
  baseUrl: BASE,
  iconUrl: "https://kagane.to/favicon.ico",
  rateLimitMs: 1000,
  headers: HEADERS,

  getPopular: async function (page) {
    var url = BASE + "/browse?sort=popular&page=" + (page || 1);
    return parseCatalog(url, "a[href*='/series/']");
  },

  getLatest: async function (page) {
    var url = BASE + "/browse?sort=latest&page=" + (page || 1);
    return parseCatalog(url, "a[href*='/series/']");
  },

  search: async function (query, page) {
    var q = encodeURIComponent(query || "");
    var url = BASE + "/browse?q=" + q + "&page=" + (page || 1);
    return parseCatalog(url, "a[href*='/series/']");
  },

  getDetails: async function (entryUrl) {
    var seriesId = extractSeriesId(entryUrl);
    var fullUrl = entryUrl.startsWith("http") ? entryUrl : (BASE + "/series/" + seriesId);

    // Try API first if seriesId is present
    if (seriesId) {
      try {
        var apiRes = await host.fetch(BASE + "/api/v2/series/" + seriesId, {
          headers: Object.assign({}, HEADERS, { Accept: "application/json" }),
          browserPage: BASE + "/robots.txt",
        });
        if (apiRes.body && apiRes.body.startsWith("{")) {
          var data = JSON.parse(apiRes.body);
          if (data && (data.title || data.series_id)) {
            var coverUrl = null;
            if (Array.isArray(data.series_covers) && data.series_covers.length > 0) {
              var c = data.series_covers[0];
              var imgId = c.image_id || c.imageId;
              if (imgId) coverUrl = BASE + "/api/v2/image/" + imgId;
            }
            var genres = [];
            if (Array.isArray(data.genres)) {
              genres = data.genres
                .map(function (g) { return g.genre_name || g.name || ""; })
                .filter(Boolean);
            }
            return {
              url: fullUrl,
              title: data.title || seriesId,
              description: data.description || undefined,
              coverUrl: coverUrl,
              webUrl: fullUrl,
              status: data.publication_status || data.upload_status || undefined,
              genres: genres.length > 0 ? genres : undefined,
            };
          }
        }
      } catch (e) {}
    }

    // Fallback to rendered HTML
    var rendered = await fetchOrRender(fullUrl, "h1, div.title, .description");
    var doc = await host.parse(rendered.html);

    var title = (await doc.text("h1") || await doc.text(".title") || seriesId || "").trim();
    var desc = (await doc.text(".synopsis") || await doc.text(".description") || await doc.text("div[class*='description']") || "").trim();
    var cover = await doc.attr("img[class*='cover']", "src") || await doc.attr(".poster img", "src");

    var genreNodes = await doc.select("a[href*='/genre/'], span[class*='genre'], span[class*='tag']");
    var genres = [];
    for (var i = 0; i < genreNodes.length; i++) {
      var gText = (genreNodes[i].text || "").trim();
      if (gText && genres.indexOf(gText) === -1) genres.push(gText);
    }

    return {
      url: fullUrl,
      title: title,
      description: desc || undefined,
      coverUrl: cover ? (cover.startsWith("http") ? cover : BASE + cover) : null,
      webUrl: fullUrl,
      genres: genres.length > 0 ? genres : undefined,
    };
  },

  getChapterList: async function (entryUrl) {
    var seriesId = extractSeriesId(entryUrl);
    var fullUrl = entryUrl.startsWith("http") ? entryUrl : (BASE + "/series/" + seriesId);

    // Try API first
    if (seriesId) {
      try {
        var apiRes = await host.fetch(BASE + "/api/v2/series/" + seriesId, {
          headers: Object.assign({}, HEADERS, { Accept: "application/json" }),
          browserPage: BASE + "/robots.txt",
        });
        if (apiRes.body && apiRes.body.startsWith("{")) {
          var data = JSON.parse(apiRes.body);
          if (data && Array.isArray(data.series_books) && data.series_books.length > 0) {
            var books = data.series_books.slice();
            books.sort(function (a, b) {
              return (b.sort_no || parseFloat(b.chapter_no) || 0) - (a.sort_no || parseFloat(a.chapter_no) || 0);
            });
            return books.map(function (b) {
              var bookId = b.book_id || b.bookId;
              var chUrl = BASE + "/series/" + seriesId + "/reader/" + bookId;
              var num = b.sort_no !== undefined ? Number(b.sort_no) : parseFloat(b.chapter_no);
              return {
                url: chUrl,
                title: b.title || ("Chapter " + (b.chapter_no || b.sort_no || "")),
                number: isNaN(num) ? undefined : num,
                dateUploaded: b.created_at || b.published_on || undefined,
              };
            });
          }
        }
      } catch (e) {}
    }

    // Fallback to rendered HTML
    var rendered = await fetchOrRender(fullUrl, "a[href*='/reader/']");
    var doc = await host.parse(rendered.html);
    var links = await doc.select("a[href*='/reader/']");
    var seen = new Set();
    var chapters = [];

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.attributes["href"] || "";
      var bookId = extractBookId(href);
      if (!bookId || seen.has(bookId)) continue;
      seen.add(bookId);

      var titleText = (a.text || "").trim();
      var numMatch = titleText.match(/(\d+(?:\.\d+)?)/);
      var num = numMatch ? parseFloat(numMatch[1]) : undefined;
      var chUrl = href.startsWith("http") ? href : (BASE + (href.startsWith("/") ? "" : "/") + href);

      chapters.push({
        url: chUrl,
        title: titleText || ("Chapter " + (num !== undefined ? num : (chapters.length + 1))),
        number: num,
      });
    }

    return chapters;
  },

  getPageList: async function (chapterUrl) {
    var bookId = extractBookId(chapterUrl) || "";

    var script = `(function() {
      try {
        var raw = sessionStorage.getItem('kagane_drm_tokens');
        if (raw) {
          var tokens = JSON.parse(raw);
          var keys = Object.keys(tokens);
          if (keys.length > 0) {
            var matchedKey = null;
            for (var i = 0; i < keys.length; i++) {
              if (keys[i].indexOf('${bookId}') !== -1) { matchedKey = keys[i]; break; }
            }
            if (!matchedKey) matchedKey = keys[0];
            var entry = tokens[matchedKey];
            if (entry && entry.token && entry.cacheUrl && Array.isArray(entry.pages) && entry.pages.length > 0) {
              var pages = entry.pages.slice();
              pages.sort(function(a, b) {
                var noA = a.page_no !== undefined ? a.page_no : a.pageNo;
                var noB = b.page_no !== undefined ? b.page_no : b.pageNo;
                return (noA || 0) - (noB || 0);
              });
              var bId = entry.book_id || entry.bookId || '${bookId}';
              return JSON.stringify(pages.map(function(p) {
                var pId = p.page_id || p.pageId;
                var ext = p.ext || 'webp';
                return entry.cacheUrl + '/api/v2/books/page/' + bId + '/' + pId + '.' + ext + '?token=' + entry.token;
              }));
            }
          }
        }
      } catch (e) {}

      try {
        var imgs = document.querySelectorAll('img.reader-image[src], .reader img[src], img[src*=\"/books/page/\"]');
        if (imgs.length > 0) {
          var urls = Array.from(imgs).map(function(img) { return img.src; }).filter(function(s) { return s.startsWith('http'); });
          if (urls.length > 0) return JSON.stringify(urls);
        }
      } catch (e) {}

      return '[]';
    })()`;

    var rendered = await host.render(chapterUrl, {
      waitFor: "img.reader-image, .reader, #reader, canvas, .page",
      waitForResource: /\/api\/v2\/books\/page\//,
      capture: /\/api\/v2\/books\/page\/[^\s"']+/,
      script: script,
      timeout: 25000,
    });

    var imageUrls = [];

    // 1. Check evaluate result from sessionStorage tokens
    if (rendered.result && rendered.result !== "[]") {
      try {
        var parsed = JSON.parse(rendered.result);
        if (Array.isArray(parsed) && parsed.length > 0) {
          imageUrls = parsed;
        }
      } catch (e) {}
    }

    // 2. Fall back to network-captured resources
    if (imageUrls.length === 0 && Array.isArray(rendered.resources) && rendered.resources.length > 0) {
      var resSeen = new Set();
      for (var r = 0; r < rendered.resources.length; r++) {
        var rUrl = rendered.resources[r];
        if (!resSeen.has(rUrl)) {
          resSeen.add(rUrl);
          imageUrls.push(rUrl);
        }
      }
    }

    // 3. Fall back to parsing images in the rendered HTML DOM
    if (imageUrls.length === 0 && rendered.html) {
      var doc = await host.parse(rendered.html);
      var domImgs = await doc.select("img.reader-image, .reader img, img[src*='/books/page/']");
      for (var j = 0; j < domImgs.length; j++) {
        var src = domImgs[j].attributes["src"] || domImgs[j].attributes["data-src"];
        if (src && imageUrls.indexOf(src) === -1) {
          imageUrls.push(src.startsWith("http") ? src : (BASE + src));
        }
      }
    }

    if (imageUrls.length === 0) {
      throw new Error("No images found for this chapter. Kagane may require completing a Cloudflare check in the in-app browser.");
    }

    return imageUrls.map(function (url, index) {
      return {
        index: index,
        imageUrl: url,
      };
    });
  },
};
