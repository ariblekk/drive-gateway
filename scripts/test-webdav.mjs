import assert from "node:assert/strict";

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderPropResponse(item) {
  const lastModified = new Date(item.updatedAt ?? Date.now()).toUTCString();
  const creationDate = new Date(item.createdAt ?? Date.now()).toISOString();

  return `  <D:response>
    <D:href>${escapeXml(item.href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(item.name)}</D:displayname>
        <D:resourcetype>${item.isCollection ? "<D:collection/>" : ""}</D:resourcetype>
        ${
          !item.isCollection && item.size !== undefined
            ? `<D:getcontentlength>${item.size}</D:getcontentlength>`
            : ""
        }
        ${
          !item.isCollection && item.mimeType
            ? `<D:getcontenttype>${escapeXml(item.mimeType)}</D:getcontenttype>`
            : ""
        }
        <D:getlastmodified>${lastModified}</D:getlastmodified>
        <D:creationdate>${creationDate}</D:creationdate>
        ${item.etag ? `<D:getetag>"${escapeXml(item.etag)}"</D:getetag>` : ""}
        <D:supportedlock>
          <D:lockentry>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:locktype><D:write/></D:locktype>
          </D:lockentry>
        </D:supportedlock>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

function parseDestinationSegments(destinationHeader, basePrefix) {
  let pathname = destinationHeader;
  try {
    if (
      destinationHeader.startsWith("http://") ||
      destinationHeader.startsWith("https://")
    ) {
      pathname = new URL(destinationHeader).pathname;
    }
  } catch {
    // fallback
  }

  if (pathname.startsWith(basePrefix)) {
    pathname = pathname.slice(basePrefix.length);
  } else if (pathname.startsWith("/webdav")) {
    pathname = pathname.slice("/webdav".length);
  } else if (pathname.startsWith("/api/webdav")) {
    pathname = pathname.slice("/api/webdav".length);
  }

  return decodeURIComponent(pathname)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

// 1. Test XML escaping & response rendering
const xmlItem = renderPropResponse({
  href: "/webdav/default/my folder/file & test.txt",
  name: "file & test.txt",
  isCollection: false,
  size: 1024,
  mimeType: "text/plain",
  updatedAt: 1700000000000,
  createdAt: 1700000000000,
  etag: "abc-123",
});

assert.ok(xmlItem.includes("&amp;"), "Should escape & character");
assert.ok(xmlItem.includes("<D:getcontentlength>1024</D:getcontentlength>"), "Should contain content length");
assert.ok(xmlItem.includes("<D:supportedlock>"), "Should declare supported locks");
assert.ok(!xmlItem.includes("<D:collection/>"), "File should not be collection");

// 2. Test collection XML rendering
const xmlColl = renderPropResponse({
  href: "/webdav/default/",
  name: "default",
  isCollection: true,
  updatedAt: 1700000000000,
  createdAt: 1700000000000,
});
assert.ok(xmlColl.includes("<D:collection/>"), "Collection should have collection tag");
assert.ok(!xmlColl.includes("<D:getcontentlength>"), "Collection should not have content length");

// 3. Test Destination header parsing
const dest1 = parseDestinationSegments("http://localhost:3000/webdav/default/documents/test.pdf", "/webdav");
assert.deepEqual(dest1, ["default", "documents", "test.pdf"], "Should parse full URL destination");

const dest2 = parseDestinationSegments("/webdav/photos/sub/img.jpg", "/webdav");
assert.deepEqual(dest2, ["photos", "sub", "img.jpg"], "Should parse relative path destination");

const dest3 = parseDestinationSegments("https://example.com/api/webdav/default/file.txt", "/api/webdav");
assert.deepEqual(dest3, ["default", "file.txt"], "Should parse /api/webdav destination");

console.log("WebDAV unit assertions passed successfully.");
