// ── Color maps ────────────────────────────────────────────────────────────────
// Ancestral-level keys (used by "all" mode via a_origin_id)
const originColors = {
  "Both Ancestral Sides": { node: "#534AB7", link: "rgba(83,74,183,0.35)"  },
  "Maternal Only":        { node: "#185FA5", link: "rgba(24,95,165,0.35)"  },
  "Paternal Only":        { node: "#6d1111", link: "rgba(109,17,17,0.35)"  },
  "Neither Ancestral":    { node: "#888780", link: "rgba(136,135,128,0.35)"},

  "Both Parents":   { node: "#534AB7", link: "rgba(83,74,183,0.35)"  },
  "Mother Only":    { node: "#185FA5", link: "rgba(24,95,165,0.35)"  },
  "Father Only":    { node: "#6d1111", link: "rgba(109,17,17,0.35)"  },
  "Neither Parent": { node: "#888780", link: "rgba(136,135,128,0.35)"},
};
const fallback = { node: "#888780", link: "rgba(136,135,128,0.25)" };

const isDark = matchMedia("(prefers-color-scheme: dark)").matches;

const layout = {
    title: {
        text: "Ancestral and Parental Inheritence to Genetic Disorder",
        x: 0
    },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor:  "rgba(0,0,0,0)",
  font: { size: 12, color: isDark ? "#d1d0ca" : "#2C2C2A", family: "sans-serif" },
  margin: { l: 10, r: 10, t: 40, b: 10 },
};

const config = { displayModeBar: false, responsive: true };

function parseLinksCSV(text) {
  const lines = text.trim().split("\n");
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    return {
      source:      cols[1].trim(),
      target:      cols[2].trim(),
      value:       +cols[3],
      a_origin_id: cols[4].trim(),
      origin_id:   cols[5].trim(),
    };
  });
}

function parseParentalCSV(text) {
  const lines = text.trim().split("\n");
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    return {
      source:    cols[1].trim(),
      target:    cols[2].trim(),
      value:     +cols[3],
      origin_id: cols[4].trim(),
    };
  });
}

function dedupe(links) {
  const map = {};
  links.forEach(({ s, t, v, origin }) => {
    const k = `${s}||${t}||${origin}`;
    if (!map[k]) map[k] = { s, t, v: 0, origin };
    map[k].v += v;
  });
  return Object.values(map);
}

// ── "All levels" trace (from links.csv) ──────────────────────────────────────
function buildAllTrace(rawData) {
  const links = [];
  // Tier 1: ancestral → parental (origin_id blank)
  rawData.filter(r => r.origin_id === "").forEach(r =>
    links.push({ s: r.a_origin_id, t: r.target, v: r.value, origin: r.a_origin_id })
  );
  // Tiers 2 & 3: parental → disorder → subclass
  rawData.filter(r => r.origin_id !== "").forEach(r =>
    links.push({ s: r.source, t: r.target, v: r.value, origin: r.a_origin_id })
  );
  return buildSankeyTrace(links);
}

function buildParentalTrace(parentalData) {
  // origin_id is the parental node
  const links = parentalData.map(r => ({
    s: r.source, t: r.target, v: r.value, origin: r.origin_id,
  }));
  return buildSankeyTrace(links);
}

function buildSankeyTrace(links) {
  const dedupedLinks = dedupe(links);

  const nodeSet = [];
  const nodeIndex = {};
  dedupedLinks.forEach(({ s, t }) => {
    [s, t].forEach(n => {
      if (!(n in nodeIndex)) { nodeIndex[n] = nodeSet.length; nodeSet.push(n); }
    });
  });

  // Color each node by the origin that contributes the most flow through it.
  const totals = {};
  dedupedLinks.forEach(({ s, t, v, origin }) => {
    [s, t].forEach(n => {
      if (!totals[n]) totals[n] = {};
      totals[n][origin] = (totals[n][origin] || 0) + v;
    });
  });

  function nodeColor(n) {
    if (originColors[n]) return originColors[n].node;
    if (totals[n]) {
      const dominant = Object.entries(totals[n]).sort((a, b) => b[1] - a[1])[0][0];
      return (originColors[dominant] || fallback).node;
    }
    return fallback.node;
  }

  return {
    type: "sankey",
    arrangement: "snap",
    node: {
      label:     nodeSet,
      color:     nodeSet.map(n => nodeColor(n)),
      pad:       20,
      thickness: 15,
      line:      { color: "rgba(0,0,0,0)", width: 0 },
    },
    link: {
      source: dedupedLinks.map(l => nodeIndex[l.s]),
      target: dedupedLinks.map(l => nodeIndex[l.t]),
      value:  dedupedLinks.map(l => l.v),
      color:  dedupedLinks.map(l => (originColors[l.origin] || fallback).link),
    },
  };
}


Promise.all([
  fetch("links.csv").then(r => r.text()),
  fetch("parental_mode_data.csv").then(r => r.text()),
]).then(([linksText, parentalText]) => {
  const rawData      = parseLinksCSV(linksText);
  const parentalData = parseParentalCSV(parentalText);

  Plotly.newPlot("sankey", [buildAllTrace(rawData)], layout, config);

  document.getElementById("sankeyMode").addEventListener("change", e => {
    const trace = e.target.value === "parental"
      ? buildParentalTrace(parentalData)
      : buildAllTrace(rawData);
    Plotly.react("sankey", [trace], layout, config);
  });
});
