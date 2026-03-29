// Config
const TREE_CSV = "tree_data.csv";
const TREE_COLORS = {
  "Both":     "#534AB7",
  "Maternal": "#185FA5",
  "Paternal": "#6d1111",
  "Neither":  "#888780",
  "Mother":   "#185FA5",
  "Father":   "#6d1111"
};
const DISORDER_COLORS = {
  "Mitochondrial genetic inheritance disorders":  "#378ADD",
  "Single-gene inheritance diseases":             "#E24B4A",
  "Multifactorial genetic inheritance disorders":  "#5EAD5E"
};
const DEFAULT_COLOR = "#999";

// Dimensions
const treeMargin = { top: 40, right: 40, bottom: 40, left: 120 };
const treeWidth  = 750 - treeMargin.left - treeMargin.right;
const treeHeight = 440 - treeMargin.top  - treeMargin.bottom;

// SVG setup
const treeContainer = d3.select("#tree-chart");
treeContainer.select(".placeholder-text").remove();

const treeSvg = treeContainer
  .append("svg")
  .attr("width",  treeWidth  + treeMargin.left + treeMargin.right)
  .attr("height", treeHeight + treeMargin.top  + treeMargin.bottom)
  .append("g")
  .attr("transform", `translate(${treeMargin.left},${treeMargin.top})`);

// Tooltip
const treeTooltip = d3.select("body")
  .append("div")
  .style("position", "absolute")
  .style("background", "#fff")
  .style("border", "1px solid #ccc")
  .style("border-radius", "6px")
  .style("padding", "8px 12px")
  .style("font-size", "0.82rem")
  .style("font-family", "'Source Sans 3', sans-serif")
  .style("pointer-events", "none")
  .style("box-shadow", "0 2px 6px rgba(0,0,0,0.15)")
  .style("opacity", 0);

// State
let fullTreeData = null;
let currentRoot  = null;
let navigationStack = [];

// Build the hierarchy from flat CSV rows
function buildHierarchy(rows) {
  let root = { name: "All Patients", children: [] };

  // Group by inheritance_side
  let sides = d3.group(rows, d => d.inheritance_side);
  sides.forEach((sideRows, sideName) => {
    let sideNode = { name: sideName, children: [], _count: d3.sum(sideRows, d => d.count) };

    // Group by gene_source
    let sources = d3.group(sideRows, d => d.gene_source);
    sources.forEach((sourceRows, sourceName) => {
      let sourceNode = { name: sourceName, children: [], _count: d3.sum(sourceRows, d => d.count) };

      // Group by disorder_type
      let disorders = d3.group(sourceRows, d => d.disorder_type);
      disorders.forEach((disorderRows, disorderName) => {
        let disorderNode = { name: disorderName, children: [], _count: d3.sum(disorderRows, d => d.count) };

        // Subclasses as leaf nodes
        disorderRows.forEach(row => {
          disorderNode.children.push({
            name: row.disorder_subclass,
            _count: row.count
          });
        });

        sourceNode.children.push(disorderNode);
      });

      sideNode.children.push(sourceNode);
    });

    root.children.push(sideNode);
  });

  root._count = d3.sum(rows, d => d.count);
  return root;
}

// Get color for a node based on its position in the tree
function getNodeColor(d) {
  // Check if this node name is an inheritance side or gene source
  if (TREE_COLORS[d.data.name]) return TREE_COLORS[d.data.name];

  // Check if this node is a disorder type
  if (DISORDER_COLORS[d.data.name]) return DISORDER_COLORS[d.data.name];

  // For root node
  if (!d.parent) return "#1a1a2e";

  // For subclass nodes, use their parent disorder type color
  if (d.parent && DISORDER_COLORS[d.parent.data.name]) return DISORDER_COLORS[d.parent.data.name];

  // Walk up to find the nearest known color
  let node = d.parent;
  while (node) {
    if (DISORDER_COLORS[node.data.name]) return DISORDER_COLORS[node.data.name];
    if (TREE_COLORS[node.data.name]) return TREE_COLORS[node.data.name];
    node = node.parent;
  }

  return DEFAULT_COLOR;
}

