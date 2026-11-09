/* Simcoe Market Intel — regional housing stats
   Update monthly. Prices = average sold price. dom = average days on market (listing).
   Each type: [sales, avgPrice] or null when no sales / not published.
   status: "live" = numbers below are published; "pending" = waiting on data. */
window.MARKET_DATA = {
  month: "October 2026", /* default; a region can set its own month */
  minSales: 5, // types with fewer sales are shown as "limited sales"
  regions: [
    { id: "toronto", name: "City of Toronto", group: "GTA", lat: 43.700, lng: -79.400, status: "live",
      sales: 2184, avg: 1075627, dom: 30,
      types: { detached: [741, 1603886], semi: [266, 1225229], town: [80, 1244686], condoTown: [137, 742764], condoApt: [949, 659214] },
      source: "TRREB Market Watch, October 2026" },
    { id: "york", name: "York Region", group: "GTA", lat: 43.960, lng: -79.450, status: "live",
      sales: 1038, avg: 1142789, dom: 33,
      types: { detached: [596, 1413877], semi: [69, 936170], town: [148, 961875], condoTown: [52, 698336], condoApt: [163, 549951] },
      source: "TRREB Market Watch, October 2026" },
    { id: "peel", name: "Peel Region", group: "GTA", lat: 43.700, lng: -79.760, status: "live",
      sales: 1017, avg: 898431, dom: 33,
      types: { detached: [504, 1126231], semi: [153, 826306], town: [81, 769571], condoTown: [122, 652742], condoApt: [152, 485658] },
      source: "TRREB Market Watch, October 2026" },
    { id: "durham", name: "Durham Region", group: "GTA", lat: 43.960, lng: -78.950, status: "live",
      sales: 589, avg: 793024, dom: 29,
      types: { detached: [407, 875260], semi: [23, 617652], town: [75, 694156], condoTown: [42, 524852], condoApt: [33, 466698] },
      source: "TRREB Market Watch, October 2026" },
    { id: "halton", name: "Halton Region", group: "GTA", lat: 43.500, lng: -79.880, status: "live",
      sales: 592, avg: 1138684, dom: 34,
      types: { detached: [312, 1473177], semi: [25, 867720], town: [99, 870512], condoTown: [68, 713451], condoApt: [83, 647687] },
      source: "TRREB Market Watch, October 2026" },
    { id: "innisfil", name: "Innisfil", group: "Simcoe County", lat: 44.300, lng: -79.580, status: "live",
      sales: 40, avg: 800697, dom: 39,
      types: { detached: [34, 814735], semi: null, town: [4, 875470], condoTown: null, condoApt: [2, 412500] },
      source: "TRREB Market Watch, October 2026" },
    { id: "barrie", name: "Barrie", group: "Simcoe County", lat: 44.389, lng: -79.690, status: "live",
      sales: 130, avg: 686941, median: 637500, benchmark: 617100, benchmarkChg: -5.1, dom: 40, spLp: 98,
      /* type prices: midpoint of recent ranges from listing sites — approximate, no sales counts */
      types: { detached: [null, 730500], semi: [null, 610000], town: [null, 548500], condoTown: null, condoApt: [null, 473500] },
      typesNote: "Home-type prices are approximate midpoints of recent sold-price ranges from public listing sites, not TRREB October figures.",
      month: "September 2026",
      source: "TRREB Simcoe County Market Watch, September 2026" },
    { id: "springwater", name: "Springwater", group: "Simcoe County", lat: 44.490, lng: -79.800, status: "pending",
      source: "TRREB Simcoe County Market Watch" },
    { id: "oro-medonte", name: "Oro-Medonte", group: "Simcoe County", lat: 44.540, lng: -79.560, status: "live",
      sales: 20, avg: 894945, median: 860000, benchmark: 800800, benchmarkChg: -5.8, dom: 41, spLp: 97,
      types: null,
      month: "September 2026",
      source: "TRREB Simcoe County Market Watch, September 2026" },
    { id: "orillia", name: "Orillia", group: "Simcoe County", lat: 44.608, lng: -79.420, status: "live",
      sales: 54, avg: 568124, median: 543500, benchmark: 506100, benchmarkChg: -5.1, dom: 40, spLp: 96,
      /* -1 = exact price, sales count not reported */
      types: { detached: [-1, 645633], semi: null, town: [-1, 615261], condoTown: [-1, 486325], condoApt: [-1, 587070] },
      typesNote: "Home-type prices from MLS® data. Sales counts by type not shown.",
      month: "September 2026",
      source: "TRREB Simcoe County Market Watch, September 2026" },
    { id: "collingwood", name: "Collingwood", group: "Simcoe County", lat: 44.500, lng: -80.217, status: "pending",
      source: "TRREB Simcoe County Market Watch" },
    { id: "muskoka", name: "Muskoka", group: "Cottage Country", lat: 45.040, lng: -79.310, status: "pending",
      source: "Local board / MLS data" },
    { id: "grey", name: "Grey County", group: "Grey County", lat: 44.420, lng: -80.700, status: "pending",
      source: "Local board / MLS data" }
  ]
};
