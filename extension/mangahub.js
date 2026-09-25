var BASE = "https://mangahub.io";
var API = "https://api.mghcdn.com/graphql";
var THUMBS = "https://thumb.mghcdn.com/";
var IMAGES = "https://imgx.mghcdn.com/";
var SOURCE = "m01";
var PAGE_SIZE = 30;

var HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Origin: BASE,
  Referer: BASE + "/",
};

// The API asks for an access token on every chapter request and limits each
// token to a few of them at a time. The site hands one to each visitor in a
// cookie; this keeps one per install, the way a browser would, so it is
// never rotated to get around the limit.
async function accessToken() {
  var saved = await host.storage.get("access");
  if (saved) return saved;

  var token = null;
  try {
    var home = await host.fetch(BASE + "/", {
      method: "GET",
      headers: { "User-Agent": HEADERS["User-Agent"] },
    });
    var cookie = String((home.headers && home.headers["set-cookie"]) || "");
    var found = /mhub_access=([0-9a-fA-F]+)/.exec(cookie);
    if (found) token = found[1];
  } catch (e) {
    // The home page is only a source for the token; make one instead.
  }
  if (!token) {
    token = "";
    for (var i = 0; i < 32; i++) {
      token += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    }
  }
  await host.storage.set("access", token);
  return token;
}

async function graphql(query, withToken) {
  var headers = {};
  Object.keys(HEADERS).forEach(function (key) {
    headers[key] = HEADERS[key];
  });
  if (withToken) headers["x-mhub-access"] = await accessToken();

  var response = await host.fetch(API, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ query: query }),
  });
  var json = JSON.parse(response.body);
  if (json.errors && json.errors.length) {
    var message = String(json.errors[0].message || "MangaHub returned an error");
    if (/rate limit/i.test(message)) {
      throw new Error(
        "MangaHub is limiting how fast chapters can be opened. Wait a few minutes and try again."
      );
    }
    if (!json.data) throw new Error(message);
  }
  return json.data;
}

function literal(value) {
  return JSON.stringify(String(value));
}

function slugOf(url) {
  return String(url).replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop();
}

function capitalize(text) {
  text = String(text || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toEntry(row) {
  return {
    url: BASE + "/manga/" + row.slug,
    title: row.title,
    coverUrl: row.image ? THUMBS + row.image : null,
    webUrl: BASE + "/manga/" + row.slug,
    author: row.author || undefined,
    status: row.status ? capitalize(row.status) : undefined,
    genres: row.genres
      ? String(row.genres)
          .split(",")
          .map(function (g) {
            return g.trim();
          })
          .filter(Boolean)
      : undefined,
  };
}

var LIST_FIELDS = "id title slug image author status genres";

async function browse(query, mode, page) {
  var data = await graphql(
    "{search(x:" +
      SOURCE +
      ",q:" +
      literal(query) +
      ',genre:"all",mod:' +
      mode +
      ",count:true,offset:" +
      (page - 1) * PAGE_SIZE +
      "){rows{" +
      LIST_FIELDS +
      "}}}",
    false
  );
  return ((data.search && data.search.rows) || []).map(toEntry);
}

var extension = {
  name: "MangaHub",
  lang: "en",
  baseUrl: BASE,
  iconUrl: BASE + "/apple-touch-icon.png",
  rateLimitMs: 1500,

  search: function (query, page) {
    return browse(query, "ALPHABET", page || 1);
  },

  getPopular: function (page) {
    return browse("", "POPULAR", page || 1);
  },

  getLatest: async function (page) {
    var data = await graphql(
      "{latest(x:" +
        SOURCE +
        ",offset:" +
        ((page || 1) - 1) * PAGE_SIZE +
        ",limit:" +
        PAGE_SIZE +
        "){id title slug image latestChapter}}",
      false
    );
    return (data.latest || []).map(toEntry);
  },

  getDetails: async function (entryUrl) {
    var data = await graphql(
      "{manga(x:" +
        SOURCE +
        ",slug:" +
        literal(slugOf(entryUrl)) +
        "){" +
        LIST_FIELDS +
        " artist description}}",
      false
    );
    var manga = data.manga;
    if (!manga) throw new Error("This title is no longer on MangaHub.");
    var entry = toEntry(manga);
    entry.description = manga.description || undefined;
    return entry;
  },

  getChapterList: async function (entryUrl) {
    var slug = slugOf(entryUrl);
    var data = await graphql(
      "{manga(x:" +
        SOURCE +
        ",slug:" +
        literal(slug) +
        "){chapters{number title date}}}",
      false
    );
    var chapters = (data.manga && data.manga.chapters) || [];
    return chapters
      .map(function (c) {
        return {
          url: BASE + "/chapter/" + slug + "/chapter-" + c.number,
          title: c.title || "Chapter " + c.number,
          number: c.number,
          dateUploaded: c.date || undefined,
        };
      })
      .sort(function (a, b) {
        return b.number - a.number;
      });
  },

  getPageList: async function (chapterUrl) {
    var found = /\/chapter\/([^\/]+)\/chapter-([0-9]+(?:\.[0-9]+)?)/.exec(
      String(chapterUrl)
    );
    if (!found) throw new Error("Not a MangaHub chapter address: " + chapterUrl);
    var data = await graphql(
      "{chapter(x:" +
        SOURCE +
        ",slug:" +
        literal(found[1]) +
        ",number:" +
        found[2] +
        "){pages}}",
      true
    );
    if (!data.chapter || !data.chapter.pages) {
      throw new Error("MangaHub has no pages for this chapter.");
    }
    var pages = JSON.parse(data.chapter.pages);
    return (pages.i || []).map(function (file, index) {
      return { index: index, imageUrl: IMAGES + pages.p + file };
    });
  },
};