// Determine which nodes to show based on current zoom depth
function getVisibleTree(rootData, depth) {
  // Deep copy to avoid mutating original
  function cloneToDepth(node, currentDepth, maxDepth) {
    let cloned = { name: node.name, _count: node._count };

    if (node.children && currentDepth < maxDepth) {
      cloned.children = node.children.map(child =>
        cloneToDepth(child, currentDepth + 1, maxDepth)
      );
    }

    return cloned;
  }

  return cloneToDepth(rootData, 0, depth);
}

// Calculate what depth to show (subclasses only when zoomed in enough)
function getMaxDepth(stackLength) {
  // At top level (stack 0), show 3 levels: root -> side -> source -> disorder
  // When zoomed in (stack >= 1), show subclasses too
  if (stackLength >= 1) return 4;
  return 3;
}

// Size scale for circles
const radiusScale = d3.scaleSqrt().range([5, 28]);

// Draw the tree
function drawTree(rootData, animate) {
  let maxDepth = getMaxDepth(navigationStack.length);
  let visibleData = getVisibleTree(rootData, maxDepth);

  let hierarchy = d3.hierarchy(visibleData);

  // Update radius scale based on current data
  let allCounts = [];
  hierarchy.each(d => { if (d.data._count) allCounts.push(d.data._count); });
  radiusScale.domain([d3.min(allCounts) || 1, d3.max(allCounts) || 1]);

  // Create tree layout
  let treeLayout = d3.tree().size([treeWidth, treeHeight - 40]);
  treeLayout(hierarchy);

  // Clear previous content
  treeSvg.selectAll("*").remove();

  // Level labels on the left side
  // Determine which labels to show based on current root's position in full tree
  let allLabels = ["", "Family History", "Gene Source", "Disorder Type", "Subclass"];
  let rootDepthInFullTree = navigationStack.length;
  let levelYPositions = {};
  hierarchy.each(d => { levelYPositions[d.depth] = d.y; });

  Object.keys(levelYPositions).forEach(depth => {
    let labelIndex = parseInt(depth) + rootDepthInFullTree;
    let label = allLabels[labelIndex];
    if (!label) return;

    treeSvg.append("text")
      .attr("x", -treeMargin.left + 10)
      .attr("y", levelYPositions[depth])
      .attr("dy", "0.35em")
      .style("font-size", "10px")
      .style("font-family", "monospace")
      .style("text-transform", "uppercase")
      .style("letter-spacing", "0.07em")
      .style("fill", "#999")
      .text(label);
  });

  // Click outside background (invisible rect)
  treeSvg.append("rect")
    .attr("width", treeWidth)
    .attr("height", treeHeight)
    .attr("fill", "transparent")
    .style("cursor", navigationStack.length > 0 ? "pointer" : "default")
    .on("click", function() {
      if (navigationStack.length > 0) {
        goUpOneLevel();
      }
    });

  // Draw links
  let links = treeSvg.selectAll(".tree-link")
    .data(hierarchy.links())
    .enter()
    .append("line")
    .attr("class", "tree-link")
    .attr("stroke", "#ccc")
    .attr("stroke-width", 1.5);

  if (animate) {
    links
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.source.x).attr("y2", d => d.source.y)
      .transition().duration(500)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
  } else {
    links
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
  }

  // Draw nodes
  let nodes = treeSvg.selectAll(".tree-node")
    .data(hierarchy.descendants())
    .enter()
    .append("g")
    .attr("class", "tree-node")
    .attr("transform", d => {
      if (animate) return `translate(${d.x},${d.parent ? d.parent.y : d.y})`;
      return `translate(${d.x},${d.y})`;
    })
    .style("cursor", d => d.children ? "pointer" : "default");

  if (animate) {
    nodes.transition().duration(500)
      .attr("transform", d => `translate(${d.x},${d.y})`);
  }

  // Node circles
  nodes.append("circle")
    .attr("r", d => radiusScale(d.data._count || 1))
    .attr("fill", d => getNodeColor(d))
    .attr("fill-opacity", 0.8)
    .attr("stroke", d => d3.color(getNodeColor(d)).darker(0.5))
    .attr("stroke-width", 1.5);

  // Node labels (only show for first 3 levels from current root)
  nodes.append("text")
    .attr("dy", d => -radiusScale(d.data._count || 1) - 6)
    .attr("text-anchor", "middle")
    .style("font-size", "11px")
    .style("font-family", "'Source Sans 3', sans-serif")
    .style("fill", "#333")
    .style("display", d => d.depth < 3 ? "block" : "none")
    .text(d => {
      let name = d.data.name;
      // Shorten long disorder names
      if (name === "Mitochondrial genetic inheritance disorders") return "Mitochondrial";
      if (name === "Single-gene inheritance diseases") return "Single-gene";
      if (name === "Multifactorial genetic inheritance disorders") return "Multifactorial";
      if (name === "Leber's hereditary optic neuropathy") return "Leber's";
      return name;
    });

  // Click handler for zooming in
  nodes.on("click", function(event, d) {
    event.stopPropagation();

    // Only zoom if the node has children
    if (!d.data.children || d.data.children.length === 0) return;

    // Find the matching node in the full data
    let targetData = findNodeInData(currentRoot, d.data.name, getNodePath(d));
    if (targetData && targetData.children && targetData.children.length > 0) {
      navigationStack.push(currentRoot);
      currentRoot = targetData;
      drawTree(currentRoot, true);
    }
  });

  // Hover handlers
  nodes.on("mouseenter", function(event, d) {
    let count = d.data._count || 0;
    let parentCount = d.parent ? (d.parent.data._count || 0) : 0;
    let pct = parentCount > 0 ? ((count / parentCount) * 100).toFixed(1) : null;

    let html = "<strong>" + d.data.name + "</strong><br>Patients: " + count.toLocaleString();
    if (pct !== null && d.parent) {
      html += "<br>" + pct + "% of " + d.parent.data.name;
    }

    treeTooltip
      .html(html)
      .style("left", (event.pageX + 12) + "px")
      .style("top",  (event.pageY - 10) + "px")
      .style("opacity", 1);

    d3.select(this).select("circle")
      .attr("fill-opacity", 1)
      .attr("stroke-width", 2.5);
  })
  .on("mouseleave", function() {
    treeTooltip.style("opacity", 0);

    d3.select(this).select("circle")
      .attr("fill-opacity", 0.8)
      .attr("stroke-width", 1.5);
  });
}

