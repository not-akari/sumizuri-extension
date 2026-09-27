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
      browserPage: BASE + "/",
    });
    if (res.body) {
      if (res.body.includes("Just a moment...") || res.body.includes("cf_chl")) {
        throw new Error("__CHALLENGE__:" + BASE + "/");
      }
      return { html: res.body, fromFetch: true };
    }
  } catch (e) {
    if (e && e.message && e.message.includes("__CHALLENGE__")) {
      throw new Error("__CHALLENGE__:" + BASE + "/");
    }
  }

  try {
    var rendered = await host.render(url, {
      waitFor: waitFor || "a[href*='/series/'], #__next",
      userAgent: HEADERS["User-Agent"],
      timeout: 25000,
    });
    return { html: rendered.html, fromFetch: false };
  } catch (err) {
    if (
      err &&
      err.message &&
      (err.message.includes("could not be loaded") ||
        err.message.includes("WebErrorStatus") ||
        err.message.includes("__CHALLENGE__"))
    ) {
      throw new Error("__CHALLENGE__:" + BASE + "/");
    }
    throw err;
  }
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
          browserPage: BASE + "/",
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
      } catch (e) {
        if (e && e.message && e.message.includes("__CHALLENGE__")) {
          throw new Error("__CHALLENGE__:" + BASE + "/");
        }
      }
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
          browserPage: BASE + "/",
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
              // Kagane uses /reader/[bookId] directly
              var chUrl = BASE + "/reader/" + bookId;
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
      } catch (e) {
        if (e && e.message && e.message.includes("__CHALLENGE__")) {
          throw new Error("__CHALLENGE__:" + BASE + "/");
        }
      }
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
      var chFull = BASE + "/reader/" + bookId;

      chapters.push({
        url: chFull,
        title: titleText || ("Chapter " + (num !== undefined ? num : "")),
        number: isNaN(num) ? undefined : num,
      });
    }

    return chapters;
  },

  getPageList: async function (chapterUrl) {
    var bookId = extractBookId(chapterUrl);
    // Normalize to direct reader URL
    var fullUrl = bookId ? (BASE + "/reader/" + bookId) : (chapterUrl.startsWith("http") ? chapterUrl : (BASE + chapterUrl));

    // 1. Probe host.fetch first.
    // If Cloudflare is active and not yet solved, this throws __CHALLENGE__ pointing to BASE + "/"
    // so Sumizuri displays the interactive browser solver at https://kagane.to/
    var pageHtml = null;
    try {
      var probe = await host.fetch(fullUrl, {
        headers: HEADERS,
        browserPage: BASE + "/",
      });
      if (probe.body) {
        if (probe.body.includes("Just a moment...") || probe.body.includes("cf_chl")) {
          throw new Error("__CHALLENGE__:" + BASE + "/");
        }
        pageHtml = probe.body;
      }
    } catch (e) {
      if (e && e.message && e.message.includes("__CHALLENGE__")) {
        throw new Error("__CHALLENGE__:" + BASE + "/");
      }
    }

    // 2. Try parsing Next.js __NEXT_DATA__ or DOM images from fetched HTML
    if (pageHtml) {
      try {
        var match = pageHtml.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
        if (match) {
          var nextData = JSON.parse(match[1]);
          if (nextData && nextData.props && nextData.props.pageProps) {
            var pp = nextData.props.pageProps;
            var rawPages = pp.pages || (pp.book && pp.book.pages) || (pp.chapter && pp.chapter.pages) || pp.images;
            if (Array.isArray(rawPages) && rawPages.length > 0) {
              var list = [];
              for (var p = 0; p < rawPages.length; p++) {
                var item = rawPages[p];
                var imgUrl = typeof item === 'string' ? item : (item.url || item.imageUrl || item.image_url || item.src);
                if (!imgUrl && item.page_id && item.token) {
                  imgUrl = BASE + "/api/v2/books/page/" + (bookId || item.book_id) + "/" + item.page_id + (item.ext ? "." + item.ext : ".jpg") + "?token=" + item.token;
                } else if (!imgUrl && item.image_id) {
                  imgUrl = BASE + "/api/v2/image/" + item.image_id;
                }
                if (imgUrl) {
                  list.push({
                    index: list.length,
                    imageUrl: imgUrl.startsWith("http") ? imgUrl : (BASE + imgUrl),
                  });
                }
              }
              if (list.length > 0) return list;
            }
          }
        }
      } catch (e) {}

      try {
        var doc = await host.parse(pageHtml);
        var imgs = await doc.select("img.reader-image, .reader img, img[src*='/books/page/'], img[src*='/api/v2/image/']");
        var domUrls = [];
        for (var i = 0; i < imgs.length; i++) {
          var src = imgs[i].attributes["src"] || imgs[i].attributes["data-src"];
          if (src && domUrls.indexOf(src) === -1) {
            domUrls.push(src.startsWith("http") ? src : (BASE + src));
          }
        }
        if (domUrls.length > 0) {
          return domUrls.map(function (u, idx) {
            return { index: idx, imageUrl: u };
          });
        }
      } catch (e) {}
    }

    // 3. Try API directly if bookId is available
    if (bookId) {
      try {
        var apiRes = await host.fetch(BASE + "/api/v2/books/" + bookId, {
          headers: Object.assign({}, HEADERS, { Accept: "application/json" }),
          browserPage: BASE + "/",
        });
        if (apiRes.body && apiRes.body.startsWith("{")) {
          var bData = JSON.parse(apiRes.body);
          var bPages = bData.pages || bData.book_pages || bData.chapter_pages;
          if (Array.isArray(bPages) && bPages.length > 0) {
            var apiList = [];
            for (var bp = 0; bp < bPages.length; bp++) {
              var bItem = bPages[bp];
              var bUrl = typeof bItem === 'string' ? bItem : (bItem.url || bItem.imageUrl || bItem.image_url || bItem.src);
              if (!bUrl && bItem.page_id && bItem.token) {
                bUrl = BASE + "/api/v2/books/page/" + bookId + "/" + bItem.page_id + (bItem.ext ? "." + bItem.ext : ".jpg") + "?token=" + bItem.token;
              } else if (!bUrl && bItem.image_id) {
                bUrl = BASE + "/api/v2/image/" + bItem.image_id;
              }
              if (bUrl) {
                apiList.push({
                  index: apiList.length,
                  imageUrl: bUrl.startsWith("http") ? bUrl : (BASE + bUrl),
                });
              }
            }
            if (apiList.length > 0) return apiList;
          }
        }
      } catch (e) {
        if (e && e.message && e.message.includes("__CHALLENGE__")) {
          throw new Error("__CHALLENGE__:" + BASE + "/");
        }
      }
    }

    // 4. Render in WebView2 with full browser user-agent and script evaluation
    var script = `(function() {
      try {
        if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps) {
          var pp = window.__NEXT_DATA__.props.pageProps;
          var p = pp.pages || (pp.book && pp.book.pages) || (pp.chapter && pp.chapter.pages) || pp.images;
          if (Array.isArray(p) && p.length > 0) return JSON.stringify(p);
        }
      } catch (e) {}

      try {
        var raw = sessionStorage.getItem('kagane_drm_tokens');
        if (raw) return raw;
      } catch (e) {}

      try {
        var tokens = {};
        for (var k in sessionStorage) {
          if (k.indexOf('drm_') === 0 || k.indexOf('token_') === 0) {
            tokens[k] = sessionStorage.getItem(k);
          }
        }
        if (Object.keys(tokens).length > 0) return JSON.stringify(tokens);
      } catch (e) {}

      try {
        var imgs = Array.from(document.querySelectorAll('img.reader-image, .reader img, img[src*="/books/page/"]'));
        var urls = imgs.map(function(i) { return i.src || i.dataset.src; }).filter(Boolean);
        if (urls.length > 0) return JSON.stringify(urls);
      } catch (e) {}

      return '[]';
    })()`;

    var rendered;
    try {
      rendered = await host.render(fullUrl, {
        waitFor: "img.reader-image, .reader, #reader, canvas, .page, #__next",
        waitForResource: /\/api\/v2\/books\/page\//,
        capture: /\/api\/v2\/books\/page\/[^\s"']+/,
        script: script,
        userAgent: HEADERS["User-Agent"],
        timeout: 25000,
      });
    } catch (err) {
      if (
        err &&
        err.message &&
        (err.message.includes("could not be loaded") ||
          err.message.includes("WebErrorStatus") ||
          err.message.includes("__CHALLENGE__"))
      ) {
        throw new Error("__CHALLENGE__:" + BASE + "/");
      }
      throw err;
    }

    var imageUrls = [];

    // Check evaluate result
    if (rendered.result && rendered.result !== "[]") {
      try {
        var parsed = JSON.parse(rendered.result);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (var pi = 0; pi < parsed.length; pi++) {
            var pVal = parsed[pi];
            var u = typeof pVal === 'string' ? pVal : (pVal.url || pVal.imageUrl || pVal.src);
            if (!u && pVal.page_id && pVal.token) {
              u = BASE + "/api/v2/books/page/" + (bookId || pVal.book_id) + "/" + pVal.page_id + (pVal.ext ? "." + pVal.ext : ".jpg") + "?token=" + pVal.token;
            } else if (!u && pVal.image_id) {
              u = BASE + "/api/v2/image/" + pVal.image_id;
            }
            if (u && imageUrls.indexOf(u) === -1) {
              imageUrls.push(u.startsWith("http") ? u : (BASE + u));
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          for (var tKey in parsed) {
            var tok = parsed[tKey];
            var pId = tKey.replace(/^(drm_|token_)/, '');
            if (pId && tok) {
              var genUrl = "https://kstatic.to/api/v2/books/page/" + bookId + "/" + pId + ".jpg?token=" + tok;
              if (imageUrls.indexOf(genUrl) === -1) imageUrls.push(genUrl);
            }
          }
        }
      } catch (e) {}
    }

    // Check captured resources
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

    // Check rendered HTML
    if (imageUrls.length === 0 && rendered.html) {
      var rDoc = await host.parse(rendered.html);
      var domImgs = await rDoc.select("img.reader-image, .reader img, img[src*='/books/page/'], img[src*='/api/v2/image/']");
      for (var j = 0; j < domImgs.length; j++) {
        var rSrc = domImgs[j].attributes["src"] || domImgs[j].attributes["data-src"];
        if (rSrc && imageUrls.indexOf(rSrc) === -1) {
          imageUrls.push(rSrc.startsWith("http") ? rSrc : (BASE + rSrc));
        }
      }
    }

    if (imageUrls.length === 0) {
      throw new Error("__CHALLENGE__:" + BASE + "/");
    }

    return imageUrls.map(function (url, index) {
      return {
        index: index,
        imageUrl: url,
      };
    });
  },
};
