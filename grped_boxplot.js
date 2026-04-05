// ── Config ────────────────────────────────────────────────────────────────────
const CSV_PATH   = "grp_boxplot_data.csv";
const GROUP_COLS = ["H/O serious maternal illness", "H/O radiation exposure (x-ray)", "H/O substance abuse"];
const Y_COLS     = ["Blood cell count (mcL)", "White Blood cell count (thousand per microliter)"];
const COLORS     = { Yes: "#378ADD", No: "#E24B4A" };

// ── Dimensions ────────────────────────────────────────────────────────────────
const margin = { top: 40, right: 80, bottom: 80, left: 55 };
const width  = 750 - margin.left - margin.right;
const height = 440 - margin.top  - margin.bottom;

// ── SVG ───────────────────────────────────────────────────────────────────────
const svg = d3.select("#boxplot-chart")
  .append("svg")
  .attr("width",  width  + margin.left + margin.right)
  .attr("height", height + margin.top  + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const xAxisG = svg.append("g").attr("transform", `translate(0,${height})`);
const yAxisG = svg.append("g");

// ── Scales ────────────────────────────────────────────────────────────────────
// xOuter: one band per H/O variable
const xOuter = d3.scaleBand().range([0, width]).padding(0.3);
// xInner: one band per Yes/No within each outer band
const xInner = d3.scaleBand().domain(["Yes", "No"]).padding(0.1);
const yScale = d3.scaleLinear().range([height, 0]);

// ── Stats helper ──────────────────────────────────────────────────────────────
function boxStats(values) {
  const sorted = values.slice().sort(d3.ascending);
  if (!sorted.length) return null;
  return {
    q1:     d3.quantile(sorted, 0.25),
    median: d3.quantile(sorted, 0.50),
    q3:     d3.quantile(sorted, 0.75),
    min:    sorted[0],
    max:    sorted[sorted.length - 1],
  };
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
const select = d3.select("#boxplot-select");
Y_COLS.forEach(col => select.append("option").attr("value", col).text(col));
select.on("change", () => draw(dataset, select.property("value")));

// ── Legend ────────────────────────────────────────────────────────────────────
function renderLegend() {
  const legend = svg.append("g")
    .attr("transform", `translate(${width + 10}, 0)`);
  ["Yes", "No"].forEach((label, i) => {
    const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
    row.append("rect").attr("width", 12).attr("height", 12)
      .attr("fill", COLORS[label]).attr("fill-opacity", 0.7);
    row.append("text").attr("x", 18).attr("y", 10)
      .style("font-size", "12px").attr("fill", "#444")
      .text(label);
  });
}
renderLegend();

// ── Draw one box ──────────────────────────────────────────────────────────────
function drawBox(g, stats, color, bw) {
  if (!stats) return;

  g.append("line")   // lower whisker (min → q1)
    .attr("x1", bw / 2).attr("x2", bw / 2)
    .attr("y1", yScale(stats.min)).attr("y2", yScale(stats.q1))
    .attr("stroke", "#888").attr("stroke-width", 1.5);

  g.append("line")   // upper whisker (q3 → max)
    .attr("x1", bw / 2).attr("x2", bw / 2)
    .attr("y1", yScale(stats.q3)).attr("y2", yScale(stats.max))
    .attr("stroke", "#888").attr("stroke-width", 1.5);

  g.append("rect")   // IQR box
    .attr("x", 0).attr("width", bw)
    .attr("y", yScale(stats.q3))
    .attr("height", yScale(stats.q1) - yScale(stats.q3))
    .attr("fill", color).attr("fill-opacity", 0.6)
    .attr("stroke", d3.color(color).darker()).attr("stroke-width", 1);

  g.append("line")   // median
    .attr("x1", 0).attr("x2", bw)
    .attr("y1", yScale(stats.median)).attr("y2", yScale(stats.median))
    .attr("stroke", d3.color(color).darker(2)).attr("stroke-width", 2);

  ["min", "max"].forEach(stat => {  // whisker caps
    g.append("line")
      .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
      .attr("y1", yScale(stats[stat])).attr("y2", yScale(stats[stat]))
      .attr("stroke", "#888").attr("stroke-width", 1.5);
  });
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw(data, yCol) {
  svg.selectAll(".box-group").remove(); 

  const nested = {};
  GROUP_COLS.forEach(col => {
    nested[col] = {};
    ["Yes", "No"].forEach(yn => {
      const vals = data
        .filter(d => d[col] === yn)
        .map(d => +d[yCol])
        .filter(d => !isNaN(d));
      nested[col][yn] = boxStats(vals);
    });
  });

  // Update scales
  xOuter.domain(GROUP_COLS);
  xInner.range([0, xOuter.bandwidth()]);

  const allStats = Object.values(nested).flatMap(g => Object.values(g)).filter(Boolean);
  yScale.domain([
    d3.min(allStats, d => d.min) * 0.95,
    d3.max(allStats, d => d.max) * 1.05,
  ]).nice();

  // Axes
  xAxisG.transition().duration(400)
    .call(d3.axisBottom(xOuter).tickSize(0))
    .selectAll("text")
    .style("font-size", "11px")
    .attr("transform", "rotate(-15)")
    .style("text-anchor", "end");

  yAxisG.transition().duration(400)
    .call(d3.axisLeft(yScale).ticks(6));

  // Render outer groups
  GROUP_COLS.forEach(col => {
    const outerG = svg.append("g")
      .attr("class", "box-group")
      .attr("transform", `translate(${xOuter(col)},0)`);

    ["Yes", "No"].forEach(yn => {
      const innerG = outerG.append("g")
        .attr("transform", `translate(${xInner(yn)},0)`);
      drawBox(innerG, nested[col][yn], COLORS[yn], xInner.bandwidth());
    });
  });
}

// ── Load ──────────────────────────────────────────────────────────────────────
let dataset;
fetch(CSV_PATH)
  .then(r => r.text())
  .then(text => {
    dataset = d3.csvParse(text, d3.autoType);
    draw(dataset, Y_COLS[0]);
  });