// Get the path of names from root to a node
function getNodePath(d) {
  let path = [];
  let node = d;
  while (node) {
    path.unshift(node.data.name);
    node = node.parent;
  }
  return path;
}

// Find a node in the raw data tree by matching the full path
function findNodeInData(dataNode, targetName, targetPath) {
  // Walk the path from index 1 (skip root since we start from currentRoot)
  let node = dataNode;
  for (let i = 1; i < targetPath.length; i++) {
    if (!node.children) return null;
    let next = node.children.find(c => c.name === targetPath[i]);
    if (!next) return null;
    node = next;
  }
  return node;
}

// Navigate up one level
function goUpOneLevel() {
  if (navigationStack.length > 0) {
    currentRoot = navigationStack.pop();
    drawTree(currentRoot, true);
  }
}

// Load data and initialize
fetch(TREE_CSV)
  .then(r => r.text())
  .then(text => {
    let rows = d3.csvParse(text, d => ({
      inheritance_side:  d.inheritance_side,
      gene_source:       d.gene_source,
      disorder_type:     d.disorder_type,
      disorder_subclass: d.disorder_subclass,
      count:             +d.count
    }));

    fullTreeData = buildHierarchy(rows);
    currentRoot  = fullTreeData;
    drawTree(currentRoot, false);
  });
