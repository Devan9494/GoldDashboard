import express from "express";

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

app.use(express.static("public"));

async function alphaVantage(params) {
  if (!apiKey) {
    throw new Error("Alpha Vantage API key is not configured");
  }

  const url = new URL("https://www.alphavantage.co/query");

  for (const [key, value] of Object.entries({
    ...params,
    apikey: apiKey
  })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Alpha Vantage HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  if (data["Note"]) {
    throw new Error(data["Note"]);
  }

  return data;
}

function latestValue(data) {
  const rows = Object.entries(data || {})
    .filter(([date, value]) =>
      /^\d{4}-\d{2}-\d{2}/.test(date) &&
      value &&
      typeof value === "object"
    )
    .sort((a, b) => b[0].localeCompare(a[0]));

  if (!rows.length) return null;

  const row = rows[0][1];

  for (const key of [
    "value",
    "2. high",
    "10. year treasury yield",
    "1. open"
  ]) {
    if (row[key] !== undefined && row[key] !== "") {
      return Number(row[key]);
    }
  }

  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    alphaVantageConfigured: Boolean(apiKey)
  });
});

app.get("/api/macro", async (_req, res) => {
  const result = {
    fetchedAt: new Date().toISOString(),
    values: {},
    sources: {}
  };

  const requests = [
    [
      "gold",
      {
        function: "GOLD_SILVER_SPOT",
        symbol: "GOLD"
      }
    ],
    [
      "us2y",
      {
        function: "TREASURY_YIELD",
        interval: "daily",
        maturity: "2year"
      }
    ],
    [
      "us10y",
      {
        function: "TREASURY_YIELD",
        interval: "daily",
        maturity: "10year"
      }
    ],
    [
      "fed",
      {
        function: "FEDERAL_FUNDS_RATE",
        interval: "daily"
      }
    ],
    [
      "cpi",
      {
        function: "CPI",
        interval: "monthly"
      }
    ]
  ];

  for (const [name, params] of requests) {
    try {
      const data = await alphaVantage(params);

      let value = null;

      if (name === "gold") {
        value = Number(
          data.price ??
          data["Gold Spot Price"] ??
          data.data?.[0]?.value
        );
      } else {
        value = latestValue(data.data || data);
      }

      result.values[name] =
        Number.isFinite(value) ? value : null;

      result.sources[name] = "Alpha Vantage";
    } catch (error) {
      result.values[name] = null;
      result.sources[name] = error.message;
    }
  }

  result.values.dxy = null;
  result.sources.dxy = "TradingView";

  res.json(result);
});

app.get("*", (_req, res) => {
  res.sendFile("index.html", {
    root: "public"
  });
});

app.listen(port, () => {
  console.log(`Gold Macro Dashboard running on port ${port}`);
});
