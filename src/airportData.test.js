import test from "node:test";
import assert from "node:assert/strict";
import { AIRPORT_CATALOG, AIRPORTS, getAirportByCode, searchAirports } from "./airportData.js";

test("airport catalog keeps the checker tuple data aligned", () => {
  assert.equal(AIRPORT_CATALOG.length, AIRPORTS.length);
  assert.ok(AIRPORT_CATALOG.length >= 50);
  assert.deepEqual(AIRPORTS.find(([code]) => code === "DXB"), ["DXB", "Dubai", 25.25, 55.36, "INT"]);
});

test("airport lookup includes presentation metadata", () => {
  assert.deepEqual(getAirportByCode("LHR"), {
    iata: "LHR",
    city: "London",
    country: "United Kingdom",
    airportName: "Heathrow Airport",
    lat: 51.47,
    lon: -0.45,
    region: "UK",
  });
  assert.equal(getAirportByCode("XXX"), null);
});

test("airport search matches IATA, city, country, and full airport name", () => {
  assert.equal(searchAirports("dxb")[0].city, "Dubai");
  assert.ok(searchAirports("united arab emirates").some(({ iata }) => iata === "AUH"));
  assert.ok(searchAirports("heathrow").some(({ iata }) => iata === "LHR"));
  assert.ok(searchAirports("london").some(({ iata }) => iata === "LGW"));
});

test("airport search excludes the opposite field and respects its limit", () => {
  assert.ok(!searchAirports("london", "LHR").some(({ iata }) => iata === "LHR"));
  assert.equal(searchAirports("", "", 5).length, 5);
});
