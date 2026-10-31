import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PORTAL_URL = "https://web.cslb.ca.gov/onlineservices/dataportal/ContractorList";
const outputDirectory = path.resolve(process.env.CSLB_DATA_DIR ?? ".data/cslb");

export const downloads = [
  {
    code: "M",
    eventTarget: "ctl00$MainContent$lbMasterCSV",
    filename: "license-master.csv",
  },
  {
    code: "P",
    eventTarget: "ctl00$MainContent$lbtnPersonnelcsv",
    filename: "personnel.csv",
  },
  {
    code: "W",
    eventTarget: "ctl00$MainContent$lbWorkerCompcsv",
    filename: "workers-comp.csv",
  },
];

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseAttributes(tag) {
  const attributes = new Map();
  const expression = /([:\w-]+)=(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(expression)) {
    attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? ""));
  }
  return attributes;
}

function hiddenFields(html) {
  const fields = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.get("type")?.toLowerCase() !== "hidden") continue;
    const name = attributes.get("name");
    if (name) fields.set(name, attributes.get("value") ?? "");
  }
  return fields;
}

function mergeCookies(current, response) {
  const cookies = new Map(
    current
      .split(/;\s*/)
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [item.slice(0, index), item.slice(index + 1)];
      }),
  );

  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0];
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }

  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(url, options = {}, cookie = "") {
  const headers = new Headers(options.headers);
  headers.set("User-Agent", "CaliforniaContractorSearch/0.1 (+official CSLB public-data importer)");
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(url, { ...options, headers, redirect: "follow", signal: AbortSignal.timeout(120_000) });
  const nextCookie = mergeCookies(cookie, response);
  if (!response.ok) {
    throw new Error(`CSLB request failed with HTTP ${response.status} for ${url}`);
  }
  return { response, cookie: nextCookie };
}

async function selectDataset(html, cookie, code) {
  const form = hiddenFields(html);
  form.set("__EVENTTARGET", "ctl00$MainContent$ddlStatus");
  form.set("__EVENTARGUMENT", "");
  form.set("ctl00$MainContent$ddlStatus", code);

  const { response, cookie: nextCookie } = await request(
    PORTAL_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
    cookie,
  );
  return { html: await response.text(), cookie: nextCookie };
}

export async function selectedDataset(dataset) {
  const initial = await request(PORTAL_URL);
  return selectDataset(await initial.response.text(), initial.cookie, dataset.code);
}

export async function downloadDataset(dataset, directory = outputDirectory) {
  const selected = await selectedDataset(dataset);
  const form = hiddenFields(selected.html);
  form.set("__EVENTTARGET", dataset.eventTarget);
  form.set("__EVENTARGUMENT", "");
  form.set("ctl00$MainContent$ddlStatus", dataset.code);

  const { response } = await request(
    PORTAL_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
    selected.cookie,
  );

  if (!response.body) throw new Error(`CSLB returned an empty body for ${dataset.filename}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`CSLB returned HTML instead of ${dataset.filename}; its download form may have changed`);
  }

  const destination = path.join(directory, dataset.filename);
  const temporary = `${destination}.part`;
  await rm(temporary, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, destination);
  const file = await stat(destination);
  console.log(`${dataset.filename}: ${(file.size / 1024 / 1024).toFixed(1)} MiB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await mkdir(outputDirectory, { recursive: true });
  for (const dataset of downloads) await downloadDataset(dataset);
  console.log(`CSLB files saved to ${outputDirectory}`);
}
