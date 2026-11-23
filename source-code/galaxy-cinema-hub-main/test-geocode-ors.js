const addresses = [
  "965a Huỳnh Tấn Phát, Quận 7, Thành phố Hồ Chí Minh",
  "Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh",
  "Galaxy Nguyễn Du, Quận 1, TP.HCM", // from screenshot
  "116 Nguyễn Du, Quận 1, TP.HCM", // from screenshot
];

// Usage: ORS_API_KEY=<key> node test-geocode-ors.js
async function test() {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    console.error("Set ORS_API_KEY before running this script.");
    process.exit(1);
  }
  for (const address of addresses) {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=VN`;
    console.log("Testing:", address);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        console.log(" -> Result:", data.features[0].properties.label, "| Coords:", data.features[0].geometry.coordinates);
      } else {
        console.log(" -> No results");
      }
    } catch (e) {
      console.log(" -> Error:", e.message);
    }
  }
}

test();
