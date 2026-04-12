// ── Config ────────────────────────────────────────────────────────────────────
const CSV_PATH   = "grp_boxplot_data.csv";
const X_COL      = "Disorder Subclass";
const Y_COLS = ["White Blood cell count (thousand per microliter)", "Blood cell count (mcL)"];
const COLOR      = "#378ADD";

// ── Dimensions ────────────────────────────────────────────────────────────────
const margin = { top: 40, right: 40, bottom: 120, left: 55 };
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
const xScale = d3.scaleBand().range([0, width]).padding(0.3);
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

// ── Draw one box ──────────────────────────────────────────────────────────────
function drawBox(g, stats, bw) {
  if (!stats) return;

  g.append("line")
    .attr("x1", bw / 2).attr("x2", bw / 2)
    .attr("y1", yScale(stats.min)).attr("y2", yScale(stats.q1))
    .attr("stroke", "#888").attr("stroke-width", 1.5);

  g.append("line")
    .attr("x1", bw / 2).attr("x2", bw / 2)
    .attr("y1", yScale(stats.q3)).attr("y2", yScale(stats.max))
    .attr("stroke", "#888").attr("stroke-width", 1.5);

  g.append("rect")
    .attr("x", 0).attr("width", bw)
    .attr("y", yScale(stats.q3))
    .attr("height", yScale(stats.q1) - yScale(stats.q3))
    .attr("fill", COLOR).attr("fill-opacity", 0.6)
    .attr("stroke", d3.color(COLOR).darker()).attr("stroke-width", 1);

  g.append("line")
    .attr("x1", 0).attr("x2", bw)
    .attr("y1", yScale(stats.median)).attr("y2", yScale(stats.median))
    .attr("stroke", d3.color(COLOR).darker(2)).attr("stroke-width", 2);

  ["min", "max"].forEach(stat => {
    g.append("line")
      .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
      .attr("y1", yScale(stats[stat])).attr("y2", yScale(stats[stat]))
      .attr("stroke", "#888").attr("stroke-width", 1.5);
  });
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw(data, yCol) {
  svg.selectAll(".box-group").remove();

  // Get sorted unique subclasses
  const subclasses = [...new Set(data.map(d => d[X_COL]).filter(Boolean))].sort();

  const nested = {};
  subclasses.forEach(sub => {
    const vals = data
      .filter(d => d[X_COL] === sub)
      .map(d => +d[yCol])
      .filter(d => !isNaN(d));
    nested[sub] = boxStats(vals);
  });

  // Update scales
  xScale.domain(subclasses);
  const allStats = Object.values(nested).filter(Boolean);
  yScale.domain([
    d3.min(allStats, d => d.min) * 0.95,
    d3.max(allStats, d => d.max) * 1.05,
  ]).nice();

  // Axes
  xAxisG.transition().duration(400)
    .call(d3.axisBottom(xScale).tickSize(0))
    .selectAll("text")
    .style("font-size", "11px")
    .attr("transform", "rotate(-30)")
    .style("text-anchor", "end");

  yAxisG.transition().duration(400)
    .call(d3.axisLeft(yScale).ticks(6));

  // Render boxes
  subclasses.forEach(sub => {
    const g = svg.append("g")
      .attr("class", "box-group")
      .attr("transform", `translate(${xScale(sub)},0)`);
    drawBox(g, nested[sub], xScale.bandwidth());
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