const addresses = [
  "965a Huỳnh Tấn Phát, Quận 7, Thành phố Hồ Chí Minh",
  "Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh",
  "Huỳnh Tấn Phát, Quận 7"
];

// Usage: MAPTILER_KEY=<key> node test-geocode.js
const apiKey = process.env.MAPTILER_KEY;
if (!apiKey) {
  console.error("Set MAPTILER_KEY before running this script.");
  process.exit(1);
}

async function test() {
  for (const address of addresses) {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${apiKey}&limit=1&country=vn`;
    console.log("Testing:", address);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        console.log(" -> Result:", data.features[0].place_name, "| Coords:", data.features[0].center, "| Relevance:", data.features[0].relevance);
      } else {
        console.log(" -> No results");
      }
    } catch (e) {
      console.log(" -> Error:", e.message);
    }
  }
}

test();
